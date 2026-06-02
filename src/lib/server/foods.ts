import { and, or, eq, isNull, inArray, asc } from 'drizzle-orm';
import { db } from './db/index';
import { foods, foodNutrients, foodUnits, nutrients } from './db/schema';
import { openFoodFacts } from './food-sources/openfoodfacts';

export type FoodListItem = {
  id: number;
  name: string;
  brand: string | null;
  barcode: string | null;
  source: 'off' | 'local';
  kind: 'item' | 'recipe';
  // Set when this local food was cloned from an external product (= an override
  // of an OFF item, vs. a from-scratch custom food). Drives the list tag.
  originRef: string | null;
  energyPer100g: number | null;
  unitNames: string[];
};

export type FoodDetail = {
  id: number;
  name: string;
  brand: string | null;
  barcode: string | null;
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
  barcode: string | null;
  // nutrientId -> per-100g value; null/absent = unknown
  nutrients: Record<number, number | null>;
  units: { name: string; grams: number; isDefault: boolean }[];
};

/**
 * Validate a raw editor payload (already JSON-parsed) into a FoodInput, for the
 * /api/foods endpoint (create + update). Numbers arrive pre-parsed by the client
 * (comma-tolerant), so we only coerce + range-check here.
 */
export function parseFoodInput(parsed: unknown): { input: FoodInput } | { error: string } {
  if (parsed === null || typeof parsed !== 'object') return { error: 'Missing form data.' };
  const p = parsed as Partial<FoodInput>;

  const name = String(p.name ?? '').trim();
  if (!name) return { error: 'Name is required.' };
  const brand = p.brand ? String(p.brand).trim() || null : null;
  const barcode = p.barcode ? String(p.barcode).trim() || null : null;

  // Nutrients: keep only finite numbers; everything else is "unknown".
  const nutrients: Record<number, number | null> = {};
  for (const [k, v] of Object.entries(p.nutrients ?? {})) {
    if (v === null || v === undefined) continue;
    const num = Number(v);
    if (Number.isNaN(num)) continue;
    if (num < 0) return { error: 'Nutrient values cannot be negative.' };
    nutrients[Number(k)] = num;
  }

  // Units: named units only ('g' is implicit). Validate each.
  const units: FoodInput['units'] = [];
  let defaults = 0;
  for (const u of p.units ?? []) {
    const uname = String(u?.name ?? '').trim();
    const grams = Number(u?.grams);
    if (!uname) return { error: 'Each unit needs a name.' };
    if (!(grams > 0)) return { error: `Unit "${uname}" needs a gram weight greater than 0.` };
    const isDefault = Boolean(u?.isDefault);
    if (isDefault) defaults++;
    units.push({ name: uname, grams, isDefault });
  }
  if (defaults > 1) return { error: 'Only one unit can be the default.' };

  return { input: { name, brand, barcode, nutrients, units } };
}

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
    barcode: r.barcode,
    source: r.source,
    kind: r.kind,
    originRef: r.originRef,
    energyPer100g: energyByFood.get(r.id) ?? null,
    unitNames: unitsByFood.get(r.id) ?? []
  }));
}

export type PickerFood = {
  id: number;
  name: string;
  brand: string | null;
  barcode: string | null;
  source: 'off' | 'local';
  originRef: string | null;
  energyPer100g: number | null;
  // nutrientId -> per-100g value (for the scaled breakdown in the add dialog)
  nutrients: Record<number, number>;
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
  const energyId = nutrientKeyToId().get('energy') ?? null;

  // All per-100g nutrients for these foods (one query), grouped per food.
  const nrows = db.select().from(foodNutrients).where(inArray(foodNutrients.foodId, ids)).all();
  const nutrientsByFood = new Map<number, Record<number, number>>();
  for (const n of nrows) {
    if (n.per100g === null) continue;
    const m = nutrientsByFood.get(n.foodId) ?? {};
    m[n.nutrientId] = n.per100g;
    nutrientsByFood.set(n.foodId, m);
  }

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

  return rows.map((r) => {
    const nmap = nutrientsByFood.get(r.id) ?? {};
    return {
      id: r.id,
      name: r.name,
      brand: r.brand,
      barcode: r.barcode,
      source: r.source,
      originRef: r.originRef,
      energyPer100g: energyId !== null ? (nmap[energyId] ?? null) : null,
      nutrients: nmap,
      units: unitsByFood.get(r.id) ?? []
    };
  });
}

