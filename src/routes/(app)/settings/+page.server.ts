import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { users } from '$lib/server/db/schema';
import { hashPassword } from '$lib/server/auth/password';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
  const me = locals.user!;
  // Only admins see the account list.
  const accounts = me.isAdmin
    ? db
        .select({ id: users.id, email: users.email, name: users.name, isAdmin: users.isAdmin })
        .from(users)
        .orderBy(users.id)
        .all()
    : [];
  return { accounts };
};

export const actions: Actions = {
  savePrefs: async ({ request, locals }) => {
    const weekStart = Number((await request.formData()).get('weekStart'));
    if (weekStart !== 0 && weekStart !== 1) return fail(400, { error: 'Invalid week start.' });
    db.update(users).set({ weekStart }).where(eq(users.id, locals.user!.id)).run();
    return { prefsSaved: true };
  },

  createUser: async ({ request, locals }) => {
    if (!locals.user?.isAdmin) return fail(403, { error: 'Admins only.' });

    const f = await request.formData();
    const email = String(f.get('email') ?? '').trim().toLowerCase();
    const name = String(f.get('name') ?? '').trim();
    const password = String(f.get('password') ?? '');
    const isAdmin = f.get('isAdmin') === 'on';

    if (!email || !name || !password) {
      return fail(400, { error: 'Name, email and password are required.', email, name });
    }
    if (password.length < 8) {
      return fail(400, { error: 'Password must be at least 8 characters.', email, name });
    }
    const existing = db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
    if (existing) {
      return fail(400, { error: 'A user with that email already exists.', email, name });
    }

    const passwordHash = await hashPassword(password);
    db.insert(users).values({ email, name, passwordHash, isAdmin }).run();
    return { created: email };
  },

  deleteUser: async ({ request, locals }) => {
    if (!locals.user?.isAdmin) return fail(403, { error: 'Admins only.' });

    const f = await request.formData();
    const id = Number(f.get('id'));
    if (!Number.isInteger(id)) return fail(400, { error: 'Invalid user.' });
    if (id === locals.user.id) return fail(400, { error: 'You cannot delete your own account.' });

    // FK cascades remove the user's sessions, foods, diary, goals, etc.
    db.delete(users).where(eq(users.id, id)).run();
    return { deleted: id };
  }
};
