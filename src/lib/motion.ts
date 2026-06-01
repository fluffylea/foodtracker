// Motion helpers shared by the gesture primitives.
//
// One job: answer "should we animate, or snap?" so springs, FLIP, and the
// drag-clone all honour the user's `prefers-reduced-motion` setting from a
// single place. Read once at module load and kept live for the rare runtime
// toggle. Safe to import on the server (guards on `window`).

import { browser } from '$app/environment';

let reduced = false;

if (browser) {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  reduced = mq.matches;
  mq.addEventListener('change', (e) => (reduced = e.matches));
}

/** True when the user asked for reduced motion — callers should snap, not animate. */
export function reducedMotion(): boolean {
  return reduced;
}

/** FLIP `animate:` duration: 0 under reduced-motion, else the theme token (220ms). */
export function flipDuration(): number {
  return reduced ? 0 : 220;
}
