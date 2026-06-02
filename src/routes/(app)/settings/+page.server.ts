import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { users } from '$lib/server/db/schema';
import type { Actions } from './$types';

/** A timezone is valid if Intl can build a formatter for it. */
function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const actions: Actions = {
  savePrefs: async ({ request, locals }) => {
    const f = await request.formData();
    const weekStart = Number(f.get('weekStart'));
    const timezone = String(f.get('timezone') ?? '').trim();
    if (weekStart !== 0 && weekStart !== 1) return fail(400, { error: 'Invalid week start.' });
    if (!isValidTimezone(timezone)) return fail(400, { error: 'Invalid timezone.' });
    db.update(users).set({ weekStart, timezone }).where(eq(users.id, locals.user!.id)).run();
    return { prefsSaved: true };
  }
};
