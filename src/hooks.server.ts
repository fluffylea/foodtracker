import { redirect, type Handle } from '@sveltejs/kit';
import { building } from '$app/environment';
import { runMigrations } from '$lib/server/db/migrate';
import { auth } from '$lib/server/auth';
import { svelteKitHandler } from 'better-auth/svelte-kit';

// Run migrations + seed once at server startup. Idempotent.
let migrated = false;
async function ensureMigrated() {
  if (migrated) return;
  await runMigrations();
  migrated = true;
}

// Paths reachable without a session: the login page and Better Auth's own
// endpoints (sign-in, OAuth callback, etc.).
function isPublic(pathname: string): boolean {
  return pathname === '/login' || pathname.startsWith('/api/auth');
}

export const handle: Handle = async ({ event, resolve }) => {
  await ensureMigrated();

  // Resolve the session from the request (Better Auth reads its own cookie).
  // Better Auth types `id` as string but `generateId: 'serial'` makes it numeric
  // at runtime; normalize so the app's integer FK queries type-check.
  const session = await auth.api.getSession({ headers: event.request.headers });
  event.locals.user = session ? { ...session.user, id: Number(session.user.id) } : null;
  event.locals.session = session?.session ?? null;

  // Guard everything except public paths.
  const { pathname } = event.url;
  if (!event.locals.user && !isPublic(pathname)) {
    // Preserve where they were headed so login can bounce back.
    const redirectTo =
      pathname === '/' ? '' : `?redirectTo=${encodeURIComponent(pathname + event.url.search)}`;
    redirect(307, `/login${redirectTo}`);
  }

  // Logged-in users shouldn't sit on the login page.
  if (event.locals.user && pathname === '/login') {
    redirect(307, '/');
  }

  return svelteKitHandler({
    event,
    auth,
    building,
    resolve: async (event) => {
      const response = await resolve(event);

      // Make the charset explicit on HTML. SvelteKit emits `text/html` without a
      // charset and relies on the <meta charset> prescan — but once the PWA service
      // worker serves pages via respondWith, some mobile browsers skip that prescan
      // and default to Latin-1, garbling every multi-byte glyph. An explicit header
      // is unambiguous everywhere.
      const type = response.headers.get('content-type');
      if (type === 'text/html') {
        response.headers.set('content-type', 'text/html; charset=utf-8');
      }
      return response;
    }
  });
};
