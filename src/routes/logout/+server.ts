import { redirect } from '@sveltejs/kit';
import { auth } from '$lib/server/auth';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
  // Clears the Better Auth session + cookie (propagated via the sveltekitCookies plugin).
  await auth.api.signOut({ headers: request.headers });
  redirect(303, '/login');
};
