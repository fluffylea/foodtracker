// Reactive "is this a touch / coarse pointer?" flag.
//
// Touch behaviour (long-press to drag, scrub-to-read, finger-sized hit slop)
// should branch on the *input type*, not the viewport width — otherwise a narrow
// desktop window inherits finger behaviour and a stylus tablet misses out. Read
// it in a component via `coarsePointer()`; it updates live if the primary
// pointer changes (e.g. a 2-in-1 docking a mouse).

import { browser } from '$app/environment';

let coarse = $state(false);

if (browser) {
  const mq = window.matchMedia('(pointer: coarse)');
  coarse = mq.matches;
  mq.addEventListener('change', (e) => (coarse = e.matches));
}

/** Reactive: true when the primary pointer is coarse (touch). */
export function coarsePointer(): boolean {
  return coarse;
}
