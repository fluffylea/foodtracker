// Reorder engine — the shared drag-and-drop behind goals, meals, and entries.
//
// Feel goal: the lifted thing sticks to the finger while everything else glides
// out of its way. We get that by splitting the two halves:
//
//   • A floating *clone* of the item is appended to <body> and tracks the finger
//     in viewport space (position: fixed + transform). It alone follows the drag.
//   • The real item stays in its keyed `{#each}` and is reordered *live* in the
//     model as the finger crosses neighbours. Svelte's `animate:flip` then slides
//     the siblings — and the item itself — to their new slots. The real item is
//     hidden (`.reorder-placeholder`) for the duration, so it reads as the empty
//     gap the clone will drop into. The component drives that hide off the
//     reactive `draggingId`, so the hide follows the item even when it hops to
//     another group (the node is destroyed in list A and recreated in list B).
//
// The gesture itself (long-press to lift on touch, tap still opens, drag on
// mouse, pointer capture, auto-scroll, click suppression) is reused wholesale
// from `use:longPressDrag`; this layer only adds the clone + drop-target math.

import { longPressDrag } from '$lib/actions/longPressDrag';
import { reducedMotion } from '$lib/motion';

export interface ReshuffleArgs {
  kind: string;
  dragId: number;
  /** Group the item is being dropped into (e.g. a meal id; 0 for single-list). */
  toGroup: number | string;
  /** Item under the cursor to anchor against, or null when over an empty group. */
  refId: number | null;
  /** Insert before `refId` (else after). Ignored when `refId` is null (append). */
  before: boolean;
}

export interface ReorderItemParams {
  kind: string;
  group: number | string;
  id: number;
  disabled?: boolean;
  /** Restrict the lift to a handle inside the item (e.g. a meal's grip). */
  handle?: string;
}

export interface ReorderOptions {
  /** Apply a live move to the model so the keyed lists (and FLIP) update. */
  reshuffle: (a: ReshuffleArgs) => void;
  /** Persist the final order for `kind` (called once, on release). */
  commit: (kind: string) => void | Promise<void>;
  /** Drop-target axis per kind: 'y' for vertical lists, 'x' for grids. */
  axisFor?: (kind: string) => 'x' | 'y';
}

function once(el: HTMLElement, type: string, timeoutMs: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const fin = () => {
      if (done) return;
      done = true;
      el.removeEventListener(type, fin);
      resolve();
    };
    el.addEventListener(type, fin);
    setTimeout(fin, timeoutMs);
  });
}

export function createReorder(opts: ReorderOptions) {
  // Reactive so components can hide the live item via class:reorder-placeholder.
  let dragId = $state<number | null>(null);
  let dragKind = $state<string | null>(null);

  let clone: HTMLElement | null = null;
  let startX = 0;
  let startY = 0;
  let baseLeft = 0; // clone's fixed origin (viewport px) at lift
  let baseTop = 0;

  const axis = (kind: string): 'x' | 'y' => (opts.axisFor ? opts.axisFor(kind) : 'y');

  function parseGroup(s: string | null): number | string {
    if (s === null || s.trim() === '') return 0;
    const n = Number(s);
    return Number.isFinite(n) ? n : s;
  }

  function lift(node: HTMLElement, kind: string, _group: number | string, id: number, e: PointerEvent) {
    dragId = id;
    dragKind = kind;
    const rect = node.getBoundingClientRect();
    baseLeft = rect.left;
    baseTop = rect.top;
    startX = e.clientX;
    startY = e.clientY;

    clone = node.cloneNode(true) as HTMLElement;
    clone.classList.add('reorder-clone');
    clone.style.left = `${rect.left}px`;
    clone.style.top = `${rect.top}px`;
    clone.style.width = `${rect.width}px`;
    clone.style.height = `${rect.height}px`;
    clone.style.transform = 'translate3d(0,0,0) scale(1.03)';
    // The clone must never be a hit-test or query target for itself.
    clone.removeAttribute('data-reorder-id');
    clone.setAttribute('aria-hidden', 'true');
    document.body.appendChild(clone);
  }

  function move(e: PointerEvent) {
    if (dragId === null || dragKind === null || !clone) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    clone.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(1.03)`;

    const kind = dragKind;
    const under = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;

    const itemEl = under?.closest(`[data-reorder-kind="${kind}"]`) as HTMLElement | null;
    if (itemEl) {
      const tId = Number(itemEl.getAttribute('data-reorder-id'));
      if (!Number.isInteger(tId) || tId === dragId) return;
      const r = itemEl.getBoundingClientRect();
      const before =
        axis(kind) === 'y' ? e.clientY < r.top + r.height / 2 : e.clientX < r.left + r.width / 2;
      opts.reshuffle({
        kind,
        dragId,
        toGroup: parseGroup(itemEl.getAttribute('data-reorder-group')),
        refId: tId,
        before
      });
      return;
    }

    // Between/around items: fall back to the nearest group drop-zone (covers
    // empty meals and the slack at a list's end) and append there.
    const zone = under?.closest(`[data-reorder-zone="${kind}"]`) as HTMLElement | null;
    if (zone) {
      opts.reshuffle({
        kind,
        dragId,
        toGroup: parseGroup(zone.getAttribute('data-reorder-group')),
        refId: null,
        before: false
      });
    }
  }

  async function finish() {
    const kind = dragKind;
    const id = dragId;
    if (kind === null || id === null) {
      cleanup();
      return;
    }
    // Fly the clone to the item's final resting slot (it may have changed group).
    const dest = document.querySelector(
      `[data-reorder-kind="${kind}"][data-reorder-id="${id}"]`
    ) as HTMLElement | null;
    if (clone && dest && !reducedMotion()) {
      const r = dest.getBoundingClientRect();
      clone.classList.add('settling');
      clone.style.transform = `translate3d(${r.left - baseLeft}px, ${r.top - baseTop}px, 0) scale(1)`;
      await once(clone, 'transitionend', 220);
    }
    cleanup(); // reveals the real item, removes the clone
    await opts.commit(kind);
  }

  function cleanup() {
    clone?.remove();
    clone = null;
    dragId = null;
    dragKind = null;
  }

  function reorderItem(node: HTMLElement, params: ReorderItemParams) {
    let p = params;
    const bind = () => ({
      disabled: p.disabled,
      handle: p.handle,
      onLift: (e: PointerEvent) => lift(node, p.kind, p.group, p.id, e),
      onMove: (e: PointerEvent) => move(e),
      onDrop: () => finish(),
      // An interrupted drag keeps whatever arrangement is on screen and persists
      // it, so what the user sees is what's saved.
      onCancel: () => finish()
    });
    const lp = longPressDrag(node, bind());
    return {
      update(next: ReorderItemParams) {
        p = next;
        lp?.update?.(bind());
      },
      destroy() {
        lp?.destroy?.();
      }
    };
  }

  return {
    reorderItem,
    get draggingId() {
      return dragId;
    },
    get draggingKind() {
      return dragKind;
    }
  };
}
