import { error, fail, redirect } from '@sveltejs/kit';
import { addDays, formatDayLabel, isValidDate, relativeLabel, todayInTz } from '$lib/date';
import { getDay, addEntry, updateEntry, deleteEntry } from '$lib/server/diary';
import { nutrientCatalog, listFoodsForPicker } from '$lib/server/foods';
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
    foods: listFoodsForPicker(user.id)
  };
};

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

    const id = addEntry(locals.user!.id, params.date, { foodId, amount, unitId });
    if (id === null) return fail(400, { error: 'Could not add that entry.' });
    return { added: true };
  },

  updateEntry: async ({ request, locals }) => {
    const f = await request.formData();
    const id = Number(f.get('id'));
    const amount = Number(f.get('amount'));
    const unitId = parseUnitId(f.get('unitId'));
    if (!Number.isInteger(id)) return fail(400, { error: 'Invalid entry.' });
    if (!(amount > 0)) return fail(400, { error: 'Amount must be greater than 0.' });

    const ok = updateEntry(locals.user!.id, id, amount, unitId);
    if (!ok) return fail(400, { error: 'Could not update that entry.' });
    return { updated: true };
  },

  deleteEntry: async ({ request, locals }) => {
    const f = await request.formData();
    const id = Number(f.get('id'));
    if (!Number.isInteger(id)) return fail(400, { error: 'Invalid entry.' });
    deleteEntry(locals.user!.id, id);
    return { deleted: true };
  }
};
