<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import type { PickerFood } from '$lib/server/foods';

  type Editing = { id: number; foodId: number; amount: number; unitId: number | null };

  let {
    foods,
    editing = null,
    onclose
  }: { foods: PickerFood[]; editing?: Editing | null; onclose: () => void } = $props();

  const init = untrack(() => {
    if (editing) {
      const food = foods.find((f) => f.id === editing.foodId) ?? null;
      return {
        food,
        amount: String(editing.amount),
        unitId: editing.unitId === null ? 'g' : String(editing.unitId)
      };
    }
    return { food: null as PickerFood | null, amount: '', unitId: 'g' };
  });

  let query = $state('');
  let selected = $state<PickerFood | null>(init.food);
  let amount = $state(init.amount);
  let unitId = $state(init.unitId);

  const shown = $derived(
    foods.filter((f) => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return f.name.toLowerCase().includes(q) || (f.brand ?? '').toLowerCase().includes(q);
    })
  );

  function pick(food: PickerFood) {
    selected = food;
    const def = food.units.find((u) => u.isDefault);
    if (def) {
      amount = '1';
      unitId = String(def.id);
    } else {
      amount = '100';
      unitId = 'g';
    }
  }

  // --- Open Food Facts live search ---
  type OffResult = { ref: string; name: string; brand: string | null; energyPer100g: number | null };
  let offResults = $state<OffResult[]>([]);
  let offLoading = $state(false);
  let busy = $state(false); // importing a product / creating an override

  // OFF barcodes the user already has a local override for — hide the originals.
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

  async function customize() {
    if (!selected || selected.source !== 'off' || !selected.originRef) return;
    busy = true;
    try {
      const res = await fetch('/api/off/override', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ barcode: selected.originRef })
      });
      if (res.ok) selected = await res.json();
    } finally {
      busy = false;
    }
  }

  // Live gram + energy preview.
  const grams = $derived.by(() => {
    const a = Number(amount);
    if (!(a > 0) || !selected) return 0;
    if (unitId === 'g') return a;
    const u = selected.units.find((x) => String(x.id) === unitId);
    return u ? a * u.grams : a;
  });
  const energyPreview = $derived.by(() => {
    if (!selected || selected.energyPer100g === null) return null;
    return Math.round((selected.energyPer100g * grams) / 100);
  });

  function onResult(result: { type: string }) {
    if (result.type === 'success') onclose();
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" onclick={onclose}>
  <div class="modal" onclick={(e) => e.stopPropagation()}>
    <div class="mhead">
      <b>{editing ? 'Edit entry' : 'Add food'}</b>
      <button class="x" onclick={onclose} aria-label="Close">✕</button>
    </div>

    <div class="mbody">
      {#if !editing}
        <div class="pane left">
          <input class="search" placeholder="Search foods or Open Food Facts…" bind:value={query} />
          <div class="results">
            {#if shown.length > 0}
              <div class="group-h">My foods</div>
              {#each shown as f (f.id)}
                <button
                  class="res"
                  class:sel={selected?.id === f.id}
                  type="button"
                  onclick={() => pick(f)}
                >
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
              <div class="noresults">Type to search Open Food Facts, or add foods in the Foods tab.</div>
            {/if}
          </div>
        </div>
      {/if}

      <div class="pane right">
        {#if selected}
          <form
            method="POST"
            use:enhance={() => async ({ result, update }) => {
              await update({ reset: false });
              onResult(result);
            }}
          >
            <input type="hidden" name="foodId" value={selected.id} />
            {#if editing}<input type="hidden" name="id" value={editing.id} />{/if}

            <div class="detail-h">
              <b>{selected.name}</b>
              {#if selected.brand}<span class="brand">{selected.brand}</span>{/if}
              <span class="src {selected.source}">{selected.source === 'off' ? 'Open Food Facts' : 'Local'}</span>
              {#if selected.source === 'off'}
                <button type="button" class="customize" onclick={customize} disabled={busy}>Customize</button>
              {/if}
            </div>

            <div class="amt-row">
              <label class="field">
                <span>Amount</span>
                <input
                  name="amount"
                  type="number"
                  step="any"
                  min="0"
                  inputmode="decimal"
                  bind:value={amount}
                  required
                />
              </label>
              <label class="field grow">
                <span>Unit</span>
                <select name="unitId" bind:value={unitId}>
                  <option value="g">gram (g)</option>
                  {#each selected.units as u (u.id)}
                    <option value={String(u.id)}>{u.name} ({u.grams} g)</option>
                  {/each}
                </select>
              </label>
            </div>

            <div class="preview">
              <span>{grams ? `${Math.round(grams * 100) / 100} g` : '—'}</span>
              {#if energyPreview !== null}<b>{energyPreview} kcal</b>{/if}
            </div>

            <!-- Primary action is first in the DOM so Enter submits Save/Add,
                 not the destructive Remove; row-reverse puts Remove on the left. -->
            <div class="mfoot" class:rev={editing}>
              {#if editing}
                <button type="submit" formaction="?/updateEntry" class="cta">Save</button>
                <button type="submit" formaction="?/deleteEntry" formnovalidate class="ghost danger">Remove</button>
              {:else}
                <button type="submit" formaction="?/addEntry" class="cta">Add</button>
                <span></span>
              {/if}
            </div>
          </form>
        {:else}
          <div class="placeholder">Select a food to log.</div>
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
  }
  .search {
    border: 1px solid var(--line);
    border-radius: 9px;
    padding: 9px 11px;
    font-size: 13px;
    background: var(--panel);
    margin-bottom: 10px;
  }
  .results {
    overflow: auto;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }
  .noresults {
    color: var(--faint);
    font-size: 12.5px;
    padding: 12px 4px;
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
  .customize {
    margin-left: auto;
    border: 1px solid var(--line);
    background: #fff;
    color: var(--accent-ink);
    font-size: 11.5px;
    font-weight: 600;
    padding: 4px 9px;
    border-radius: 7px;
    cursor: pointer;
  }
  .customize:hover {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
  .customize:disabled {
    opacity: 0.5;
    cursor: default;
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
  .detail-h {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 14px;
  }
  .detail-h b {
    font-size: 15px;
  }
  .brand {
    font-size: 12px;
    color: var(--muted);
  }
  .amt-row {
    display: flex;
    gap: 10px;
    align-items: flex-end;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .field.grow {
    flex: 1;
  }
  .field span {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    font-weight: 600;
  }
  .field input,
  .field select {
    border: 1px solid var(--line);
    border-radius: 9px;
    padding: 9px 11px;
    font-size: 14px;
    background: #fff;
  }
  .field input {
    width: 96px;
  }
  .preview {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 12px;
    padding: 10px 12px;
    background: var(--panel);
    border: 1px solid var(--line2);
    border-radius: 9px;
    font-size: 13px;
    color: var(--muted);
  }
  .preview b {
    color: var(--ink);
    font-variant-numeric: tabular-nums;
  }
  .mfoot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 16px;
  }
  .mfoot.rev {
    flex-direction: row-reverse;
  }
  .ghost {
    border: 1px solid var(--line);
    background: #fff;
    color: var(--muted);
    font-size: 12.5px;
    padding: 8px 14px;
    border-radius: 9px;
    cursor: pointer;
  }
  .ghost.danger:hover {
    color: var(--over);
    border-color: #ecc6b8;
  }
  .cta {
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    font-size: 13px;
    padding: 9px 20px;
    border-radius: 9px;
    border: none;
    cursor: pointer;
  }
  .cta:hover {
    background: var(--accent-ink);
  }
  .placeholder {
    color: var(--muted);
    font-size: 13px;
    display: grid;
    place-items: center;
    height: 100%;
    min-height: 140px;
  }
</style>
