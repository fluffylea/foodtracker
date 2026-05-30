import type { LayoutServerLoad } from './$types';

// The guard in hooks.server.ts guarantees a user here; expose it to the UI.
export const load: LayoutServerLoad = ({ locals }) => {
  return { user: locals.user! };
};
