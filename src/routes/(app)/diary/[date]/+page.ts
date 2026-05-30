import { redirect, error } from '@sveltejs/kit';
import { addDays, formatDayLabel, isValidDate, relativeLabel, todayInTz } from '$lib/date';

export function load({ params }) {
  // TODO(milestone 2): resolve the user's timezone instead of UTC.
  const today = todayInTz('UTC');

  // 'today' is a friendly alias → canonical date URL.
  if (params.date === 'today') {
    redirect(307, `/diary/${today}`);
  }

  if (!isValidDate(params.date)) {
    error(404, 'Invalid date');
  }

  const date = params.date;
  return {
    date,
    today,
    label: formatDayLabel(date),
    relative: relativeLabel(date, today),
    prev: addDays(date, -1),
    next: addDays(date, 1)
  };
}
