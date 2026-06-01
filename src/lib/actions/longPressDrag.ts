// Long-press-drag gesture — the shared primitive behind goal/meal reordering.
//
// The problem this solves: on touch there's no hover, so a draggable surface and
// a tappable surface are the same pixels. We disambiguate by *intent over time*:
//
//   • touch / pen — press and hold (still) for `delay` ms → the item "lifts" and
//     drag begins. Move before the hold completes = the user is scrolling, so we
//     bail and never interfere. A plain tap (down/up, no hold) passes through to
//     the element's own click (e.g. open editor).
//   • mouse — no artificial delay; a press that then moves past `moveTolerance`
//     starts the drag, a press that doesn't = a click.
//
// Once lifted we capture the pointer, suppress native scroll/selection, auto-
// scroll near the container edges, and swallow the trailing click so the drag
// never doubles as an "open". The action is reorder-agnostic: it reports gesture
// lifecycle via callbacks and leaves drop-target math to the caller.

import type { Action } from 'svelte/action';

export interface LongPressDragOptions {
  /** Hold time (ms) before a touch/pen press lifts into a drag. Default 200. */
  delay?: number;
  /** Pre-lift movement (px) that cancels a pending touch hold (= a scroll),
   *  or that starts a mouse drag. Default 8. */
  moveTolerance?: number;
  /** When true the gesture is inert (e.g. not "today", so not reorderable). */
  disabled?: boolean;
  /** CSS selector for a drag handle: only a press that lands inside it starts
   *  the gesture. Lets a container be the draggable (and the clone) while a
   *  press elsewhere in it — e.g. a child row with its own drag — passes through. */
  handle?: string;
  /** Auto-scroll the nearest scroll container when dragging near its edges. */
  autoScroll?: boolean;
  /** Fired when the item lifts (drag begins). */
  onLift?: (e: PointerEvent) => void;
  /** Fired on every move while dragging (after lift). */
  onMove?: (e: PointerEvent) => void;
  /** Fired on release after a drag. */
  onDrop?: (e: PointerEvent) => void;
  /** Fired if the drag is cancelled (pointercancel / interrupted). */
  onCancel?: () => void;
}

const EDGE = 56; // px from the container edge where auto-scroll kicks in
const MAX_SCROLL = 14; // px per frame at full tilt

export const longPressDrag: Action<HTMLElement, LongPressDragOptions | undefined> = (
  node,
  params
) => {
  let opts: LongPressDragOptions = params ?? {};

  let holdTimer: ReturnType<typeof setTimeout> | null = null;
  let pointerId = -1;
  let startX = 0;
  let startY = 0;
  let lastEvent: PointerEvent | null = null;
  let lifted = false;
  let pending = false; // pointer down, not yet lifted
  let isMouse = false;
  let scroller: HTMLElement | null = null;
  let raf = 0;

  const delay = () => opts.delay ?? 200;
  const tol = () => opts.moveTolerance ?? 8;

  function nearestScroller(el: HTMLElement): HTMLElement | null {
    let cur: HTMLElement | null = el.parentElement;
    while (cur) {
      const oy = getComputedStyle(cur).overflowY;
      if ((oy === 'auto' || oy === 'scroll') && cur.scrollHeight > cur.clientHeight) return cur;
      cur = cur.parentElement;
    }
    return null;
  }

  // Block native touch-scroll/selection only while actually dragging, so a
  // normal flick over the item still scrolls before the hold completes.
  function blockTouchMove(e: TouchEvent) {
    if (lifted) e.preventDefault();
  }

  function autoScrollTick() {
    raf = requestAnimationFrame(autoScrollTick);
    if (!lifted || !lastEvent || opts.autoScroll === false) return;
    const y = lastEvent.clientY;
    let dy = 0;
    if (scroller) {
      const r = scroller.getBoundingClientRect();
      if (y < r.top + EDGE) dy = -((r.top + EDGE - y) / EDGE) * MAX_SCROLL;
      else if (y > r.bottom - EDGE) dy = ((y - (r.bottom - EDGE)) / EDGE) * MAX_SCROLL;
      if (dy) scroller.scrollBy(0, dy);
    } else {
      const h = window.innerHeight;
      if (y < EDGE) dy = -((EDGE - y) / EDGE) * MAX_SCROLL;
      else if (y > h - EDGE) dy = ((y - (h - EDGE)) / EDGE) * MAX_SCROLL;
      if (dy) window.scrollBy(0, dy);
    }
    // Finger is stationary but content scrolled under it → recompute drop target.
    if (dy) opts.onMove?.(lastEvent);
  }

  function lift(e: PointerEvent) {
    if (lifted) return;
    lifted = true;
    pending = false;
    clearHold();
    try {
      node.setPointerCapture(e.pointerId);
    } catch {
      /* capture can throw if the pointer already ended */
    }
    document.body.classList.add('dragging-active');
    navigator.vibrate?.(10);
    scroller = nearestScroller(node);
    raf = requestAnimationFrame(autoScrollTick);
    opts.onLift?.(e);
  }

  function suppressNextClick() {
    const swallow = (e: MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      window.removeEventListener('click', swallow, true);
    };
    window.addEventListener('click', swallow, true);
    setTimeout(() => window.removeEventListener('click', swallow, true), 350);
  }

  function clearHold() {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
  }

  function teardown() {
    clearHold();
    cancelAnimationFrame(raf);
    raf = 0;
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    document.body.classList.remove('dragging-active');
    scroller = null;
    lastEvent = null;
    pointerId = -1;
    // Reset gesture state here (the single exit point) so a completed drag can be
    // started again — otherwise `lifted` stays true and the next press is ignored.
    lifted = false;
    pending = false;
  }

  function onPointerDown(e: PointerEvent) {
    if (opts.disabled || pending || lifted) return;
    if (opts.handle && !(e.target as Element | null)?.closest(opts.handle)) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pending = true;
    isMouse = e.pointerType === 'mouse';
    pointerId = e.pointerId;
    startX = e.clientX;
    startY = e.clientY;
    lastEvent = e;
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    // Touch/pen: hold still to lift. Mouse: lift on movement instead (below).
    if (!isMouse) holdTimer = setTimeout(() => lastEvent && lift(lastEvent), delay());
  }

  function onPointerMove(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    lastEvent = e;
    if (lifted) {
      e.preventDefault();
      opts.onMove?.(e);
      return;
    }
    if (!pending) return;
    const moved = Math.hypot(e.clientX - startX, e.clientY - startY);
    if (moved <= tol()) return;
    if (isMouse) lift(e); // mouse: movement *is* the drag intent
    else cancel(); // touch: movement before the hold = a scroll, bow out
  }

  function onPointerUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    if (lifted) {
      opts.onDrop?.(e);
      suppressNextClick(); // a real drag must not also "open"
      teardown();
    } else {
      cancel(); // never lifted → a tap; let the click through
    }
  }

  function onPointerCancel(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    if (lifted) opts.onCancel?.();
    teardown();
    pending = false;
    lifted = false;
  }

  // Bail out of a pending/active gesture without firing drop.
  function cancel() {
    const wasLifted = lifted;
    teardown();
    pending = false;
    lifted = false;
    if (wasLifted) opts.onCancel?.();
  }

  node.addEventListener('pointerdown', onPointerDown);
  node.addEventListener('touchmove', blockTouchMove, { passive: false });

  return {
    update(next) {
      opts = next ?? {};
    },
    destroy() {
      cancel();
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('touchmove', blockTouchMove);
    }
  };
};
