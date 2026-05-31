import { and, or, eq, isNull, inArray, asc } from 'drizzle-orm';
import { db } from './db/index';
import { foods, foodNutrients, foodUnits, nutrients } from './db/schema';

export type FoodListItem = {
  id: number;
  name: string;
  brand: string | null;
  source: 'off' | 'local';
  kind: 'item' | 'recipe';
  energyPer100g: number | null;
  unitNames: string[];
};

export type FoodDetail = {
  id: number;
  name: string;
  brand: string | null;
  source: 'off' | 'local';
  kind: 'item' | 'recipe';
  originRef: string | null;
  // nutrientId -> per-100g value (or null = unknown)
  nutrients: Record<number, number | null>;
  units: { id: number; name: string; grams: number; isDefault: boolean }[];
};

export type FoodInput = {
  name: string;
  brand: string | null;
  // nutrientId -> per-100g value; null/absent = unknown
  nutrients: Record<number, number | null>;
  units: { name: string; grams: number; isDefault: boolean }[];
};

/** The global nutrient catalog, ordered for display. */
export function nutrientCatalog() {
  return db.select().from(nutrients).orderBy(asc(nutrients.sortOrder), asc(nutrients.id)).all();
}

/** A user's local foods with an energy + units summary for the list view. */
export function listFoods(userId: number): FoodListItem[] {
  const rows = db
    .select()
    .from(foods)
    .where(eq(foods.ownerUserId, userId))
    .orderBy(asc(foods.name))
    .all();
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);

  // Energy per food (one query).
  const energy = db
    .select({ foodId: foodNutrients.foodId, per100g: foodNutrients.per100g })
    .from(foodNutrients)
    .innerJoin(nutrients, eq(foodNutrients.nutrientId, nutrients.id))
    .where(and(inArray(foodNutrients.foodId, ids), eq(nutrients.key, 'energy')))
    .all();
  const energyByFood = new Map(energy.map((e) => [e.foodId, e.per100g]));

  // Unit names per food (one query).
  const units = db
    .select({ foodId: foodUnits.foodId, name: foodUnits.name })
    .from(foodUnits)
    .where(inArray(foodUnits.foodId, ids))
    .orderBy(asc(foodUnits.id))
    .all();
  const unitsByFood = new Map<number, string[]>();
  for (const u of units) {
    const list = unitsByFood.get(u.foodId) ?? [];
    list.push(u.name);
    unitsByFood.set(u.foodId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    brand: r.brand,
    source: r.source,
    kind: r.kind,
    energyPer100g: energyByFood.get(r.id) ?? null,
    unitNames: unitsByFood.get(r.id) ?? []
  }));
}

export type PickerFood = {
  id: number;
  name: string;
  brand: string | null;
  source: 'off' | 'local';
  energyPer100g: number | null;
  units: { id: number; name: string; grams: number; isDefault: boolean }[];
};

/**
 * Compact list for the add-food picker: each food with its units (id+grams,
 * for the unit dropdown and gram math) and energy (for a kcal preview).
 * Includes the user's local foods and shared cache foods (owner = NULL).
 */
export function listFoodsForPicker(userId: number): PickerFood[] {
  const rows = db
    .select()
    .from(foods)
    .where(or(eq(foods.ownerUserId, userId), isNull(foods.ownerUserId)))
    .orderBy(asc(foods.name))
    .all();
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.id);
  const energy = db
    .select({ foodId: foodNutrients.foodId, per100g: foodNutrients.per100g })
    .from(foodNutrients)
    .innerJoin(nutrients, eq(foodNutrients.nutrientId, nutrients.id))
    .where(and(inArray(foodNutrients.foodId, ids), eq(nutrients.key, 'energy')))
    .all();
  const energyByFood = new Map(energy.map((e) => [e.foodId, e.per100g]));

  const unitRows = db
    .select()
    .from(foodUnits)
    .where(inArray(foodUnits.foodId, ids))
    .orderBy(asc(foodUnits.id))
    .all();
  const unitsByFood = new Map<number, PickerFood['units']>();
  for (const u of unitRows) {
    const list = unitsByFood.get(u.foodId) ?? [];
    list.push({ id: u.id, name: u.name, grams: u.grams, isDefault: u.isDefault });
    unitsByFood.set(u.foodId, list);
  }

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    brand: r.brand,
    source: r.source,
    energyPer100g: energyByFood.get(r.id) ?? null,
    units: unitsByFood.get(r.id) ?? []
  }));
}

/** Full detail for one food owned by the user, or null. */
export function getFood(userId: number, id: number): FoodDetail | null {
  const food = db
    .select()
    .from(foods)
    .where(and(eq(foods.id, id), eq(foods.ownerUserId, userId)))
    .get();
  if (!food) return null;

  const nutrientRows = db
    .select()
    .from(foodNutrients)
    .where(eq(foodNutrients.foodId, id))
    .all();
  const nutrientMap: Record<number, number | null> = {};
  for (const n of nutrientRows) nutrientMap[n.nutrientId] = n.per100g;

  const unitRows = db
    .select()
    .from(foodUnits)
    .where(eq(foodUnits.foodId, id))
    .orderBy(asc(foodUnits.id))
    .all();

  return {
    id: food.id,
    name: food.name,
    brand: food.brand,
    source: food.source,
    kind: food.kind,
    originRef: food.originRef,
    nutrients: nutrientMap,
    units: unitRows.map((u) => ({ id: u.id, name: u.name, grams: u.grams, isDefault: u.isDefault }))
  };
}

/** Write nutrient + unit rows for a food (used by create & update). */
function writeNutrientsAndUnits(foodId: number, input: FoodInput) {
  db.delete(foodNutrients).where(eq(foodNutrients.foodId, foodId)).run();
  const nutrientValues = Object.entries(input.nutrients)
    .filter(([, v]) => v !== null && v !== undefined && !Number.isNaN(v))
    .map(([nutrientId, v]) => ({ foodId, nutrientId: Number(nutrientId), per100g: v as number }));
  if (nutrientValues.length > 0) db.insert(foodNutrients).values(nutrientValues).run();

  db.delete(foodUnits).where(eq(foodUnits.foodId, foodId)).run();
  if (input.units.length > 0) {
    db.insert(foodUnits)
      .values(input.units.map((u) => ({ foodId, name: u.name, grams: u.grams, isDefault: u.isDefault })))
      .run();
  }
}

/** Create a local food owned by the user. Returns the new id. */
export function createFood(userId: number, input: FoodInput): number {
  const inserted = db
    .insert(foods)
    .values({ ownerUserId: userId, source: 'local', kind: 'item', name: input.name, brand: input.brand })
    .returning({ id: foods.id })
    .get();
  writeNutrientsAndUnits(inserted.id, input);
  return inserted.id;
}

/** Update a local food owned by the user. Returns false if not found/owned. */
export function updateFood(userId: number, id: number, input: FoodInput): boolean {
  const owned = db
    .select({ id: foods.id })
    .from(foods)
    .where(and(eq(foods.id, id), eq(foods.ownerUserId, userId)))
    .get();
  if (!owned) return false;

  db.update(foods)
    .set({ name: input.name, brand: input.brand, updatedAt: Math.floor(Date.now() / 1000) })
    .where(eq(foods.id, id))
    .run();
  writeNutrientsAndUnits(id, input);
  return true;
}

/** Delete a local food owned by the user. Returns false if not found/owned. */
export function deleteFood(userId: number, id: number): boolean {
  const res = db
    .delete(foods)
    .where(and(eq(foods.id, id), eq(foods.ownerUserId, userId)))
    .run();
  return res.changes > 0;
}
