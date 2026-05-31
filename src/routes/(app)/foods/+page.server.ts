import { fail, redirect } from '@sveltejs/kit';
import {
  listFoods,
  getFood,
  nutrientCatalog,
  createFood,
  updateFood,
  deleteFood,
  type FoodInput
} from '$lib/server/foods';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
  const userId = locals.user!.id;
  const catalog = nutrientCatalog();
  const list = listFoods(userId);

  const idParam = url.searchParams.get('id');
  const id = idParam ? Number(idParam) : null;
  const selected = id && Number.isInteger(id) ? getFood(userId, id) : null;

  return { catalog, foods: list, selected, isNew: url.searchParams.has('new') };
};

/** Parse + validate the JSON editor payload from the form. */
function parseInput(raw: string | null): { input: FoodInput } | { error: string } {
  if (!raw) return { error: 'Missing form data.' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: 'Malformed form data.' };
  }
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

export const actions: Actions = {
  save: async ({ request, locals }) => {
    const f = await request.formData();
    const idRaw = f.get('id');
    const result = parseInput(f.get('data') as string | null);
    if ('error' in result) return fail(400, { error: result.error });

    const userId = locals.user!.id;
    if (idRaw) {
      const id = Number(idRaw);
      const ok = updateFood(userId, id, result.input);
      if (!ok) return fail(404, { error: 'Food not found.' });
      return { saved: true };
    }
    const newId = createFood(userId, result.input);
    redirect(303, `/foods?id=${newId}`);
  },

  delete: async ({ request, locals }) => {
    const f = await request.formData();
    const id = Number(f.get('id'));
    if (!Number.isInteger(id)) return fail(400, { error: 'Invalid food.' });
    deleteFood(locals.user!.id, id);
    redirect(303, '/foods');
  }
};
