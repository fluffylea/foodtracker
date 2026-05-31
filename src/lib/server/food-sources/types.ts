/** Pluggable nutrition data source (DESIGN.md §7). Open Food Facts first. */

export type SourceSearchResult = {
  ref: string; // source-specific id (OFF: barcode)
  name: string;
  brand: string | null;
  energyPer100g: number | null;
};

export type SourceProduct = {
  ref: string;
  name: string;
  brand: string | null;
  // our nutrient `key` -> per-100g value
  nutrients: Record<string, number>;
  // grams in one "serving", if the source provides it
  servingGrams: number | null;
};

export interface FoodSource {
  readonly id: 'off';
  search(query: string, limit?: number): Promise<SourceSearchResult[]>;
  getByRef(ref: string): Promise<SourceProduct | null>;
}
