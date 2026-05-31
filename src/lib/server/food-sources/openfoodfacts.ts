import type { FoodSource, SourceProduct, SourceSearchResult } from './types';

const BASE = 'https://world.openfoodfacts.org';
// Dedicated search service — the legacy cgi/search.pl is frequently overloaded
// (503), while this and the product-by-barcode API are reliable.
const SEARCH_BASE = 'https://search.openfoodfacts.org';
// OFF asks API clients to identify themselves with a descriptive User-Agent.
const UA = 'Plate/0.1 (self-hosted nutrition tracker; https://github.com/)';
const TIMEOUT_MS = 12000;

// Our nutrient `key` -> Open Food Facts per-100g nutriment field.
const NUTRIMENT_MAP: Record<string, string> = {
  energy: 'energy-kcal_100g',
  protein: 'proteins_100g',
  carbs: 'carbohydrates_100g',
  sugars: 'sugars_100g',
  fat: 'fat_100g',
  saturates: 'saturated-fat_100g',
  fiber: 'fiber_100g',
  salt: 'salt_100g'
};

const FIELDS = 'code,product_name,brands,nutriments,serving_quantity';

async function offFetch(url: string): Promise<unknown | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null; // network/timeout → caller treats as no data
  } finally {
    clearTimeout(t);
  }
}

function num(v: unknown): number | null {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function mapNutriments(nutriments: Record<string, unknown> | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  if (!nutriments) return out;
  for (const [key, field] of Object.entries(NUTRIMENT_MAP)) {
    const v = num(nutriments[field]);
    if (v !== null && v >= 0) out[key] = v;
  }
  return out;
}

function brandOf(brands: unknown): string | null {
  // search-a-licious returns an array; the product API a comma-separated string.
  if (Array.isArray(brands)) {
    const first = brands.find((b) => typeof b === 'string' && b.trim());
    return typeof first === 'string' ? first.trim() : null;
  }
  if (typeof brands === 'string' && brands.trim()) return brands.split(',')[0].trim() || null;
  return null;
}

type OffProductRaw = {
  code?: string;
  product_name?: string;
  brands?: unknown;
  nutriments?: Record<string, unknown>;
  serving_quantity?: unknown;
};

export const openFoodFacts: FoodSource = {
  id: 'off',

  async search(query, limit = 20) {
    const q = query.trim();
    if (q.length < 2) return [];
    const url =
      `${SEARCH_BASE}/search?q=${encodeURIComponent(q)}` +
      `&page_size=${limit}&fields=code,product_name,brands,nutriments`;
    const data = (await offFetch(url)) as { hits?: OffProductRaw[] } | null;
    if (!data?.hits) return [];

    const results: SourceSearchResult[] = [];
    for (const p of data.hits) {
      const name = (p.product_name ?? '').trim();
      if (!p.code || !name) continue; // unusable without a barcode + name
      const energy = num(p.nutriments?.['energy-kcal_100g']);
      results.push({ ref: p.code, name, brand: brandOf(p.brands), energyPer100g: energy });
    }
    return results;
  },

  async getByRef(ref) {
    const url = `${BASE}/api/v2/product/${encodeURIComponent(ref)}?fields=${FIELDS}`;
    const data = (await offFetch(url)) as { product?: OffProductRaw; status?: number } | null;
    const p = data?.product;
    if (!p || !p.code) return null;
    const name = (p.product_name ?? '').trim();
    if (!name) return null;

    const servingGrams = num(p.serving_quantity);
    const product: SourceProduct = {
      ref: p.code,
      name,
      brand: brandOf(p.brands),
      nutrients: mapNutriments(p.nutriments),
      servingGrams: servingGrams && servingGrams > 0 ? servingGrams : null
    };
    return product;
  }
};
