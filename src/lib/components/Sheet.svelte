<script lang="ts">
  // Shared overlay shell: a bottom sheet on touch, a centred card on desktop.
  //
  // Wraps the overlay manager (use:modal → single-overlay discipline, focus trap,
  // Esc/backdrop close) and adds the spring-in / slide-out motion so every
  // transient surface — the meal menu here, and any future sheet — reads as one
  // family. Honours prefers-reduced-motion (snaps) and won't pop the keyboard
  // (modal focuses the panel, not the first input).
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { modal } from '$lib/actions/modal';
  import { portal } from '$lib/actions/portal';
  import { coarsePointer } from '$lib/pointer.svelte';
  import { reducedMotion } from '$lib/motion';
  import type { Snippet } from 'svelte';

  let {
    onclose,
    title,
    maxWidth = 420,
    children
  }: {
    onclose: () => void;
    title?: string;
    maxWidth?: number;
    children: Snippet;
  } = $props();

  const dur = $derived(reducedMotion() ? 0 : 240);
  // Slide up from the bottom on touch; a small lift for the desktop card.
  const flyY = $derived(reducedMotion() ? 0 : coarsePointer() ? 300 : 12);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" use:portal onclick={onclose} transition:fade={{ duration: dur }}>
  <div
    class="sheet"
    style="--maxw: {maxWidth}px"
    use:modal={{ onclose }}
    onclick={(e) => e.stopPropagation()}
    transition:fly={{ y: flyY, duration: dur, easing: cubicOut }}
  >
    {#if title}
      <div class="head">
        <b>{title}</b>
        <button class="x" type="button" onclick={onclose} aria-label="Close">✕</button>
      </div>
    {/if}
    <div class="sheet-body">{@render children()}</div>
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgba(40, 34, 28, 0.4);
    display: grid;
    place-items: center;
    padding: 24px;
    overscroll-behavior: contain;
  }
  .sheet {
    width: 100%;
    max-width: var(--maxw);
    background: #fff;
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(70, 60, 45, 0.22);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: 85vh;
  }
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--line);
  }
  .head b {
    font-size: 14px;
  }
  .x {
    border: none;
    background: transparent;
    color: var(--faint);
    cursor: pointer;
    font-size: 14px;
  }
  .sheet-body {
    padding: 16px;
    overflow: auto;
  }

  @media (max-width: 560px) {
    .backdrop {
      padding: 0;
      place-items: end stretch;
    }
    .sheet {
      max-width: none;
      border-radius: 16px 16px 0 0;
      max-height: 92dvh;
    }
    .sheet-body {
      padding-bottom: max(16px, env(safe-area-inset-bottom));
    }
  }
</style>
