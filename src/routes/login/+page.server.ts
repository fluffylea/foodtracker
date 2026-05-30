import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db/index';
import { users } from '$lib/server/db/schema';
import { verifyPassword } from '$lib/server/auth/password';
import { createSession, setSessionCookie } from '$lib/server/auth/session';
import type { Actions } from './$types';

// Only allow same-origin internal paths as redirect targets.
function safeRedirect(target: string | null): string {
  if (target && target.startsWith('/') && !target.startsWith('//')) return target;
  return '/';
}

export const actions: Actions = {
  default: async ({ request, cookies, url }) => {
    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim().toLowerCase();
    const password = String(form.get('password') ?? '');

    if (!email || !password) {
      return fail(400, { email, error: 'Email and password are required.' });
    }

    const user = db.select().from(users).where(eq(users.email, email)).get();
    // Always run a hash comparison to avoid leaking whether the email exists.
    const ok = user
      ? await verifyPassword(user.passwordHash, password)
      : await verifyPassword('0:0', password);

    if (!user || !ok) {
      return fail(400, { email, error: 'Invalid email or password.' });
    }

    const { token, expiresAt } = createSession(user.id);
    setSessionCookie(cookies, token, expiresAt);

    redirect(303, safeRedirect(url.searchParams.get('redirectTo')));
  }
};
