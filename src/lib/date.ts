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

/** Inclusive list of 'YYYY-MM-DD' from `from` to `to`. */
export function enumerateDays(from: string, to: string): string[] {
  const out: string[] = [];
  let d = from;
  // Guard against accidental huge/reversed ranges.
  for (let i = 0; i < 1000 && d <= to; i++) {
    out.push(d);
    d = addDays(d, 1);
  }
  return out;
}

/** Short axis label for a day, e.g. "May 28". */
export function shortDayLabel(date: string): string {
  return new Date(date + 'T00:00:00Z').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC'
  });
}

// ---- Trends period snapping (week/month/quarter/year) ----

export type TrendView = 'week' | 'month' | 'quarter' | 'year';

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** First day of the week containing `date`. weekStart: 0 = Sunday, 1 = Monday. */
export function startOfWeek(date: string, weekStart: number): string {
  const d = new Date(date + 'T00:00:00Z');
  const diff = (d.getUTCDay() - weekStart + 7) % 7;
  d.setUTCDate(d.getUTCDate() - diff);
  return iso(d);
}

/** [from, to] for the period of `view` containing `ref`. */
export function periodBounds(view: TrendView, ref: string, weekStart: number): { from: string; to: string } {
  const d = new Date(ref + 'T00:00:00Z');
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  if (view === 'week') {
    const from = startOfWeek(ref, weekStart);
    return { from, to: addDays(from, 6) };
  }
  if (view === 'month') {
    return { from: iso(new Date(Date.UTC(y, m, 1))), to: iso(new Date(Date.UTC(y, m + 1, 0))) };
  }
  if (view === 'quarter') {
    const q = Math.floor(m / 3);
    return { from: iso(new Date(Date.UTC(y, q * 3, 1))), to: iso(new Date(Date.UTC(y, q * 3 + 3, 0))) };
  }
  return { from: `${y}-01-01`, to: `${y}-12-31` }; // year
}

/** Human label for a period, e.g. "May 25 – 31", "May 2026", "Q2 2026", "2026". */
export function periodLabel(view: TrendView, from: string, to: string): string {
  const f = new Date(from + 'T00:00:00Z');
  if (view === 'week') {
    const sameMonth = from.slice(0, 7) === to.slice(0, 7);
    const right = sameMonth
      ? new Date(to + 'T00:00:00Z').toLocaleDateString('en-US', { day: 'numeric', timeZone: 'UTC' })
      : shortDayLabel(to);
    return `${shortDayLabel(from)} – ${right}`;
  }
  if (view === 'month') return f.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  if (view === 'quarter') return `Q${Math.floor(f.getUTCMonth() / 3) + 1} ${f.getUTCFullYear()}`;
  return String(f.getUTCFullYear());
}

/** Relative descriptor for a day vs today (Today / Yesterday / Tomorrow / null). */
export function relativeLabel(date: string, today: string): string | null {
  if (date === today) return 'Today';
  if (date === addDays(today, -1)) return 'Yesterday';
  if (date === addDays(today, 1)) return 'Tomorrow';
  return null;
}
