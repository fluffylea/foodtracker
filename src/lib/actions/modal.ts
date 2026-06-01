// `use:modal` — turns any panel element into a well-behaved dialog:
//   • registers with the overlay stack (single source of truth for "open")
//   • Escape closes — but only the top-most overlay, so nested ones don't all go
//   • traps Tab focus inside the panel (keyboard users can't wander behind it)
//   • restores focus to whatever opened it on close
//
// It deliberately focuses the panel itself, not the first input, so opening a
// sheet on mobile doesn't immediately pop the keyboard. Backdrop click-to-close
// stays in each component; this layers on the keyboard/focus discipline.

import { pushOverlay, popOverlay, isTopOverlay } from '$lib/overlay.svelte';

export interface ModalOptions {
  onclose?: () => void;
}

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

export function modal(node: HTMLElement, params: ModalOptions = {}) {
  let opts = params;
  const id = pushOverlay();
  const prevFocus = document.activeElement as HTMLElement | null;

  function focusables(): HTMLElement[] {
    return Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null
    );
  }

  function onKeydown(e: KeyboardEvent) {
    if (!isTopOverlay(id) || e.isComposing) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      opts.onclose?.();
      return;
    }
    if (e.key !== 'Tab') return;
    const f = focusables();
    if (f.length === 0) {
      e.preventDefault();
      node.focus();
      return;
    }
    const first = f[0];
    const last = f[f.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || !node.contains(active))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  node.setAttribute('role', node.getAttribute('role') ?? 'dialog');
  node.setAttribute('aria-modal', 'true');
  if (!node.hasAttribute('tabindex')) node.setAttribute('tabindex', '-1');
  document.addEventListener('keydown', onKeydown, true);
  // Defer so the node is mounted & painted before we move focus into it.
  const t = setTimeout(() => {
    if (!node.contains(document.activeElement)) node.focus();
  }, 0);

  return {
    update(next: ModalOptions) {
      opts = next ?? {};
    },
    destroy() {
      clearTimeout(t);
      document.removeEventListener('keydown', onKeydown, true);
      popOverlay(id);
      prevFocus?.focus?.();
    }
  };
}
