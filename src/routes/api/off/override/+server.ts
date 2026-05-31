import { json, error } from '@sveltejs/kit';
import { createOverride } from '$lib/server/foods';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
  const { barcode } = await request.json().catch(() => ({}));
  if (typeof barcode !== 'string' || !barcode) error(400, 'Missing barcode');

  const food = await createOverride(locals.user!.id, barcode);
  if (!food) error(502, 'Could not fetch that product from Open Food Facts');
  return json(food);
};
