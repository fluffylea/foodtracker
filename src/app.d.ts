import type { auth } from '$lib/server/auth';

type AuthUser = typeof auth.$Infer.Session.user;

declare global {
  namespace App {
    interface Locals {
      // `generateId: 'serial'` stores integer ids; the adapter coerces them to
      // numbers at runtime, so pin the type to number for the app's FK queries.
      user: (Omit<AuthUser, 'id'> & { id: number }) | null;
      session: typeof auth.$Infer.Session.session | null;
    }
    // interface Error {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
