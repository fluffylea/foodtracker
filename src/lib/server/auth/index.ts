import { betterAuth } from 'better-auth';
import { genericOAuth } from 'better-auth/plugins';
import { sveltekitCookies } from 'better-auth/svelte-kit';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { getRequestEvent } from '$app/server';
import { env } from '$env/dynamic/private';
import { db, schema } from '../db/index';

/**
 * Better Auth instance. Auth is **SSO-only** against a single self-hosted
 * Authentik (OIDC) provider — there is no email/password login. Accounts are
 * auto-provisioned on first successful SSO login (who *can* sign in is governed
 * by Authentik's application/group binding, not this app).
 *
 * IDs stay integer auto-increment (`generateId: 'serial'`) so every existing
 * `users.id` foreign key (foods, diary, meal groups, goals) is preserved.
 */
export const auth = betterAuth({
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: 'sqlite', usePlural: true, schema }),
  advanced: {
    // Use SQLite's auto-increment integer ids rather than generated strings.
    database: { generateId: 'serial' }
  },
  // SSO-only: no local credentials.
  emailAndPassword: { enabled: false },
  // App-managed columns Better Auth must surface on the session user. Not
  // client-settable (`input: false`); the app writes them directly via Drizzle.
  user: {
    additionalFields: {
      isAdmin: { type: 'boolean', defaultValue: false, input: false },
      energyUnit: { type: 'string', defaultValue: 'kcal', input: false },
      timezone: { type: 'string', defaultValue: 'UTC', input: false },
      weekStart: { type: 'number', defaultValue: 1, input: false }
    }
  },
  trustedOrigins: [env.BETTER_AUTH_URL, 'http://localhost:5173'].filter(Boolean) as string[],
  plugins: [
    genericOAuth({
      config: [
        {
          providerId: 'authentik',
          discoveryUrl: env.OIDC_DISCOVERY_URL,
          clientId: env.OIDC_CLIENT_ID,
          clientSecret: env.OIDC_CLIENT_SECRET,
          scopes: ['openid', 'email', 'profile'],
          // Identity is the OIDC `sub` (stored on the account); Better Auth still
          // requires a unique email on the user row. Authentik accounts are
          // username-based and may have no email, so fall back to a deterministic
          // synthetic address on a dedicated subdomain (never a real mailbox).
          // Real emails are used whenever the provider supplies one.
          mapProfileToUser: (profile) => {
            const username = profile.preferred_username || profile.nickname || profile.sub;
            return {
              name: profile.name || username,
              email: profile.email || `${username}@sso.becutewith.me`
            };
          }
        }
      ]
    }),
    // Must be last: lets server-side auth.api calls set cookies via SvelteKit.
    sveltekitCookies(getRequestEvent)
  ]
});
