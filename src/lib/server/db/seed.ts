import { db } from './index';
import { nutrients, users } from './schema';
import { hashPassword } from '../auth/password';
import { eq, sql } from 'drizzle-orm';

/** Default nutrient catalog (DESIGN.md §3). `key` is the stable machine id. */
export const DEFAULT_NUTRIENTS: { key: string; name: string; unit: string }[] = [
  { key: 'energy', name: 'Energy', unit: 'kcal' },
  { key: 'protein', name: 'Protein', unit: 'g' },
  { key: 'carbs', name: 'Carbohydrates', unit: 'g' },
  { key: 'sugars', name: 'Sugars', unit: 'g' },
  { key: 'fat', name: 'Fat', unit: 'g' },
  { key: 'saturates', name: 'Saturated fat', unit: 'g' },
  { key: 'fiber', name: 'Fiber', unit: 'g' },
  { key: 'sodium', name: 'Sodium', unit: 'mg' },
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
}

/** Look up a nutrient id by key (used by importers/tests). */
export function nutrientIdByKey(key: string): number | undefined {
  const row = db.select({ id: nutrients.id }).from(nutrients).where(eq(nutrients.key, key)).get();
  return row?.id;
}
