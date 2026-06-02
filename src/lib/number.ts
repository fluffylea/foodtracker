// Locale-tolerant decimal parsing for user-typed number fields.
//
// `<input type="number">` only accepts '.' as the decimal separator, but a
// German (and most non-US/UK) phone keypad emits ',' — so the field rejects the
// keystroke and the user can't type a decimal at all. We therefore use
// `type="text" inputmode="decimal"` for amounts/nutrients and parse here,
// accepting either separator. Display formatting (which separator to *show*) is
// a separate, optional preference; input always understands both.

/** Parse a typed decimal, treating ',' as '.'. Returns NaN if not a number. */
export function parseDecimal(s: string | number | null | undefined): number {
  if (typeof s === 'number') return s;
  if (s == null) return NaN;
  return Number(String(s).replace(/,/g, '.').trim());
}

/** Like parseDecimal but blank → null (for optional fields). */
export function parseDecimalOrNull(s: string | number | null | undefined): number | null {
  const t = String(s ?? '').trim();
  if (t === '') return null;
  const n = parseDecimal(t);
  return Number.isNaN(n) ? null : n;
}
