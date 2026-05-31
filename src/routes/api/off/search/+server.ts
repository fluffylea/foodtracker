import { json } from '@sveltejs/kit';
import { openFoodFacts } from '$lib/server/food-sources/openfoodfacts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
  const q = url.searchParams.get('q') ?? '';
  if (q.trim().length < 2) return json([]);
  const results = await openFoodFacts.search(q, 20);
  return json(results);
};
