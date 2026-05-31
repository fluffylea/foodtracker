<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import type { FoodDetail } from '$lib/server/foods';
  import type { Nutrient } from '$lib/server/db/schema';

  let {
    food,
    catalog,
    error
  }: { food: FoodDetail | null; catalog: Nutrient[]; error?: string } = $props();

  // Initial values captured from props once (this component is keyed on the
  // selected id by the parent, so it remounts when the selection changes —
  // hence untrack: we deliberately want the initial value, not reactivity).
  const initial = untrack(() => {
    const nutrientStrings: Record<number, string> = Object.fromEntries(
      catalog.map((n) => {
        const v = food?.nutrients[n.id];
        return [n.id, v === null || v === undefined ? '' : String(v)];
      })
    );
    const unitRows = (food?.units ?? []).map((u) => ({ name: u.name, grams: String(u.grams) }));
    const di = food?.units.findIndex((u) => u.isDefault) ?? -1;
    return {
      name: food?.name ?? '',
      brand: food?.brand ?? '',
      barcode: food?.barcode ?? '',
      nutrients: nutrientStrings,
      units: unitRows,
      defaultSel: (di >= 0 ? di : 'base') as number | 'base'
    };
  });

  // Local editable state.
  let name = $state(initial.name);
  let brand = $state(initial.brand);
  let barcode = $state(initial.barcode);
  let nutrientVals = $state<Record<number, string>>(initial.nutrients);
  let units = $state(initial.units);
  // Which row is the default unit: a named-unit index, or 'base' (grams).
  let defaultSel = $state<number | 'base'>(initial.defaultSel);

  let justSaved = $state(false);
  let confirmingDelete = $state(false);

  function addUnit() {
    units.push({ name: '', grams: '' });
  }
  function removeUnit(i: number) {
    units.splice(i, 1);
    if (defaultSel === i) defaultSel = 'base';
    else if (typeof defaultSel === 'number' && defaultSel > i) defaultSel -= 1;
  }

  // JSON payload submitted in a hidden field.
  const payload = $derived(
    JSON.stringify({
      name: name.trim(),
      brand: brand.trim() || null,
      barcode: barcode.trim() || null,
      nutrients: Object.fromEntries(
        Object.entries(nutrientVals).map(([id, v]) => [id, v === '' ? null : Number(v)])
      ),
      units: units.map((u, i) => ({
        name: u.name.trim(),
        grams: Number(u.grams),
        isDefault: defaultSel === i
      }))
    })
  );
</script>

<form
  method="POST"
  action="?/save"
  class="editor"
  use:enhance={() => {
    return async ({ result, update }) => {
      // Don't reset the form on success — inputs are bound to component
      // state; a native reset would blank the visible fields out of sync.
      await update({ reset: false });
      if (result.type === 'success') {
        justSaved = true;
        setTimeout(() => (justSaved = false), 2000);
      }
    };
  }}
