import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { users } from '$lib/server/db/schema';
import type { Actions } from './$types';

export const actions: Actions = {
  savePrefs: async ({ request, locals }) => {
    const weekStart = Number((await request.formData()).get('weekStart'));
    if (weekStart !== 0 && weekStart !== 1) return fail(400, { error: 'Invalid week start.' });
    db.update(users).set({ weekStart }).where(eq(users.id, locals.user!.id)).run();
    return { prefsSaved: true };
  }
};
