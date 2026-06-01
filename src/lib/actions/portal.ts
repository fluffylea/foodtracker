// `use:portal` — relocate an element to the end of <body> on mount.
//
// Needed because the day/period pager translates its track with `transform`,
// which makes any `position: fixed` descendant (modal backdrops, the FAB)
// position and clip relative to the *moved* track instead of the viewport — so
// overlays opened from inside a pane would render off-screen. Portalling them to
// <body> escapes that containing block. Svelte still owns the node's lifecycle
// (and transitions); we just move it and remove it on destroy.

import type { Action } from 'svelte/action';

export const portal: Action<HTMLElement> = (node) => {
  document.body.appendChild(node);
  return {
    destroy() {
      node.remove();
    }
  };
};
