import { and, eq, lte, gt, or, isNull, asc } from 'drizzle-orm';
import { db } from './db/index';
import { mealGroups } from './db/schema';
import type { MealGroup } from './db/schema';

/**
 * Meals are effective-dated (DESIGN.md §4, like goals): a meal is visible on
 * day D when effective_from <= D < (removed_from ?? ∞). Removing a meal sets
 * removed_from = today, so past days keep the meal and its entries.
 */

/** A user's meals visible on `date`, in display order. */
export function listMealGroups(userId: number, date: string): MealGroup[] {
  return db
    .select()
    .from(mealGroups)
    .where(
      and(
        eq(mealGroups.userId, userId),
        lte(mealGroups.effectiveFrom, date),
        or(isNull(mealGroups.removedFrom), gt(mealGroups.removedFrom, date))
      )
    )
    .orderBy(asc(mealGroups.sortOrder), asc(mealGroups.id))
    .all();
}

/** True if the meal exists, belongs to the user, and is visible on `date`. */
export function mealGroupVisibleOn(userId: number, id: number, date: string): boolean {
  return !!db
    .select({ id: mealGroups.id })
    .from(mealGroups)
    .where(
      and(
        eq(mealGroups.id, id),
        eq(mealGroups.userId, userId),
        lte(mealGroups.effectiveFrom, date),
        or(isNull(mealGroups.removedFrom), gt(mealGroups.removedFrom, date))
      )
    )
    .get();
}

/** Create a meal effective `today`, appended to the end. Returns id (or null). */
export function createMealGroup(userId: number, name: string, today: string): number | null {
  const trimmed = name.trim();
  if (!trimmed) return null;
  const rows = db
    .select({ sortOrder: mealGroups.sortOrder })
    .from(mealGroups)
    .where(eq(mealGroups.userId, userId))
    .all();
  const nextOrder = rows.length ? Math.max(...rows.map((r) => r.sortOrder)) + 1 : 0;
  const inserted = db
    .insert(mealGroups)
    .values({ userId, name: trimmed, sortOrder: nextOrder, effectiveFrom: today, removedFrom: null })
    .returning({ id: mealGroups.id })
    .get();
  return inserted.id;
}

/** Rename a meal (applies across its whole history). */
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

/**
 * Soft-remove a meal from `today` forward. Past days keep it (and its entries).
 * If it was created today (never had a past), it becomes invisible everywhere.
 */
export function removeMealGroup(userId: number, id: number, today: string): boolean {
  const res = db
    .update(mealGroups)
    .set({ removedFrom: today })
    .where(and(eq(mealGroups.id, id), eq(mealGroups.userId, userId)))
    .run();
  return res.changes > 0;
}

/** Persist a new meal order (ids in desired sequence). Order is global. */
export function reorderMealGroups(userId: number, order: number[]): void {
  order.forEach((id, i) => {
    db.update(mealGroups)
      .set({ sortOrder: i })
      .where(and(eq(mealGroups.id, id), eq(mealGroups.userId, userId)))
      .run();
  });
}
