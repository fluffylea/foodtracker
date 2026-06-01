// Overlay manager — the single source of truth for "what's open on top".
//
// The cascading-modal trap on Today happens because nothing coordinates the
// transient surfaces: dismissing one lets the same tap open another. This stack
// gives every modal / sheet / menu one place to register, so we can answer two
// questions reliably:
//
//   • overlayOpen()      — is anything open? (a drag, say, shouldn't start mid-modal)
//   • isTopOverlay(id)   — am I the active one? (so Escape only closes the top)
//
// The `modal` action (src/lib/actions/modal.ts) drives this for full-screen
// dialogs; Phase 2's `⋯` menus will register the same way.

let stack = $state<symbol[]>([]);

/** Register a new top-most overlay; returns its id for later removal. */
export function pushOverlay(): symbol {
  const id = Symbol('overlay');
  stack = [...stack, id];
  return id;
}

/** Remove an overlay from the stack (no-op if already gone). */
export function popOverlay(id: symbol): void {
  stack = stack.filter((x) => x !== id);
}

/** Reactive: is any overlay currently open? */
export function overlayOpen(): boolean {
  return stack.length > 0;
}

/** Is `id` the top-most (active) overlay? */
export function isTopOverlay(id: symbol): boolean {
  return stack.length > 0 && stack[stack.length - 1] === id;
}
