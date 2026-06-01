import { and, eq, inArray, asc } from 'drizzle-orm';
import { db } from './db/index';
import { foods, foodNutrients, foodUnits, diaryEntries, mealGroups, nutrients } from './db/schema';
import { mealGroupVisibleOn } from './mealgroups';

export type DiaryEntryView = {
  id: number;
  foodId: number;
  foodName: string;
  brand: string | null;
  amount: number;
  unitId: number | null;
  unitLabel: string; // e.g. "200 g" or "1 × serving"
  grams: number;
  mealGroupId: number | null;
  // nutrientId -> contribution for this entry
  nutrients: Record<number, number>;
  energy: number | null;
};

export type DayView = {
  entries: DiaryEntryView[];
  // nutrientId -> day total (missing values contribute 0)
  totals: Record<number, number>;
};

/** Resolve an amount in some unit to grams. unitGrams null = the unit is grams. */
export function toGrams(amount: number, unitGrams: number | null): number {
  return amount * (unitGrams ?? 1);
}

function energyNutrientId(): number | null {
  const row = db.select({ id: nutrients.id }).from(nutrients).where(eq(nutrients.key, 'energy')).get();
  return row?.id ?? null;
}

/** All entries for a user's day, with per-entry nutrient contributions + day totals. */
export function getDay(userId: number, date: string): DayView {
  const rows = db
    .select({
      id: diaryEntries.id,
      foodId: diaryEntries.foodId,
      amount: diaryEntries.amount,
      unitId: diaryEntries.unitId,
      mealGroupId: diaryEntries.mealGroupId,
      sortOrder: diaryEntries.sortOrder,
      createdAt: diaryEntries.createdAt,
      foodName: foods.name,
      brand: foods.brand,
      unitName: foodUnits.name,
      unitGrams: foodUnits.grams
    })
    .from(diaryEntries)
    .innerJoin(foods, eq(diaryEntries.foodId, foods.id))
    .leftJoin(foodUnits, eq(diaryEntries.unitId, foodUnits.id))
    .where(and(eq(diaryEntries.userId, userId), eq(diaryEntries.date, date)))
    .orderBy(asc(diaryEntries.sortOrder), asc(diaryEntries.createdAt), asc(diaryEntries.id))
    .all();

  const energyId = energyNutrientId();
  const totals: Record<number, number> = {};

  if (rows.length === 0) return { entries: [], totals };

  // Per-100g nutrients for every food referenced today (one query).
  const foodIds = [...new Set(rows.map((r) => r.foodId))];
  const nutrientRows = db
    .select()
    .from(foodNutrients)
    .where(inArray(foodNutrients.foodId, foodIds))
    .all();
  const per100ByFood = new Map<number, Record<number, number>>();
  for (const n of nutrientRows) {
    if (n.per100g === null) continue;
    const m = per100ByFood.get(n.foodId) ?? {};
    m[n.nutrientId] = n.per100g;
    per100ByFood.set(n.foodId, m);
  }

  const entries: DiaryEntryView[] = rows.map((r) => {
    const grams = toGrams(r.amount, r.unitGrams ?? null);
    const per100 = per100ByFood.get(r.foodId) ?? {};
    const contrib: Record<number, number> = {};
    for (const [nid, v] of Object.entries(per100)) {
      const amount = (v * grams) / 100;
      contrib[Number(nid)] = amount;
      totals[Number(nid)] = (totals[Number(nid)] ?? 0) + amount;
    }
    const unitLabel = r.unitId
      ? `${formatAmount(r.amount)} × ${r.unitName}`
      : `${formatAmount(r.amount)} g`;
    return {
      id: r.id,
      foodId: r.foodId,
      foodName: r.foodName,
      brand: r.brand,
      amount: r.amount,
      unitId: r.unitId,
      unitLabel,
      grams,
      mealGroupId: r.mealGroupId,
      nutrients: contrib,
      energy: energyId !== null ? (contrib[energyId] ?? 0) : null
    };
  });

  return { entries, totals };
}