/** Per-100g nutrient map for one food: nutrientId -> value (known only). */
function nutrientMapFor(id: number): Record<number, number> {
  const rows = db.select().from(foodNutrients).where(eq(foodNutrients.foodId, id)).all();
  const m: Record<number, number> = {};
  for (const n of rows) if (n.per100g !== null) m[n.nutrientId] = n.per100g;
  return m;
}

/** Picker shape for a single food by id (used after OFF import/override). */
export function pickerFoodById(id: number): PickerFood | null {
  const r = db.select().from(foods).where(eq(foods.id, id)).get();
  if (!r) return null;
  const nmap = nutrientMapFor(id);
  const energyId = nutrientKeyToId().get('energy') ?? null;
  const unitRows = db.select().from(foodUnits).where(eq(foodUnits.foodId, id)).orderBy(asc(foodUnits.id)).all();
  return {
    id: r.id,
    name: r.name,
    brand: r.brand,
    barcode: r.barcode,
    source: r.source,
    originRef: r.originRef,
    energyPer100g: energyId !== null ? (nmap[energyId] ?? null) : null,
    nutrients: nmap,
    units: unitRows.map((u) => ({ id: u.id, name: u.name, grams: u.grams, isDefault: u.isDefault }))
  };
}

/** nutrient `key` -> id (catalog is small; built per call). */
function nutrientKeyToId(): Map<string, number> {
  return new Map(db.select({ id: nutrients.id, key: nutrients.key }).from(nutrients).all().map((n) => [n.key, n.id]));
}

/**
 * Ensure an Open Food Facts product is cached as a shared food (owner NULL,
 * source 'off', origin_ref = barcode) and return its id. Idempotent. Returns
 * null if the product can't be fetched.
 */
export async function importOffFood(barcode: string): Promise<number | null> {
  const existing = db
    .select({ id: foods.id })
    .from(foods)
    .where(and(isNull(foods.ownerUserId), eq(foods.source, 'off'), eq(foods.originRef, barcode)))
    .get();
  if (existing) return existing.id;

  const p = await openFoodFacts.getByRef(barcode);
  if (!p) return null;

  // The fetch is done; persist the cached food + its nutrients/unit atomically.
  return db.transaction(() => {
    const inserted = db
      .insert(foods)
      .values({ ownerUserId: null, source: 'off', kind: 'item', originRef: p.ref, name: p.name, brand: p.brand, barcode: p.ref })
      .returning({ id: foods.id })
      .get();

    const k2id = nutrientKeyToId();
    const nutrientValues = Object.entries(p.nutrients)
      .filter(([k]) => k2id.has(k))
      .map(([k, v]) => ({ foodId: inserted.id, nutrientId: k2id.get(k)!, per100g: v }));
    if (nutrientValues.length > 0) db.insert(foodNutrients).values(nutrientValues).run();

    if (p.servingGrams && p.servingGrams > 0) {
      db.insert(foodUnits).values({ foodId: inserted.id, name: 'serving', grams: p.servingGrams, isDefault: false }).run();
    }
    return inserted.id;
  });
}

/**
 * Create (or return the existing) per-user local override of an OFF product:
 * a local food copy the user can edit without affecting the shared cache or
 * other users. Idempotent per (user, barcode).
 */
