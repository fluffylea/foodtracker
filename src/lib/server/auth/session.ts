import { randomBytes, createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import { db } from '../db/index';
import { sessions, users } from '../db/schema';

export const SESSION_COOKIE = 'session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 days
const RENEW_THRESHOLD_MS = SESSION_TTL_MS / 2; // sliding renewal past halfway

export type SessionUser = NonNullable<App.Locals['user']>;

/** Random opaque token handed to the client (cookie value). */
function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

/** The token is never stored raw — we key the row by its SHA-256. */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** Create a session for a user; returns the raw token to set as a cookie. */
export function createSession(userId: number): { token: string; expiresAt: number } {
  const token = generateToken();
  const id = hashToken(token);
  const expiresAt = Math.floor((Date.now() + SESSION_TTL_MS) / 1000);
  db.insert(sessions).values({ id, userId, expiresAt }).run();
  return { token, expiresAt };
}

/**
 * Validate a raw token. Returns the user (and possibly a refreshed expiry)
 * or null. Expired sessions are deleted. Sliding renewal extends the TTL
 * once a session is past its halfway point.
 */
export function validateToken(
  token: string
): { user: SessionUser; renewedExpiresAt?: number } | null {
  const id = hashToken(token);
  const row = db
    .select({
      session: sessions,
      user: {
        id: users.id,
        email: users.email,
        name: users.name,
        isAdmin: users.isAdmin,
        energyUnit: users.energyUnit,
        timezone: users.timezone,
        weekStart: users.weekStart
      }
    })
    .from(sessions)
    .innerJoin(users, eq(sessions.userId, users.id))
    .where(eq(sessions.id, id))
    .get();

  if (!row) return null;

  const nowMs = Date.now();
  if (row.session.expiresAt * 1000 <= nowMs) {
    db.delete(sessions).where(eq(sessions.id, id)).run();
    return null;
  }

  let renewedExpiresAt: number | undefined;
  if (row.session.expiresAt * 1000 - nowMs < RENEW_THRESHOLD_MS) {
    renewedExpiresAt = Math.floor((nowMs + SESSION_TTL_MS) / 1000);
    db.update(sessions).set({ expiresAt: renewedExpiresAt }).where(eq(sessions.id, id)).run();
  }

  return { user: row.user, renewedExpiresAt };
}

/** Delete a session by its raw token (logout). */
export function invalidateToken(token: string): void {
  db.delete(sessions).where(eq(sessions.id, hashToken(token))).run();
}

/** Set the session cookie (httpOnly, lax, secure in prod). */
export function setSessionCookie(cookies: Cookies, token: string, expiresAt: number): void {
  cookies.set(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    expires: new Date(expiresAt * 1000)
  });
}

export function clearSessionCookie(cookies: Cookies): void {
  cookies.delete(SESSION_COOKIE, { path: '/' });
}
