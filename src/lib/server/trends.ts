import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from './db/index';
import { diaryEntries, foodNutrients, foodUnits } from './db/schema';
import { enumerateDays } from '$lib/date';

export type RangeTotals = {
  dates: string[];
  // nutrientId -> daily total aligned to `dates` (missing days contribute 0)
  series: Record<number, number[]>;
};

/**
 * Per-day nutrient totals across an inclusive date range, as dense arrays
 * aligned to every day in the window (so the chart has a continuous x-axis).
 */
export function rangeTotals(userId: number, from: string, to: string): RangeTotals {
  const dates = enumerateDays(from, to);
  const dateIndex = new Map(dates.map((d, i) => [d, i]));

  // One query: every entry in range joined to its food's per-100g nutrients
  // and (optional) unit weight.
  const rows = db
    .select({
      date: diaryEntries.date,
      amount: diaryEntries.amount,
      unitGrams: foodUnits.grams,
      nutrientId: foodNutrients.nutrientId,
      per100g: foodNutrients.per100g
    })
    .from(diaryEntries)
    .innerJoin(foodNutrients, eq(foodNutrients.foodId, diaryEntries.foodId))
    .leftJoin(foodUnits, eq(foodUnits.id, diaryEntries.unitId))
    .where(and(eq(diaryEntries.userId, userId), gte(diaryEntries.date, from), lte(diaryEntries.date, to)))
    .all();

  const series: Record<number, number[]> = {};
  for (const r of rows) {
    if (r.per100g === null) continue;
    const i = dateIndex.get(r.date);
    if (i === undefined) continue;
    const grams = r.amount * (r.unitGrams ?? 1);
    const contrib = (r.per100g * grams) / 100;
    const arr = (series[r.nutrientId] ??= new Array(dates.length).fill(0));
    arr[i] += contrib;
  }

  return { dates, series };
}
