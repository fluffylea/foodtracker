import { error, fail, redirect } from '@sveltejs/kit';
import { addDays, formatDayLabel, isValidDate, relativeLabel, todayInTz } from '$lib/date';
import { getDay, addEntry, updateEntry, deleteEntry } from '$lib/server/diary';
import { nutrientCatalog, listFoodsForPicker } from '$lib/server/foods';
import { getVisibleGoals, saveGoalCard, deleteGoalCard, reorderGoals } from '$lib/server/goals';
import {
  listMealGroups,
  createMealGroup,
  renameMealGroup,
  removeMealGroup,
  reorderMealGroups
} from '$lib/server/mealgroups';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ params, locals }) => {
  const user = locals.user!;
  const today = todayInTz(user.timezone);

  if (params.date === 'today') redirect(307, `/diary/${today}`);
  if (!isValidDate(params.date)) error(404, 'Invalid date');

  const date = params.date;
  const day = getDay(user.id, date);

  return {
    date,
    today,
    label: formatDayLabel(date),
    relative: relativeLabel(date, today),
    prev: addDays(date, -1),
    next: addDays(date, 1),
    entries: day.entries,
    totals: day.totals,
    catalog: nutrientCatalog(),
    foods: listFoodsForPicker(user.id),
    goals: getVisibleGoals(user.id, date),
    mealGroups: listMealGroups(user.id, date)
  };
};

function parseOptionalNumber(raw: FormDataEntryValue | null): number | null {
  if (raw === null) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isNaN(n) ? null : n;
}

/** Parse an optional integer meal-group id from a form field ('' = none). */
function parseMealGroupId(raw: FormDataEntryValue | null): number | null {
  if (raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

function parseUnitId(raw: FormDataEntryValue | null): number | null {
  // Empty / 'g' means grams (no unit row).
  if (raw === null || raw === '' || raw === 'g') return null;
  const n = Number(raw);
  return Number.isInteger(n) ? n : null;
}

export const actions: Actions = {
  addEntry: async ({ request, locals, params }) => {
    const f = await request.formData();
    const foodId = Number(f.get('foodId'));
    const amount = Number(f.get('amount'));
    const unitId = parseUnitId(f.get('unitId'));
    if (!Number.isInteger(foodId)) return fail(400, { error: 'Pick a food.' });
    if (!(amount > 0)) return fail(400, { error: 'Amount must be greater than 0.' });

    const mealGroupId = parseMealGroupId(f.get('mealGroupId'));
    const id = addEntry(locals.user!.id, params.date, { foodId, amount, unitId }, mealGroupId);
    if (id === null) return fail(400, { error: 'Could not add that entry.' });
    return { added: true };
  },

  updateEntry: async ({ request, locals }) => {
    const f = await request.formData();
    const id = Number(f.get('id'));
    const amount = Number(f.get('amount'));
    const unitId = parseUnitId(f.get('unitId'));
    const mealGroupId = parseMealGroupId(f.get('mealGroupId'));
    if (!Number.isInteger(id)) return fail(400, { error: 'Invalid entry.' });
    if (!(amount > 0)) return fail(400, { error: 'Amount must be greater than 0.' });

    const ok = updateEntry(locals.user!.id, id, amount, unitId, mealGroupId);
    if (!ok) return fail(400, { error: 'Could not update that entry.' });
    return { updated: true };
  },

  deleteEntry: async ({ request, locals }) => {
    const f = await request.formData();
    const id = Number(f.get('id'));
    if (!Number.isInteger(id)) return fail(400, { error: 'Invalid entry.' });
    deleteEntry(locals.user!.id, id);
    return { deleted: true };
  },

  // --- Goals (always effective today; past days keep their goals) ---

  saveGoal: async ({ request, locals }) => {
    const user = locals.user!;
    const today = todayInTz(user.timezone);
    const f = await request.formData();
    const nutrientId = Number(f.get('nutrientId'));
    if (!Number.isInteger(nutrientId)) return fail(400, { error: 'Pick a nutrient.' });

    const originalRaw = f.get('originalNutrientId');
    const originalNutrientId = originalRaw !== null ? Number(originalRaw) : null;
    const min = parseOptionalNumber(f.get('min'));
    const max = parseOptionalNumber(f.get('max'));
    if (min !== null && max !== null && min >= max) {
      return fail(400, { error: 'Minimum must be less than maximum.' });
    }

    saveGoalCard(user.id, today, {
      originalNutrientId: originalNutrientId !== null && Number.isInteger(originalNutrientId) ? originalNutrientId : null,
      nutrientId,
      min,
      max
    });
    return { goalSaved: true };
  },

  deleteGoal: async ({ request, locals }) => {
    const user = locals.user!;
    const today = todayInTz(user.timezone);
    const nutrientId = Number((await request.formData()).get('nutrientId'));
    if (!Number.isInteger(nutrientId)) return fail(400, { error: 'Invalid goal.' });
    deleteGoalCard(user.id, today, nutrientId);
    return { goalDeleted: true };
  },

  reorderGoals: async ({ request, locals }) => {
    const raw = (await request.formData()).get('order');
    let order: number[] = [];
    try {
      order = JSON.parse(String(raw)).map((n: unknown) => Number(n)).filter(Number.isInteger);
    } catch {
      return fail(400, { error: 'Bad order.' });
    }
    reorderGoals(locals.user!.id, order);
    return { reordered: true };
  },

  // --- Meal groups ---

  createMeal: async ({ request, locals }) => {
    const user = locals.user!;
    const today = todayInTz(user.timezone);
    const name = String((await request.formData()).get('name') ?? '').trim();
    if (!name) return fail(400, { error: 'Meal needs a name.' });
    const id = createMealGroup(user.id, name, today);
    if (id === null) return fail(400, { error: 'Could not create meal.' });
    return { mealCreated: id };
  },

  renameMeal: async ({ request, locals }) => {
    const f = await request.formData();
    const id = Number(f.get('id'));
    const name = String(f.get('name') ?? '').trim();
    if (!Number.isInteger(id) || !name) return fail(400, { error: 'Invalid meal.' });
    renameMealGroup(locals.user!.id, id, name);
    return { mealRenamed: true };
  },

  removeMeal: async ({ request, locals }) => {
    const user = locals.user!;
    const today = todayInTz(user.timezone);
    const id = Number((await request.formData()).get('id'));
    if (!Number.isInteger(id)) return fail(400, { error: 'Invalid meal.' });
    removeMealGroup(user.id, id, today);
    return { mealRemoved: true };
  },

  reorderMeals: async ({ request, locals }) => {
    const raw = (await request.formData()).get('order');
    let order: number[] = [];
    try {
      order = JSON.parse(String(raw)).map((n: unknown) => Number(n)).filter(Number.isInteger);
    } catch {
      return fail(400, { error: 'Bad order.' });
    }
    reorderMealGroups(locals.user!.id, order);
    return { mealsReordered: true };
  }
};
