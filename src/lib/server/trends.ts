import { and, eq, gte, lte } from 'drizzle-orm';
import { db } from './db/index';
import { diaryEntries, foodNutrients, foodUnits } from './db/schema';
import { enumerateDays, startOfWeek } from '$lib/date';

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

/**
 * Collapse a daily series into one point per week (for the year view, where
 * 365 daily points are too noisy). Each week's value is the average over its
 * *logged* days (value > 0), so untracked days don't drag it down; a week with
 * no data stays 0 (treated as a gap by the chart).
 */
export function aggregateWeekly(
  daily: RangeTotals,
  weekStart: number
): RangeTotals {
  // Map each day index → its week-start date, preserving first-seen order.
  const weekOf = daily.dates.map((d) => startOfWeek(d, weekStart));
  const weekDates: string[] = [];
  const weekIndex = new Map<string, number>();
  for (const w of weekOf) {
    if (!weekIndex.has(w)) {
      weekIndex.set(w, weekDates.length);
      weekDates.push(w);
    }
  }

  const series: Record<number, number[]> = {};
  for (const [nidStr, values] of Object.entries(daily.series)) {
    const nid = Number(nidStr);
    const sums = new Array(weekDates.length).fill(0);
    const counts = new Array(weekDates.length).fill(0);
    values.forEach((v, i) => {
      if (v <= 0) return; // only logged days contribute
      const wi = weekIndex.get(weekOf[i])!;
      sums[wi] += v;
      counts[wi] += 1;
    });
    series[nid] = sums.map((s, i) => (counts[i] > 0 ? s / counts[i] : 0));
  }

  return { dates: weekDates, series };
}
