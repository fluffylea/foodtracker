import { addDays, axisTicks, isValidDate, periodBounds, periodLabel, todayInTz, type TrendView } from '$lib/date';
import { nutrientCatalog } from '$lib/server/foods';
import { rangeTotals, aggregateWeekly } from '$lib/server/trends';
import type { PageServerLoad } from './$types';

const VIEWS: TrendView[] = ['week', 'month', 'quarter', 'year'];

export const load: PageServerLoad = ({ locals, url }) => {
  const user = locals.user!;
  const today = todayInTz(user.timezone);

  const requestedView = url.searchParams.get('view');
  const view: TrendView = (VIEWS as string[]).includes(requestedView ?? '') ? (requestedView as TrendView) : 'month';

  const refParam = url.searchParams.get('ref');
  const ref = refParam && isValidDate(refParam) ? refParam : today;

  const { from, to } = periodBounds(view, ref, user.weekStart);
  let totals = rangeTotals(user.id, from, to);

  // The year is shown as weekly averages — 365 daily points are too noisy.
  const granularity: 'day' | 'week' = view === 'year' ? 'week' : 'day';
  if (granularity === 'week') totals = aggregateWeekly(totals, user.weekStart);

  return {
    catalog: nutrientCatalog(),
    dates: totals.dates,
    series: totals.series,
    ticks: axisTicks(view, totals.dates, user.weekStart),
    granularity,
    view,
    views: VIEWS,
    label: periodLabel(view, from, to),
    // a date in the previous / next period of the same view
    prevRef: addDays(from, -1),
    nextRef: addDays(to, 1),
    // disable forward nav once the period already reaches today
    atLatest: to >= today
  };
};
