import { db } from './index';
import { nutrients, users, diaryEntries } from './schema';
import { hashPassword } from '../auth/password';
import { findOrCreateLogMeal } from '../mealgroups';
import { eq, and, isNull, sql } from 'drizzle-orm';

/** Default nutrient catalog (DESIGN.md §3). `key` is the stable machine id. */
export const DEFAULT_NUTRIENTS: { key: string; name: string; unit: string }[] = [
  { key: 'energy', name: 'Energy', unit: 'kcal' },
  { key: 'protein', name: 'Protein', unit: 'g' },
  { key: 'carbs', name: 'Carbohydrates', unit: 'g' },
  { key: 'sugars', name: 'Sugars', unit: 'g' },
  { key: 'fat', name: 'Fat', unit: 'g' },
  { key: 'saturates', name: 'Saturated fat', unit: 'g' },
  { key: 'fiber', name: 'Fiber', unit: 'g' },
  // Salt (EU label convention). Salt = sodium × 2.5; we track one, not both.
  { key: 'salt', name: 'Salt', unit: 'g' }
];

/** Idempotent seed: nutrient catalog + a single admin user if none exists. */
export async function seed() {
  // Nutrient catalog — insert any missing keys, preserve existing ids.
  DEFAULT_NUTRIENTS.forEach((n, i) => {
    db.insert(nutrients)
      .values({ ...n, sortOrder: i })
      .onConflictDoNothing({ target: nutrients.key })
      .run();
  });

  // Seed admin only when there are no users at all.
  const [{ count }] = db.select({ count: sql<number>`count(*)` }).from(users).all();
  if (count === 0) {
    const email = process.env.ADMIN_EMAIL ?? 'admin@example.com';
    const password = process.env.ADMIN_PASSWORD ?? 'change-me';
    const passwordHash = await hashPassword(password);
    db.insert(users)
      .values({ email, name: 'Admin', passwordHash, isAdmin: true })
      .run();
    console.log(`[seed] created admin user: ${email}`);
  }

  // One-time: move legacy un-mealed entries into each user's 'Log' meal, so
  // every entry belongs to a real meal. Idempotent (no nulls remain after).
  const orphanUsers = db
    .selectDistinct({ userId: diaryEntries.userId })
    .from(diaryEntries)
    .where(isNull(diaryEntries.mealGroupId))
    .all();
  for (const { userId } of orphanUsers) {
    const logId = findOrCreateLogMeal(userId);
    db.update(diaryEntries)
      .set({ mealGroupId: logId })
      .where(and(eq(diaryEntries.userId, userId), isNull(diaryEntries.mealGroupId)))
      .run();
  }
  if (orphanUsers.length) console.log(`[seed] migrated un-mealed entries for ${orphanUsers.length} user(s)`);
}

/** Look up a nutrient id by key (used by importers/tests). */
export function nutrientIdByKey(key: string): number | undefined {
  const row = db.select({ id: nutrients.id }).from(nutrients).where(eq(nutrients.key, key)).get();
  return row?.id;
}
