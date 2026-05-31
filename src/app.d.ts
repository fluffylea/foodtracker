import type { User } from '$lib/server/db/schema';

declare global {
  namespace App {
    interface Locals {
      user: Pick<
        User,
        'id' | 'email' | 'name' | 'isAdmin' | 'energyUnit' | 'timezone' | 'weekStart'
      > | null;
    }
    // interface Error {}
    // interface PageData {}
    // interface PageState {}
    // interface Platform {}
  }
}

export {};