export async function createOverride(userId: number, barcode: string): Promise<PickerFood | null> {
  const existing = db
    .select({ id: foods.id })
    .from(foods)
    .where(and(eq(foods.ownerUserId, userId), eq(foods.source, 'local'), eq(foods.originRef, barcode)))
    .get();
  if (existing) return pickerFoodById(existing.id);

  const sharedId = await importOffFood(barcode);
  if (sharedId === null) return null;

  const shared = db.select().from(foods).where(eq(foods.id, sharedId)).get();
  if (!shared) return null;

  // Insert the local copy and clone its nutrients + units atomically.
  const localId = db.transaction(() => {
    const local = db
      .insert(foods)
      .values({ ownerUserId: userId, source: 'local', kind: 'item', originRef: barcode, name: shared.name, brand: shared.brand, barcode: shared.barcode })
      .returning({ id: foods.id })
      .get();

    const srcNutrients = db.select().from(foodNutrients).where(eq(foodNutrients.foodId, sharedId)).all();
    if (srcNutrients.length > 0) {
      db.insert(foodNutrients).values(srcNutrients.map((n) => ({ foodId: local.id, nutrientId: n.nutrientId, per100g: n.per100g }))).run();
    }
    const srcUnits = db.select().from(foodUnits).where(eq(foodUnits.foodId, sharedId)).all();
    if (srcUnits.length > 0) {
      db.insert(foodUnits).values(srcUnits.map((u) => ({ foodId: local.id, name: u.name, grams: u.grams, isDefault: u.isDefault }))).run();
    }
    return local.id;
  });
  return pickerFoodById(localId);
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
    barcode: food.barcode,
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
  return db.transaction(() => {
    const inserted = db
      .insert(foods)
      .values({ ownerUserId: userId, source: 'local', kind: 'item', name: input.name, brand: input.brand, barcode: input.barcode })
      .returning({ id: foods.id })
      .get();
    writeNutrientsAndUnits(inserted.id, input);
    return inserted.id;
  });
}

/** Update a local food owned by the user. Returns false if not found/owned. */
export function updateFood(userId: number, id: number, input: FoodInput): boolean {
  const owned = db
    .select({ id: foods.id })
    .from(foods)
    .where(and(eq(foods.id, id), eq(foods.ownerUserId, userId)))
    .get();
  if (!owned) return false;

  db.transaction(() => {
    db.update(foods)
      .set({ name: input.name, brand: input.brand, barcode: input.barcode, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(foods.id, id))
      .run();
    writeNutrientsAndUnits(id, input);
  });
  return true;
}

/**
 * Snapshot a meal's nutrient totals (over `totalGrams`) into a local food of
 * kind 'recipe', with a single 'serving' unit equal to the whole amount — so
 * logging "1 serving" reproduces the meal. This is a flattened snapshot: it
 * records the totals, not the source foods, so later edits to the originals
 * don't change it. Returns the new food id.
 */
export function createRecipeFood(
  userId: number,
  name: string,
  totalGrams: number,
  nutrientTotals: Record<number, number>
): number {
  const g = totalGrams > 0 ? totalGrams : 1;
  return db.transaction(() => {
    const inserted = db
      .insert(foods)
      .values({ ownerUserId: userId, source: 'local', kind: 'recipe', name })
      .returning({ id: foods.id })
      .get();
    const values = Object.entries(nutrientTotals)
      .filter(([, v]) => v != null && !Number.isNaN(v))
      .map(([nid, v]) => ({
        foodId: inserted.id,
        nutrientId: Number(nid),
        // Round the derived per-100g to 2 dp — the raw division is noisy.
        per100g: Math.round(((v * 100) / g) * 100) / 100
      }));
    if (values.length > 0) db.insert(foodNutrients).values(values).run();
    db.insert(foodUnits).values({ foodId: inserted.id, name: 'serving', grams: g, isDefault: true }).run();
    return inserted.id;
  });
}

/** Delete a local food owned by the user. Returns false if not found/owned. */
export function deleteFood(userId: number, id: number): boolean {
  const res = db
    .delete(foods)
    .where(and(eq(foods.id, id), eq(foods.ownerUserId, userId)))
    .run();
  return res.changes > 0;
}
