import { sqliteTable, text, integer, real, primaryKey, index } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

/**
 * Plate schema (DESIGN.md §5). SQLite via better-sqlite3.
 *
 * Conventions:
 * - ids are autoincrement integers unless noted.
 * - dates that represent a *calendar day* are stored as TEXT 'YYYY-MM-DD'
 *   (timezone-resolved client/server side; see per-user `timezone`).
 * - timestamps are unix epoch seconds (integer).
 * - nutrient amounts on foods are stored per 100 g (canonical).
 */

const now = sql`(unixepoch())`;

// ---------------------------------------------------------------------------
// Users & sessions
// ---------------------------------------------------------------------------

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  isAdmin: integer('is_admin', { mode: 'boolean' }).notNull().default(false),
  // Per-user preferences (DESIGN.md §2).
  energyUnit: text('energy_unit', { enum: ['kcal', 'kj'] }).notNull().default('kcal'),
  timezone: text('timezone').notNull().default('UTC'),
  // First day of the week for the Trends week view: 0 = Sunday, 1 = Monday.
  weekStart: integer('week_start').notNull().default(1),
  createdAt: integer('created_at').notNull().default(now)
});

export const sessions = sqliteTable('sessions', {
  // Session token id (opaque, stored hashed — see auth layer, later milestone).
  id: text('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expires_at').notNull()
});

// ---------------------------------------------------------------------------
// Nutrient catalog (global, admin-editable)
// ---------------------------------------------------------------------------

export const nutrients = sqliteTable('nutrients', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  // Stable machine key, e.g. 'energy', 'protein'. Used to map external sources.
  key: text('key').notNull().unique(),
  name: text('name').notNull(),
  // Display/storage unit: 'kcal' | 'g' | 'mg' | 'ug'.
  unit: text('unit').notNull(),
  sortOrder: integer('sort_order').notNull().default(0)
});

// ---------------------------------------------------------------------------
// Foods (unified: external cache, local, override). DESIGN.md §2/§5/§10.
// ---------------------------------------------------------------------------

export const foods = sqliteTable(
  'foods',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    // NULL owner = shared external cache (read-only). Set = local food/override.
    ownerUserId: integer('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
    source: text('source', { enum: ['off', 'local'] }).notNull(),
    // 'item' today; 'recipe' reserved for a later milestone (DESIGN.md §10).
    kind: text('kind', { enum: ['item', 'recipe'] }).notNull().default('item'),
    // For imports & overrides: the origin product ref (e.g. OFF barcode).
    originRef: text('origin_ref'),
    name: text('name').notNull(),
    brand: text('brand'),
    barcode: text('barcode'),
    createdAt: integer('created_at').notNull().default(now),
    updatedAt: integer('updated_at').notNull().default(now)
  },
  (t) => ({
    ownerIdx: index('foods_owner_idx').on(t.ownerUserId),
    originIdx: index('foods_origin_idx').on(t.originRef)
  })
);

// Per-food nutrient values, stored per 100 g. NULL `per100g` = unknown
// (blank in UI, treated as 0 in daily totals). DESIGN.md §3.
export const foodNutrients = sqliteTable(
  'food_nutrients',
  {
    foodId: integer('food_id')
      .notNull()
      .references(() => foods.id, { onDelete: 'cascade' }),
    nutrientId: integer('nutrient_id')
      .notNull()
      .references(() => nutrients.id, { onDelete: 'cascade' }),
    per100g: real('per_100g')
  },
  (t) => ({
    pk: primaryKey({ columns: [t.foodId, t.nutrientId] })
  })
);

// Named units per food ('g' is implicit, not stored). Count units are just
// named units, e.g. 'large' = 65 g; entry amounts may be fractional.
export const foodUnits = sqliteTable(
  'food_units',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    foodId: integer('food_id')
      .notNull()
      .references(() => foods.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    grams: real('grams').notNull(),
    isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false)
  },
  (t) => ({
    foodIdx: index('food_units_food_idx').on(t.foodId)
  })
);

// ---------------------------------------------------------------------------
// Diary: user-defined meal groups + logged entries
// ---------------------------------------------------------------------------

export const mealGroups = sqliteTable(
  'meal_groups',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    // Effective-dated existence (like goals): a meal is shown for day D when
    // effective_from <= D < (removed_from ?? ∞). Soft-removed, never hard
    // deleted, so past days keep the meal and its entries. Default backdates
    // existing meals so they stay visible everywhere.
    effectiveFrom: text('effective_from').notNull().default('2000-01-01'),
    removedFrom: text('removed_from')
  },
  (t) => ({
    userIdx: index('meal_groups_user_idx').on(t.userId)
  })
);

export const diaryEntries = sqliteTable(
  'diary_entries',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    // Calendar day 'YYYY-MM-DD' (resolved in the user's timezone).
    date: text('date').notNull(),
    foodId: integer('food_id')
      .notNull()
      .references(() => foods.id, { onDelete: 'restrict' }),
    amount: real('amount').notNull(),
    // NULL unitId = grams; otherwise references a food_units row.
    unitId: integer('unit_id').references(() => foodUnits.id, { onDelete: 'set null' }),
    mealGroupId: integer('meal_group_id').references(() => mealGroups.id, {
      onDelete: 'set null'
    }),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: integer('created_at').notNull().default(now)
  },
  (t) => ({
    userDateIdx: index('diary_entries_user_date_idx').on(t.userId, t.date)
  })
);

// ---------------------------------------------------------------------------
// Goals (effective-dated versioning). DESIGN.md §4.
// For a day D, the active goal for a nutrient = latest row with
// effective_from <= D (per user, per nutrient).
// ---------------------------------------------------------------------------

export const goals = sqliteTable(
  'goals',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    nutrientId: integer('nutrient_id')
      .notNull()
      .references(() => nutrients.id, { onDelete: 'cascade' }),
    // 'none' is a tombstone: an effective-dated row that stops a previously
    // set goal from a date forward (no tile), without touching earlier days.
    mode: text('mode', { enum: ['maximum', 'minimum', 'range', 'display', 'none'] }).notNull(),
    // Semantics depend on mode: maximum→targetMax, minimum→targetMin,
    // range→both, display/none→neither.
    targetMin: real('target_min'),
    targetMax: real('target_max'),
    // Display order of the goal tile (per user, per nutrient; carried across
    // versions so reordering is independent of the effective-dated value).
    sortOrder: integer('sort_order').notNull().default(0),
    effectiveFrom: text('effective_from').notNull(), // 'YYYY-MM-DD'
    createdAt: integer('created_at').notNull().default(now)
  },
  (t) => ({
    lookupIdx: index('goals_lookup_idx').on(t.userId, t.nutrientId, t.effectiveFrom)
  })
);

// Convenience type exports.
export type User = typeof users.$inferSelect;
export type Nutrient = typeof nutrients.$inferSelect;
export type Food = typeof foods.$inferSelect;
export type FoodUnit = typeof foodUnits.$inferSelect;
export type MealGroup = typeof mealGroups.$inferSelect;
export type DiaryEntry = typeof diaryEntries.$inferSelect;
export type Goal = typeof goals.$inferSelect;
