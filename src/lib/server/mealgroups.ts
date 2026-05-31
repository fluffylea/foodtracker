import { and, eq, asc } from 'drizzle-orm';
import { db } from './db/index';
import { mealGroups } from './db/schema';
import type { MealGroup } from './db/schema';

/** A user's meal groups, in display order. */
export function listMealGroups(userId: number): MealGroup[] {
  return db
    .select()
    .from(mealGroups)
    .where(eq(mealGroups.userId, userId))
    .orderBy(asc(mealGroups.sortOrder), asc(mealGroups.id))
    .all();
}

/** True if the meal group exists and belongs to the user. */
export function mealGroupOwned(userId: number, id: number): boolean {
  return !!db
    .select({ id: mealGroups.id })
    .from(mealGroups)
    .where(and(eq(mealGroups.id, id), eq(mealGroups.userId, userId)))
    .get();
}

/** Create a meal group, appended to the end. Returns the new id (or null). */
export function createMealGroup(userId: number, name: string): number | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const last = db
    .select({ sortOrder: mealGroups.sortOrder })
    .from(mealGroups)
    .where(eq(mealGroups.userId, userId))
    .orderBy(asc(mealGroups.sortOrder))
    .all();
  const nextOrder = last.length ? Math.max(...last.map((l) => l.sortOrder)) + 1 : 0;
  const inserted = db
    .insert(mealGroups)
    .values({ userId, name: trimmed, sortOrder: nextOrder })
    .returning({ id: mealGroups.id })
    .get();
  return inserted.id;
}

export function renameMealGroup(userId: number, id: number, name: string): boolean {
  const trimmed = name.trim();
  if (!trimmed) return false;
  const res = db
    .update(mealGroups)
    .set({ name: trimmed })
    .where(and(eq(mealGroups.id, id), eq(mealGroups.userId, userId)))
    .run();
  return res.changes > 0;
}

/** Delete a meal group; its entries fall back to unsorted (FK set null). */
export function deleteMealGroup(userId: number, id: number): boolean {
  const res = db
    .delete(mealGroups)
    .where(and(eq(mealGroups.id, id), eq(mealGroups.userId, userId)))
    .run();
  return res.changes > 0;
}

/** Persist a new meal order (ids in desired sequence). */
export function reorderMealGroups(userId: number, order: number[]): void {
  order.forEach((id, i) => {
    db.update(mealGroups)
      .set({ sortOrder: i })
      .where(and(eq(mealGroups.id, id), eq(mealGroups.userId, userId)))
      .run();
  });
}