>
  <input type="hidden" name="data" value={payload} />
  {#if food}<input type="hidden" name="id" value={food.id} />{/if}

  <div class="ehead">
    <h3>{food ? 'Edit food' : 'New food'}</h3>
    {#if food}<span class="tag {food.source === 'off' ? 'ov' : 'cu'}">{food.source === 'off' ? 'Override' : 'Custom'}</span>{/if}
  </div>

  {#if error}<div class="err">{error}</div>{/if}

  <div class="row2">
    <label class="field"><span>Name</span><input bind:value={name} required placeholder="e.g. Granola, honey" /></label>
    <label class="field"><span>Brand <em>optional</em></span><input bind:value={brand} placeholder="—" /></label>
  </div>
  <label class="field bc"><span>Barcode <em>optional</em></span><input bind:value={barcode} inputmode="numeric" placeholder="—" /></label>

  <div class="sec">Nutrition · per 100 g <em>blank = unknown</em></div>
  <div class="ngrid">
    {#each catalog as n (n.id)}
      <label class="nfield">
        <span>{n.name}</span>
        <span class="nb">
          <input type="number" step="any" min="0" inputmode="decimal" bind:value={nutrientVals[n.id]} placeholder="—" />
          <em>{n.unit}</em>
        </span>
      </label>
    {/each}
  </div>

  <div class="sec">Named units <em>name → grams</em></div>
  <div class="units">
    <div class="urow base">
      <label class="udef">
        <input type="radio" name="def" checked={defaultSel === 'base'} onchange={() => (defaultSel = 'base')} />
      </label>
      <span class="uname">gram (g)</span>
      <span class="ueq">1 g</span>
      <span class="ubase">base</span>
    </div>
    {#each units as unit, i (i)}
      <div class="urow">
        <label class="udef">
          <input type="radio" name="def" checked={defaultSel === i} onchange={() => (defaultSel = i)} />
        </label>
        <input class="uname-in" bind:value={unit.name} placeholder="serving" />
        <span class="eq">=</span>
        <input class="ugrams-in" type="number" step="any" min="0" inputmode="decimal" bind:value={unit.grams} placeholder="grams" />
        <span class="g">g</span>
        <button type="button" class="urm" onclick={() => removeUnit(i)} aria-label="Remove unit">✕</button>
      </div>
    {/each}
    <button type="button" class="uadd" onclick={addUnit}>+ Add unit</button>
  </div>

  <!-- Save group first in the DOM so Enter submits Save (the form's ?/save
       action), not the destructive Delete; row-reverse keeps Delete on the left. -->
  <div class="efoot">
    <div class="efoot-r">
      {#if justSaved}<span class="saved">Saved ✓</span>{/if}
      <button type="submit" class="cta">{food ? 'Save food' : 'Create food'}</button>
    </div>
    {#if food}
      <button
        type="submit"
        formaction="?/delete"
        class="ghost danger"
        class:confirming={confirmingDelete}
        formnovalidate
        onclick={(e) => {
          if (!confirmingDelete) {
            e.preventDefault();
            confirmingDelete = true;
          }
        }}
      >
        {confirmingDelete ? 'Click again to delete' : 'Delete'}
      </button>
    {:else}
      <span></span>
    {/if}
  </div>
</form>

<style>
  .editor {
    display: flex;
    flex-direction: column;
  }
  .ehead {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 12px;
  }
  .ehead h3 {
    margin: 0;
    font-size: 14px;
  }
  .tag {
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
  .err {
    background: #fdece5;
    border: 1px solid #f3c9b6;
    color: #b4502d;
    font-size: 12.5px;
    padding: 8px 11px;
    border-radius: 9px;
    margin-bottom: 12px;
  }
  .sec {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    font-weight: 600;
    margin: 16px 0 8px;
  }
  .sec em {
    font-style: normal;
    color: var(--faint);
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
    margin-left: 6px;
  }
  .row2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .field.bc {
    margin-top: 10px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .field > span,
  .nfield > span {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--muted);
    font-weight: 600;
  }
  .field em,
  .nfield em {
    font-style: normal;
    color: var(--faint);
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
  }
  .field input {
    border: 1px solid var(--line);
    border-radius: 9px;
    padding: 9px 11px;
    font-size: 14px;
    background: #fff;
  }
  .ngrid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  .nfield {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .nb {
    display: flex;
    align-items: center;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    padding: 0 9px;
  }
  .nb input {
    border: none;
    outline: none;
    width: 100%;
    padding: 8px 0;
    font-size: 13px;
    background: transparent;
  }
  .nb em {
    font-style: normal;
    color: var(--faint);
    font-size: 10.5px;
    margin-left: 4px;
  }
  .units {
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
  }
  .urow {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--line2);
  }
  .urow.base {
    background: var(--panel);
    font-size: 13px;
  }
  .udef {
    display: flex;
    align-items: center;
  }
  .uname {
    flex: 1;
  }
  .ueq {
    color: var(--muted);
    font-size: 12px;
  }
  .ubase {
    color: var(--faint);
    font-size: 10.5px;
  }
  .uname-in {
    flex: 1;
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 7px;
    padding: 6px 9px;
    font-size: 13px;
  }
  .eq {
    color: var(--faint);
  }
  .ugrams-in {
    width: 76px;
    border: 1px solid var(--line);
    border-radius: 7px;
    padding: 6px 9px;
    font-size: 13px;
  }
  .g {
    color: var(--muted);
    font-size: 12px;
  }
  .urm {
    border: none;
    background: transparent;
    color: var(--faint);
    cursor: pointer;
    font-size: 12px;
    padding: 4px;
  }
  .urm:hover {
    color: var(--over);
  }
  .uadd {
    width: 100%;
    border: none;
    background: transparent;
    color: var(--accent-ink);
    font-weight: 600;
    font-size: 13px;
    padding: 10px;
    cursor: pointer;
    text-align: left;
  }
  .efoot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 16px;
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
  .ghost.danger.confirming {
    background: #fdece5;
    border-color: var(--over);
    color: #b4502d;
    font-weight: 600;
  }
  .efoot-r {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .saved {
    font-size: 12.5px;
    color: var(--good);
    font-weight: 600;
  }
  .cta {
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    font-size: 13px;
    padding: 9px 18px;
    border-radius: 9px;
    border: none;
    cursor: pointer;
  }
  .cta:hover {
    background: var(--accent-ink);
  }
</style>
