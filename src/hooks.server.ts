import { redirect, type Handle } from '@sveltejs/kit';
import { runMigrations } from '$lib/server/db/migrate';
import {
  SESSION_COOKIE,
  validateToken,
  setSessionCookie,
  clearSessionCookie
} from '$lib/server/auth/session';

// Run migrations + seed once at server startup. Idempotent.
let migrated = false;
async function ensureMigrated() {
  if (migrated) return;
  await runMigrations();
  migrated = true;
}

// Paths reachable without a session.
function isPublic(pathname: string): boolean {
  return pathname === '/login';
}

export const handle: Handle = async ({ event, resolve }) => {
  await ensureMigrated();

  // Resolve the session from its cookie.
  event.locals.user = null;
  const token = event.cookies.get(SESSION_COOKIE);
  if (token) {
    const result = validateToken(token);
    if (result) {
      event.locals.user = result.user;
      if (result.renewedExpiresAt) {
        setSessionCookie(event.cookies, token, result.renewedExpiresAt);
      }
    } else {
      clearSessionCookie(event.cookies);
    }
  }

  // Guard everything except public paths.
  const { pathname } = event.url;
  if (!event.locals.user && !isPublic(pathname)) {
    // Preserve where they were headed so login can bounce back.
    const redirectTo = pathname === '/' ? '' : `?redirectTo=${encodeURIComponent(pathname + event.url.search)}`;
    redirect(307, `/login${redirectTo}`);
  }

  // Logged-in users shouldn't sit on the login page.
  if (event.locals.user && pathname === '/login') {
    redirect(307, '/');
  }

  return resolve(event);
};
