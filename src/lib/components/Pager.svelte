<script lang="ts">
  // Finger-following horizontal pager — the shared primitive behind Diary
  // day-swipe and Trends period-swipe.
  //
  // It lays out three full-width panes (prev / current / next) in a track and
  // moves the track with the finger. A short drag that crosses a threshold (or a
  // quick flick) springs the neighbour to centre and fires `oncommit`; otherwise
  // it springs back. The parent reacts to `oncommit` by navigating; once the new
  // page's identity arrives (the `key` prop changes) we snap the track back to 0
  // *instantly* — because the pane that was off-screen is now the centred
  // `current`, so the swap is seamless (no flash, no second animation).
  //
  // Intent arbitration: `touch-action: pan-y` lets the browser own vertical
  // scrolling natively; we only claim a gesture once horizontal travel dominates
  // and no reorder drag is in flight. Taps fall straight through to children.

  import { Spring } from 'svelte/motion';
  import type { Snippet } from 'svelte';
  import { overlayOpen } from '$lib/overlay.svelte';
  import { reducedMotion } from '$lib/motion';

  let {
    key,
    hasPrev = true,
    hasNext = true,
    oncommit,
    prev,
    current,
    next,
    threshold = 0.22
  }: {
    /** Identity of the centred page. Changing it = the parent committed a nav. */
    key: string | number;
    hasPrev?: boolean;
    hasNext?: boolean;
    oncommit: (dir: 'prev' | 'next') => void;
    prev?: Snippet;
    current: Snippet;
    next?: Snippet;
    /** Fraction of a pane the finger must cross to page (unless flicked). */
    threshold?: number;
  } = $props();

  // Track offset in pane-fractions: 0 = current centred, +1 = prev shown, -1 = next.
  const off = new Spring(0, { stiffness: 0.17, damping: 0.74 });

  let root: HTMLDivElement;
  let width = 1;

  let pointerId = -1;
  let startX = 0;
  let startY = 0;
  let owning = false; // the gesture is ours (horizontal)
  let decided = false; // h-vs-v already resolved for this gesture
  let committing = false; // animating into a commit; ignore new input until `key` flips
  let lastX = 0;
  let lastT = 0;
  let velocity = 0; // pane-fractions per ms (sign = direction)

  // Parent committed the navigation → the off-screen pane is now `current`.
  // Snap home with no animation so the visual stays put across the swap.
  $effect(() => {
    key; // tracked
    committing = false;
    off.set(0, { instant: true });
  });

  function rubber(f: number): number {
    // Resistance when dragging toward a blocked edge.
    if (f > 0 && !hasPrev) return f * 0.3;
    if (f < 0 && !hasNext) return f * 0.3;
    return Math.max(-1, Math.min(1, f));
  }

  function onDown(e: PointerEvent) {
    if (committing || pointerId !== -1 || overlayOpen()) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    pointerId = e.pointerId;
    startX = lastX = e.clientX;
    startY = e.clientY;
    lastT = e.timeStamp;
    owning = false;
    decided = false;
    velocity = 0;
    width = root.getBoundingClientRect().width || 1;
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
  }

  function onMove(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    if (!decided) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      decided = true;
      // Claim only a clearly-horizontal gesture, and never while a reorder drag
      // owns the pointer (it sets body.dragging-active).
      if (Math.abs(dx) > Math.abs(dy) && !document.body.classList.contains('dragging-active')) {
        owning = true;
        try {
          root.setPointerCapture(e.pointerId);
        } catch {
          /* pointer may already be gone */
        }
      } else {
        release(); // vertical scroll or reorder — bow out, let the browser have it
        return;
      }
    }
    if (!owning) return;
    e.preventDefault();

    const dt = e.timeStamp - lastT;
    if (dt > 0) velocity = (e.clientX - lastX) / width / dt;
    lastX = e.clientX;
    lastT = e.timeStamp;

    off.set(rubber(dx / width), { instant: true });
  }

  function onUp(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    if (!owning) {
      release();
      return;
    }
    const f = off.current;
    const flick = 0.0009;
    if ((f < -threshold || velocity < -flick) && hasNext) commit('next');
    else if ((f > threshold || velocity > flick) && hasPrev) commit('prev');
    else snapBack();
    release();
  }

  function onCancel(e: PointerEvent) {
    if (e.pointerId !== pointerId) return;
    if (owning) snapBack();
    release();
  }

  function release() {
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    window.removeEventListener('pointercancel', onCancel);
    owning = false;
    decided = false;
    pointerId = -1;
  }

  function snapBack() {
    off.set(0, reducedMotion() ? { instant: true } : undefined);
  }

  async function commit(dir: 'prev' | 'next') {
    committing = true;
    const target = dir === 'prev' ? 1 : -1;
    // Slide the neighbour to centre, *then* tell the parent to navigate. The
    // route data is already preloaded, so the swap (and the instant snap-home in
    // the `key` effect) lands seamlessly under the finished slide.
    await off.set(target, reducedMotion() ? { instant: true } : undefined);
    oncommit(dir);
  }

  /** Programmatic paging (header ‹ › arrows) — same animation as a swipe. */
  export function go(dir: 'prev' | 'next') {
    if (committing) return;
    if (dir === 'prev' && !hasPrev) return;
    if (dir === 'next' && !hasNext) return;
    commit(dir);
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="pager" bind:this={root} onpointerdown={onDown}>
  <div class="track" style="transform: translate3d(calc(({off.current} - 1) * 100%), 0, 0)">
    <div class="pane">{#if prev}{@render prev()}{/if}</div>
    <div class="pane">{@render current()}</div>
    <div class="pane">{#if next}{@render next()}{/if}</div>
  </div>
</div>

<style>
  .pager {
    /* Vertical scroll stays with the browser; we only take horizontal. */
    touch-action: pan-y;
    overflow-x: clip;
  }
  .track {
    display: flex;
    will-change: transform;
  }
  .pane {
    flex: 0 0 100%;
    min-width: 0;
  }
</style>
