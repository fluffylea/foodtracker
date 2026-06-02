<script lang="ts">
  import { untrack } from 'svelte';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { invalidateAll } from '$app/navigation';
  import { modal } from '$lib/actions/modal';
  import { portal } from '$lib/actions/portal';
  import { coarsePointer } from '$lib/pointer.svelte';
  import { reducedMotion } from '$lib/motion';
  import FoodForm from '$lib/components/FoodForm.svelte';
  import ScanButton from '$lib/components/ScanButton.svelte';
  import type { PickerFood } from '$lib/server/foods';
  import type { Nutrient, MealGroup } from '$lib/server/db/schema';

  type Editing = {
    id: number;
    foodId: number;
    amount: number;
    unitId: number | null;
    mealGroupId: number | null;
  };

  let {
    foods,
    catalog,
    mealGroups,
    editing = null,
    defaultMealGroupId = null,
    onclose
  }: {
    foods: PickerFood[];
    catalog: Nutrient[];
    mealGroups: MealGroup[];
    editing?: Editing | null;
    defaultMealGroupId?: number | null;
    onclose: () => void;
  } = $props();

  // The picked food drives the detail step. `pickSeq` keys the FoodForm: it bumps
  // only on a *user* pick (so the form re-initialises for a new food), NOT when
  // FoodForm internally swaps to a customised copy (which must keep its edit mode).
  let query = $state('');
  let picked = $state<PickerFood | null>(untrack(() => foods.find((f) => f.id === editing?.foodId) ?? null));
  // When the search has no match, the user can create a food prefilled from the
  // query; `creating` holds that prefill and opens FoodForm in edit mode.
  let creating = $state<{ name?: string; barcode?: string } | null>(null);
  let pickSeq = $state(0);
  const entryScale = untrack(() => (editing ? { amount: editing.amount, unitId: editing.unitId } : null));

  // EAN-8 / UPC-A / EAN-13 shapes → treat the query as a barcode, not a name.
  const isBarcode = (q: string) => /^\d{8}$|^\d{12,13}$/.test(q);
  function createFromSearch() {
    const q = query.trim();
    if (!q) return;
    creating = isBarcode(q) ? { barcode: q } : { name: q };
    picked = null;
    pickSeq++;
  }

  const shown = $derived(
    foods.filter((f) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return (
        f.name.toLowerCase().includes(q) ||
        (f.brand ?? '').toLowerCase().includes(q) ||
        (f.barcode ?? '').includes(q)
      );
    })
  );

  function pick(food: PickerFood) {
    picked = food;
    creating = null;
    pickSeq++;
  }

  // --- Open Food Facts live search ---
  type OffResult = { ref: string; name: string; brand: string | null; energyPer100g: number | null };
  let offResults = $state<OffResult[]>([]);
  let offLoading = $state(false);
  let busy = $state(false);

  // Show a "create this" affordance when the query yields nothing anywhere.
  const noResults = $derived(
    query.trim().length > 0 && shown.length === 0 && !offLoading && offResults.length === 0
  );

  const localRefs = $derived(new Set(foods.map((f) => f.originRef).filter(Boolean)));

  $effect(() => {
    const q = query.trim();
    if (q.length < 2) {
      offResults = [];
      offLoading = false;
      return;
    }
    offLoading = true;
    let activeRun = true;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/off/search?q=${encodeURIComponent(q)}`);
        const data: OffResult[] = r.ok ? await r.json() : [];
        if (activeRun) offResults = data.filter((d) => !localRefs.has(d.ref));
      } catch {
        if (activeRun) offResults = [];
      } finally {
        if (activeRun) offLoading = false;
      }
    }, 350);
    return () => {
      activeRun = false;
      clearTimeout(t);
    };
  });

  async function pickOff(r: OffResult) {
    busy = true;
    try {
      const res = await fetch('/api/off/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ barcode: r.ref })
      });
      if (res.ok) pick(await res.json());
    } finally {
      busy = false;
    }
  }

  // POST a diary form-action by hand (FoodForm reports the resolved amount/unit).
  async function postAction(action: string, fields: Record<string, string>) {
    const body = new FormData();
    for (const [k, v] of Object.entries(fields)) body.set(k, v);
    const res = await fetch(action, { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
    const result = await res.json().catch(() => null);
    if (result?.type === 'success') {
      await invalidateAll();
      onclose();
    }
  }

  function submitAdd(p: { foodId: number; amount: number; unitId: number | null; mealGroupId: number | null }) {
    const fields: Record<string, string> = {
      foodId: String(p.foodId),
      amount: String(p.amount),
      unitId: p.unitId === null ? 'g' : String(p.unitId),
      mealGroupId: p.mealGroupId === null ? '' : String(p.mealGroupId)
    };
    if (editing) {
      fields.id = String(editing.id);
      postAction('?/updateEntry', fields);
    } else {
      postAction('?/addEntry', fields);
    }
  }

  function removeEntry() {
    if (editing) postAction('?/deleteEntry', { id: String(editing.id) });
  }

  const dur = $derived(reducedMotion() ? 0 : 240);
  const flyY = $derived(reducedMotion() ? 0 : coarsePointer() ? 320 : 12);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" use:portal onclick={onclose} transition:fade={{ duration: dur }}>
  <div
    class="modal"
    use:modal={{ onclose }}
    onclick={(e) => e.stopPropagation()}
    transition:fly={{ y: flyY, duration: dur, easing: cubicOut }}
  >
    <div class="mhead">
      <b>{editing ? 'Edit entry' : 'Add food'}</b>
      <button class="x" onclick={onclose} aria-label="Close">✕</button>
    </div>

    <div class="mbody" class:has-selection={picked !== null || creating !== null}>
      {#if !editing}
        <div class="pane left">
          <div class="search-wrap">
            <input class="search" placeholder="Search foods or scan a barcode…" bind:value={query} />
            <ScanButton onScan={(c) => (query = c)} />
          </div>
          <div class="results">
            {#if shown.length > 0}
              <div class="group-h">My foods</div>
              {#each shown as f (f.id)}
                <button class="res" class:sel={picked?.id === f.id} type="button" onclick={() => pick(f)}>
                  <span class="res-nm">{f.name}{#if f.brand}<em> · {f.brand}</em>{/if}</span>
                  <span class="res-sub">
                    <span class="src {f.source}">{f.source === 'off' ? 'Open Food Facts' : 'Local'}</span>
                    {#if f.energyPer100g !== null}· {Math.round(f.energyPer100g)} kcal/100 g{/if}
                  </span>
                </button>
              {/each}
            {/if}

            {#if query.trim().length >= 2}
              <div class="group-h">Open Food Facts{#if offLoading}<span class="dots"> …</span>{/if}</div>
              {#if offResults.length === 0 && !offLoading}
                <div class="noresults">No Open Food Facts matches.</div>
              {:else}
                {#each offResults as r (r.ref)}
                  <button class="res" type="button" onclick={() => pickOff(r)} disabled={busy}>
                    <span class="res-nm">{r.name}{#if r.brand}<em> · {r.brand}</em>{/if}</span>
                    <span class="res-sub">
                      <span class="src off">Open Food Facts</span>
                      {#if r.energyPer100g !== null}· {Math.round(r.energyPer100g)} kcal/100 g{/if}
                    </span>
                  </button>
                {/each}
              {/if}
            {:else if shown.length === 0}
              <div class="noresults">Type to search Open Food Facts, or scan a barcode.</div>
            {/if}

            {#if noResults}
              <button class="create-row" type="button" onclick={createFromSearch}>
                + Create {isBarcode(query.trim()) ? `food with barcode ${query.trim()}` : `“${query.trim()}”`}
              </button>
            {/if}
          </div>
        </div>
      {/if}

      <div class="pane right">
        {#if picked || creating}
          {#if !editing}
            <button class="back" type="button" onclick={() => { picked = null; creating = null; }} aria-label="Back to search">‹ Back</button>
          {/if}
          {#key pickSeq}
            <FoodForm
              initialFood={picked}
              {catalog}
              context="add"
              {mealGroups}
              {defaultMealGroupId}
              entry={entryScale}
              initialMode={creating ? 'edit' : undefined}
              prefill={creating ?? undefined}
              onadd={submitAdd}
              onremove={editing ? removeEntry : undefined}
              onclose={onclose}
              onfoodchange={(f) => (picked = f)}
            />
          {/key}
        {:else}
          <div class="placeholder">Search for a food, or scan a barcode.</div>
        {/if}
      </div>
    </div>
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
  }
  .modal {
    width: 100%;
    max-width: 720px;
    background: #fff;
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(70, 60, 45, 0.22);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    max-height: 80vh;
  }
  .mhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--line);
  }
  .mhead b {
    font-size: 14px;
  }
  .x {
    border: none;
    background: transparent;
    color: var(--faint);
    cursor: pointer;
    font-size: 14px;
  }
  .mbody {
    display: flex;
    min-height: 0;
    flex: 1;
  }
  .pane {
    padding: 14px;
    min-height: 0;
  }
  .left {
    width: 320px;
    flex: none;
    border-right: 1px solid var(--line);
    display: flex;
    flex-direction: column;
  }
  .right {
    flex: 1;
    min-width: 0;
    overflow: auto;
  }
  .search-wrap {
    position: relative;
    margin-bottom: 10px;
  }
  .search {
    width: 100%;
    border: 1px solid var(--line);
    border-radius: 9px;
    padding: 9px 42px 9px 11px;
    font-size: 16px;
    background: var(--panel);
  }
  .results {
    flex: 1;
    min-height: 0;
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .back {
    display: none;
    align-items: center;
    gap: 2px;
    margin-bottom: 10px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: #fff;
    color: var(--muted);
    font-size: 13px;
    padding: 6px 11px;
    cursor: pointer;
  }
  .noresults {
    color: var(--faint);
    font-size: 12.5px;
    padding: 12px 4px;
  }
  .create-row {
    margin: 8px 2px 2px;
    border: 1px dashed var(--line);
    border-radius: 9px;
    padding: 11px;
    text-align: left;
    background: transparent;
    color: var(--accent-ink);
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
  }
  .create-row:hover {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
  .res {
    text-align: left;
    border: none;
    background: transparent;
    border-radius: 8px;
    padding: 9px 9px;
    cursor: pointer;
    border-bottom: 1px solid var(--line2);
  }
  .res:hover {
    background: var(--panel);
  }
  .res.sel {
    background: var(--accent-soft);
  }
  .res:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .group-h {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--faint);
    font-weight: 600;
    padding: 8px 4px 4px;
  }
  .dots {
    color: var(--accent-ink);
  }
  .res-nm {
    display: block;
    font-size: 13px;
  }
  .res-nm em {
    font-style: normal;
    color: var(--faint);
  }
  .res-sub {
    font-size: 11px;
    color: var(--faint);
  }
  .src {
    font-weight: 600;
  }
  .src.off {
    color: #6b7785;
  }
  .src.local {
    color: var(--accent-ink);
  }
  .placeholder {
    color: var(--muted);
    font-size: 13px;
    display: grid;
    place-items: center;
    height: 100%;
    min-height: 140px;
  }

  /* Mobile: full-height bottom sheet, one step at a time — search the list,
     then the detail/scale screen (with a Back button). */
  @media (max-width: 560px) {
    .backdrop {
      padding: 0;
      place-items: end stretch;
    }
    .modal {
      max-width: none;
      height: 92dvh;
      max-height: 92dvh;
      border-radius: 16px 16px 0 0;
    }
    .mbody {
      flex-direction: column;
    }
    .mbody:not(.has-selection) .right {
      display: none;
    }
    .mbody.has-selection .left {
      display: none;
    }
    .left {
      width: auto;
      border-right: none;
      flex: 1;
      min-height: 0;
    }
    .right {
      flex: 1;
      padding-bottom: max(14px, env(safe-area-inset-bottom));
    }
    .back {
      display: inline-flex;
    }
  }
</style>
