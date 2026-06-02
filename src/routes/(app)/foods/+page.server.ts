import { listFoods, getFood, pickerFoodById, nutrientCatalog } from '$lib/server/foods';
import type { PageServerLoad } from './$types';

// Food create/update/delete go through the /api/foods endpoint (FoodForm posts
// there via fetch in both the add sheet and the Foods-tab editor), so this route
// only loads the list + selected food — no form actions.
export const load: PageServerLoad = ({ locals, url }) => {
  const userId = locals.user!.id;
  const catalog = nutrientCatalog();
  const list = listFoods(userId);

  const idParam = url.searchParams.get('id');
  const id = idParam ? Number(idParam) : null;
  // getFood enforces ownership; pickerFoodById gives the shape FoodForm wants.
  const owned = id && Number.isInteger(id) ? getFood(userId, id) : null;
  const selected = owned ? pickerFoodById(id!) : null;

  // A new food may arrive prefilled from a no-match search (?name= or ?barcode=).
  const name = url.searchParams.get('name')?.trim();
  const barcode = url.searchParams.get('barcode')?.trim();
  const prefill = name ? { name } : barcode ? { barcode } : undefined;

  return { catalog, foods: list, selected, isNew: url.searchParams.has('new'), prefill };
};
