import { addDays, todayInTz } from '$lib/date';
import { nutrientCatalog } from '$lib/server/foods';
import { rangeTotals } from '$lib/server/trends';
import type { PageServerLoad } from './$types';

const RANGES = [7, 30, 90, 365];

export const load: PageServerLoad = ({ locals, url }) => {
  const user = locals.user!;
  const today = todayInTz(user.timezone);

  const requested = Number(url.searchParams.get('range'));
  const days = RANGES.includes(requested) ? requested : 30;
  const from = addDays(today, -(days - 1));

  const { dates, series } = rangeTotals(user.id, from, today);

  return {
    catalog: nutrientCatalog(),
    dates,
    series,
    days,
    ranges: RANGES
  };
};