function formatAmount(n: number): string {
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/** Validate that a unit (if given) belongs to the food. Returns grams or null. */
function unitGramsForFood(foodId: number, unitId: number | null): { ok: boolean; grams: number | null } {
  if (unitId === null) return { ok: true, grams: null };
  const u = db
    .select({ grams: foodUnits.grams })
    .from(foodUnits)
    .where(and(eq(foodUnits.id, unitId), eq(foodUnits.foodId, foodId)))
    .get();
  return u ? { ok: true, grams: u.grams } : { ok: false, grams: null };
}

/** A food is loggable by the user if they own it, or it's a shared cache food. */
function foodLoggable(userId: number, foodId: number): boolean {
  const f = db.select({ owner: foods.ownerUserId }).from(foods).where(eq(foods.id, foodId)).get();
  if (!f) return false;
  return f.owner === null || f.owner === userId;
}

export type EntryInput = { foodId: number; amount: number; unitId: number | null };

/** null meal group is fine; otherwise it must be visible on that day. */
function mealGroupValid(userId: number, mealGroupId: number | null, date: string): boolean {
  return mealGroupId === null || mealGroupVisibleOn(userId, mealGroupId, date);
}

/** Add a diary entry. Returns the new id, or null on validation failure. */
export function addEntry(
  userId: number,
  date: string,
  input: EntryInput,
  mealGroupId: number | null = null
): number | null {
  if (!(input.amount > 0)) return null;
  if (!foodLoggable(userId, input.foodId)) return null;
  const { ok } = unitGramsForFood(input.foodId, input.unitId);
  if (!ok) return null;
  if (!mealGroupValid(userId, mealGroupId, date)) return null;

  const inserted = db
    .insert(diaryEntries)
    .values({
      userId,
      date,
      foodId: input.foodId,
      amount: input.amount,
      unitId: input.unitId,
      mealGroupId
    })
    .returning({ id: diaryEntries.id })
    .get();
  return inserted.id;
}

/** Update an entry's amount/unit and meal group (must belong to the user). */
export function updateEntry(
  userId: number,
  id: number,
  amount: number,
  unitId: number | null,
  mealGroupId: number | null
): boolean {
  const entry = db
    .select({ foodId: diaryEntries.foodId, date: diaryEntries.date })
    .from(diaryEntries)
    .where(and(eq(diaryEntries.id, id), eq(diaryEntries.userId, userId)))
    .get();
  if (!entry) return false;
  if (!(amount > 0)) return false;
  const { ok } = unitGramsForFood(entry.foodId, unitId);
  if (!ok) return false;
  if (!mealGroupValid(userId, mealGroupId, entry.date)) return false;

  db.update(diaryEntries).set({ amount, unitId, mealGroupId }).where(eq(diaryEntries.id, id)).run();
  return true;
}

/**
 * Persist a drag-reorder of entries. `items` is the full desired arrangement in
 * visual order (meal by meal); each row's array index becomes its `sortOrder`
 * and `mealGroupId` records the meal it now sits in (cross-meal moves). Entries
 * not owned by the user are skipped; an unknown/foreign meal id falls back to
 * null (the default "Log" bucket) rather than leaking another user's group.
 */
export function reorderEntries(
  userId: number,
  items: { id: number; mealGroupId: number | null }[]
): void {
  if (items.length === 0) return;
  const ids = items.map((i) => i.id);
  const owned = new Set(
    db
      .select({ id: diaryEntries.id })
      .from(diaryEntries)
      .where(and(eq(diaryEntries.userId, userId), inArray(diaryEntries.id, ids)))
      .all()
      .map((r) => r.id)
  );
  const userMeals = new Set(
    db
      .select({ id: mealGroups.id })
      .from(mealGroups)
      .where(eq(mealGroups.userId, userId))
      .all()
      .map((m) => m.id)
  );
  items.forEach((it, i) => {
    if (!owned.has(it.id)) return;
    const meal = it.mealGroupId !== null && userMeals.has(it.mealGroupId) ? it.mealGroupId : null;
    db.update(diaryEntries).set({ sortOrder: i, mealGroupId: meal }).where(eq(diaryEntries.id, it.id)).run();
  });
}

/** Delete an entry (must belong to the user). */
export function deleteEntry(userId: number, id: number): boolean {
  const res = db
    .delete(diaryEntries)
    .where(and(eq(diaryEntries.id, id), eq(diaryEntries.userId, userId)))
    .run();
  return res.changes > 0;
}
