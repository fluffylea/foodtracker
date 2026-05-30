import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE, invalidateToken, clearSessionCookie } from '$lib/server/auth/session';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies }) => {
  const token = cookies.get(SESSION_COOKIE);
  if (token) invalidateToken(token);
  clearSessionCookie(cookies);
  redirect(303, '/login');
};
