<script lang="ts">
  import { goto } from '$app/navigation';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { modal } from '$lib/actions/modal';
  import { coarsePointer } from '$lib/pointer.svelte';
  import { reducedMotion } from '$lib/motion';
  import FoodForm from '$lib/components/FoodForm.svelte';

  let { data } = $props();

  const dur = $derived(reducedMotion() ? 0 : 240);
  const flyY = $derived(reducedMotion() ? 0 : coarsePointer() ? 320 : 12);

  let filter = $state('');
  const shown = $derived(
    data.foods.filter((f) => {
      const q = filter.trim().toLowerCase();
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        (f.brand ?? '').toLowerCase().includes(q) ||
        (f.barcode ?? '').includes(q)
      );
    })
  );

  const showEditor = $derived(data.isNew || data.selected !== null);
  const editorKey = $derived(data.isNew ? 'new' : (data.selected?.id ?? 'none'));

  function close() {
    goto('/foods');
  }
  function fmtEnergy(v: number | null): string {
    return v === null ? '—' : `${Math.round(v)} kcal`;
  }
</script>

<svelte:head><title>Plate · Foods</title></svelte:head>

<header class="top">
  <div class="date-t">
    <h2>My foods</h2>
    <div class="sub">local layer · custom foods &amp; overrides</div>
  </div>
  <a class="btn" href="/foods?new=1">+ New food</a>
</header>

<div class="body">
  <input class="search" placeholder="Filter my foods…" bind:value={filter} />
  {#if shown.length === 0}
    <div class="empty-list">
      {data.foods.length === 0 ? 'No foods yet — create one →' : 'No matches.'}
    </div>
  {:else}
    <div class="flist">
      {#each shown as f (f.id)}
        <a class="frow" href="/foods?id={f.id}">
          <span class="fnm">{f.name}{#if f.brand}<em> · {f.brand}</em>{/if}</span>
          <span class="tag {f.source === 'off' ? 'ov' : 'cu'}">{f.source === 'off' ? 'Override' : 'Custom'}</span>
          <span class="fk">{fmtEnergy(f.energyPer100g)}</span>
          <span class="fu">{['g', ...f.unitNames].join(' · ')}</span>
        </a>
      {/each}
    </div>
  {/if}
</div>

{#if showEditor}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="backdrop" onclick={close} transition:fade={{ duration: dur }}>
    <div
      class="modal"
      use:modal={{ onclose: close }}
      onclick={(e) => e.stopPropagation()}
      transition:fly={{ y: flyY, duration: dur, easing: cubicOut }}
    >
      <button class="modal-x" type="button" onclick={close} aria-label="Close">✕</button>
      <div class="modal-scroll">
        {#key editorKey}
          <FoodForm
            initialFood={data.selected}
            catalog={data.catalog}
            context="manage"
            onclose={close}
          />
        {/key}
      </div>
    </div>
  </div>
{/if}

<style>
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 13px var(--gutter);
    border-bottom: 1px solid var(--line);
    background: #fff;
    flex: none;
    position: sticky;
    top: 0;
    z-index: 10;
  }
  .date-t h2 {
    font-size: 16px;
    margin: 0;
  }
  .date-t .sub {
    font-size: 11px;
    color: var(--faint);
    margin-top: 1px;
  }
  .btn {
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    font-size: 12.5px;
    padding: 8px 13px;
    border-radius: 9px;
  }
  .btn:hover {
    background: var(--accent-ink);
  }
  .body {
    padding: 18px var(--gutter);
  }
  .search {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 9px;
    padding: 9px 12px;
    font-size: 13px;
    background: #fff;
    margin-bottom: 12px;
  }
  .flist {
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow: hidden;
    background: #fff;
  }
  .frow {
    display: grid;
    grid-template-columns: 1fr auto auto;
    grid-template-areas: 'nm tag k' 'u u u';
    gap: 2px 10px;
    align-items: center;
    padding: 11px 14px;
    border-bottom: 1px solid var(--line2);
    color: var(--ink);
  }
  .frow:last-child {
    border-bottom: none;
  }
  .frow:hover {
    background: var(--panel);
  }
  .fnm {
    grid-area: nm;
    font-size: 13px;
  }
  .fnm em {
    font-style: normal;
    color: var(--faint);
  }
  .fk {
    grid-area: k;
    font-size: 11.5px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
  }
  .fu {
    grid-area: u;
    font-size: 11px;
    color: var(--faint);
  }
  .tag {
    grid-area: tag;
    font-size: 10px;
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 6px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .tag.cu {
    background: #fbece2;
    color: var(--accent-ink);
  }
  .tag.ov {
    background: var(--good-soft);
    color: var(--good);
  }
  .empty-list {
    border: 1px dashed var(--line);
    border-radius: 12px;
    padding: 24px;
    text-align: center;
    color: var(--faint);
    font-size: 13px;
  }

  /* Edit modal */
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgba(40, 34, 28, 0.4);
    display: grid;
    place-items: center;
    padding: 24px;
  }
  .modal {
    position: relative;
    width: 100%;
    max-width: 520px;
    max-height: 85vh;
    background: #fff;
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(70, 60, 45, 0.22);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
  .modal-x {
    position: absolute;
    top: 12px;
    right: 12px;
    z-index: 1;
    border: none;
    background: transparent;
    color: var(--faint);
    cursor: pointer;
    font-size: 14px;
    padding: 4px;
  }
  .modal-x:hover {
    color: var(--ink);
  }
  .modal-scroll {
    overflow: auto;
    padding: 16px 18px;
  }

  @media (max-width: 560px) {
    .backdrop {
      padding: 0;
      place-items: end stretch;
    }
    .modal {
      max-width: none;
      max-height: 92dvh;
      border-radius: 16px 16px 0 0;
    }
    .modal-scroll {
      padding-bottom: max(16px, env(safe-area-inset-bottom));
    }
  }
</style>
