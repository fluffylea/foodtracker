import { json, error } from '@sveltejs/kit';
import { parseFoodInput, createFood, updateFood, deleteFood, pickerFoodById } from '$lib/server/foods';
import type { RequestHandler } from './$types';

// Save (create or update) a local food and return it in PickerFood shape, so the
// caller (the add sheet's edit mode, or the Foods tab) can drop straight back to
// scale mode with fresh data — no redirect, unlike the Foods-route form action.
export const POST: RequestHandler = async ({ request, locals }) => {
  const body = (await request.json().catch(() => null)) as { id?: unknown; input?: unknown } | null;
  const id = typeof body?.id === 'number' && Number.isInteger(body.id) ? body.id : null;

  const result = parseFoodInput(body?.input);
  if ('error' in result) error(400, result.error);

  const userId = locals.user!.id;
  let foodId: number;
  if (id !== null) {
    if (!updateFood(userId, id, result.input)) error(404, 'Food not found.');
    foodId = id;
  } else {
    foodId = createFood(userId, result.input);
  }

  const food = pickerFoodById(foodId);
  if (!food) error(500, 'Save failed.');
  return json(food);
};

// Delete a local food by id (body: { id }).
export const DELETE: RequestHandler = async ({ request, locals }) => {
  const body = (await request.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === 'number' && Number.isInteger(body.id) ? body.id : null;
  if (id === null) error(400, 'Missing id.');
  deleteFood(locals.user!.id, id);
  return json({ ok: true });
};
