/** Calendar-day helpers. Days are 'YYYY-MM-DD' strings (timezone-resolved). */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidDate(s: string): boolean {
  return DATE_RE.test(s) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
}

/** Today's date in the given IANA timezone, as 'YYYY-MM-DD'. */
export function todayInTz(timezone = 'UTC'): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

/** Add `days` to a 'YYYY-MM-DD' string, returning a new 'YYYY-MM-DD'. */
export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Human label, e.g. "Wed · May 28". */
export function formatDayLabel(date: string): string {
  const d = new Date(date + 'T00:00:00Z');
  const wd = d.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
  const md = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${wd} · ${md}`;
}

/** Relative descriptor for a day vs today (Today / Yesterday / Tomorrow / null). */
export function relativeLabel(date: string, today: string): string | null {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  if (date === addDays(today, 1)) return 'Tomorrow';
  return null;
}
