import { and, eq, lte, desc } from 'drizzle-orm';
import { db } from './db/index';
import { goals } from './db/schema';

export type GoalMode = 'maximum' | 'minimum' | 'range' | 'display' | 'none';

export type GoalState = {
  mode: GoalMode;
  targetMin: number | null;
  targetMax: number | null;
  sortOrder: number;
};

// nutrientId -> the goal active for a given day
export type ActiveGoals = Map<number, GoalState>;

/** Derive the tile mode from which targets are present (DESIGN: empty fields). */
export function deriveMode(min: number | null, max: number | null): GoalMode {
  if (min !== null && max !== null) return 'range';
  if (min !== null) return 'minimum';
  if (max !== null) return 'maximum';
  return 'display';
}

/**
 * The goal active for each nutrient on `date`: the latest version with
 * effective_from <= date (DESIGN.md §4). Includes tombstones (mode 'none').
 */
export function getActiveGoals(userId: number, date: string): ActiveGoals {
  const rows = db
    .select()
    .from(goals)
    .where(and(eq(goals.userId, userId), lte(goals.effectiveFrom, date)))
    .orderBy(desc(goals.effectiveFrom), desc(goals.id))
    .all();

  const active: ActiveGoals = new Map();
  for (const r of rows) {
    if (active.has(r.nutrientId)) continue; // newest-first → first seen wins
    active.set(r.nutrientId, {
      mode: r.mode as GoalMode,
      targetMin: r.targetMin,
      targetMax: r.targetMax,
      sortOrder: r.sortOrder
    });
  }
  return active;
}

export type VisibleGoal = GoalState & { nutrientId: number };

/** Visible goals (mode !== 'none') for a day, ordered by sortOrder. */
export function getVisibleGoals(userId: number, date: string): VisibleGoal[] {
  const active = getActiveGoals(userId, date);
  const out: VisibleGoal[] = [];
  for (const [nutrientId, g] of active) {
    if (g.mode === 'none') continue;
    out.push({ nutrientId, ...g });
  }
  out.sort((a, b) => a.sortOrder - b.sortOrder || a.nutrientId - b.nutrientId);
  return out;
}

/** Nutrient ids that currently have a visible goal (for dropdown exclusion). */
export function usedNutrientIds(userId: number, today: string): number[] {
  return getVisibleGoals(userId, today).map((g) => g.nutrientId);
}

/** Upsert the version effective `today` for a nutrient. */
function upsertToday(
  userId: number,
  today: string,
  nutrientId: number,
  state: { mode: GoalMode; targetMin: number | null; targetMax: number | null; sortOrder: number }
) {
  const existing = db
    .select({ id: goals.id })
    .from(goals)
    .where(and(eq(goals.userId, userId), eq(goals.nutrientId, nutrientId), eq(goals.effectiveFrom, today)))
    .get();
  if (existing) {
    db.update(goals)
      .set({ mode: state.mode, targetMin: state.targetMin, targetMax: state.targetMax, sortOrder: state.sortOrder })
      .where(eq(goals.id, existing.id))
      .run();
  } else {
    db.insert(goals)
      .values({
        userId,
        nutrientId,
        mode: state.mode,
        targetMin: state.targetMin,
        targetMax: state.targetMax,
        sortOrder: state.sortOrder,
        effectiveFrom: today
      })
      .run();
  }
}

export type GoalCardInput = {
  // The nutrient this card currently targets (null when creating fresh).
  originalNutrientId: number | null;
  nutrientId: number;
  min: number | null;
  max: number | null;
};

/**
 * Create or update a goal card, effective today. Mode is derived from the
 * targets. If the nutrient was retargeted, the old one is tombstoned and the
 * new one inherits its sort order. New cards go to the end.
 */
export function saveGoalCard(userId: number, today: string, input: GoalCardInput): void {
  const active = getActiveGoals(userId, today);
  const mode = deriveMode(input.min, input.max);

  // Sort order: keep the card's existing slot; new cards append.
  let sortOrder: number;
  const prior = input.originalNutrientId !== null ? active.get(input.originalNutrientId) : undefined;
  if (prior) {
    sortOrder = prior.sortOrder;
  } else if (active.get(input.nutrientId)) {
    sortOrder = active.get(input.nutrientId)!.sortOrder;
  } else {
    const maxOrder = Math.max(-1, ...[...active.values()].filter((g) => g.mode !== 'none').map((g) => g.sortOrder));
    sortOrder = maxOrder + 1;
  }

  // Retarget: tombstone the old nutrient.
  if (input.originalNutrientId !== null && input.originalNutrientId !== input.nutrientId) {
    upsertToday(userId, today, input.originalNutrientId, {
      mode: 'none',
      targetMin: null,
      targetMax: null,
      sortOrder: prior?.sortOrder ?? 0
    });
  }

  upsertToday(userId, today, input.nutrientId, {
    mode,
    targetMin: input.min,
    targetMax: input.max,
    sortOrder
  });
}

/** Tombstone a goal from today forward (past days keep it). */
export function deleteGoalCard(userId: number, today: string, nutrientId: number): void {
  const active = getActiveGoals(userId, today);
  const g = active.get(nutrientId);
  if (!g || g.mode === 'none') return;
  upsertToday(userId, today, nutrientId, {
    mode: 'none',
    targetMin: null,
    targetMax: null,
    sortOrder: g.sortOrder
  });
}

/**
 * Persist a new tile order. `order` is the nutrient ids in the desired
 * sequence. We set sortOrder on every version of each nutrient so the order
 * is stable across the effective-dated history.
 */
export function reorderGoals(userId: number, order: number[]): void {
  order.forEach((nutrientId, i) => {
    db.update(goals)
      .set({ sortOrder: i })
      .where(and(eq(goals.userId, userId), eq(goals.nutrientId, nutrientId)))
      .run();
  });
}
