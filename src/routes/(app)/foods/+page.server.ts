import { fail, redirect } from '@sveltejs/kit';
import {
  listFoods,
  getFood,
  pickerFoodById,
  nutrientCatalog,
  createFood,
  updateFood,
  deleteFood,
  parseFoodInput,
  type FoodInput
} from '$lib/server/foods';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
  const userId = locals.user!.id;
  const catalog = nutrientCatalog();
  const list = listFoods(userId);

  const idParam = url.searchParams.get('id');
  const id = idParam ? Number(idParam) : null;
  // getFood enforces ownership; pickerFoodById gives the shape FoodForm wants.
  const owned = id && Number.isInteger(id) ? getFood(userId, id) : null;
  const selected = owned ? pickerFoodById(id!) : null;

  return { catalog, foods: list, selected, isNew: url.searchParams.has('new') };
};

/** Parse the JSON editor payload string from the form, then validate it. */
function parseInput(raw: string | null): { input: FoodInput } | { error: string } {
  if (!raw) return { error: 'Missing form data.' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { error: 'Malformed form data.' };
  }
  return parseFoodInput(parsed);
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
    } else {
      createFood(userId, result.input);
    }
    // Close the edit modal by returning to the plain list.
    redirect(303, '/foods');
  },

  delete: async ({ request, locals }) => {
    const f = await request.formData();
    const id = Number(f.get('id'));
    if (!Number.isInteger(id)) return fail(400, { error: 'Invalid food.' });
    deleteFood(locals.user!.id, id);
    redirect(303, '/foods');
  }
};
