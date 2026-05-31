import { json, error } from '@sveltejs/kit';
import { importOffFood, pickerFoodById } from '$lib/server/foods';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  const { barcode } = await request.json().catch(() => ({}));
  if (typeof barcode !== 'string' || !barcode) error(400, 'Missing barcode');

  const id = await importOffFood(barcode);
  if (id === null) error(502, 'Could not fetch that product from Open Food Facts');

  const food = pickerFoodById(id);
  if (!food) error(500, 'Import failed');
  return json(food);
};
