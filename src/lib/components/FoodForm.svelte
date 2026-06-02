<script lang="ts">
  // The unified food surface. The same nutrient-grid + unit-rows are read two
  // ways via `mode`:
  //   • scale — logging: editing any nutrient OR any unit row rescales the rest;
  //     the radio picks which unit the entry is saved as. Amount entry lives in
  //     the unit rows at the bottom (thumb zone).
  //   • edit  — fixing the food's definition: the same fields become per-100g
  //     values and unit name→grams, plus name/brand/barcode, add/remove, delete.
  //
  // `context` decides the chrome: 'add' (the diary sheet) toggles scale⇄edit and
  // offers Customise/Edit/Add; 'manage' (the Foods tab) is edit-only.
  import { untrack } from 'svelte';
  import { parseDecimal, parseDecimalOrNull } from '$lib/number';
  import ScanButton from '$lib/components/ScanButton.svelte';
  import type { PickerFood } from '$lib/server/foods';
  import type { Nutrient, MealGroup } from '$lib/server/db/schema';

  let {
    initialFood,
    catalog,
    context,
    mealGroups = [],
    defaultMealGroupId = null,
    entry = null,
    initialMode,
    prefill,
    onadd,
    onremove,
    onclose,
    onfoodchange
  }: {
    initialFood: PickerFood | null;
    catalog: Nutrient[];
    context: 'add' | 'manage';
    mealGroups?: MealGroup[];
    defaultMealGroupId?: number | null;
    entry?: { amount: number; unitId: number | null } | null;
    /** Force the starting mode (e.g. open a brand-new food straight into edit). */
    initialMode?: 'scale' | 'edit';
    /** Seed a new food's name/barcode (from the search/scan that had no match). */
    prefill?: { name?: string; barcode?: string };
    onadd?: (p: { foodId: number; amount: number; unitId: number | null; mealGroupId: number | null }) => void;
    onremove?: () => void;
    onclose?: () => void;
    onfoodchange?: (food: PickerFood) => void;
  } = $props();

  const catalogById = $derived(new Map(catalog.map((n) => [n.id, n])));

  let food = $state<PickerFood | null>(untrack(() => initialFood));
  let mode = $state<'scale' | 'edit'>(
    untrack(() => initialMode ?? (context === 'manage' ? 'edit' : 'scale'))
  );
  let busy = $state(false);
  let err = $state<string | null>(null);

  // ---------- scale mode ----------
  let amountG = $state(0);
  let saveUnitId = $state<number | null>(null);

  function unitGramsOf(id: number | null): number {
    if (id === null) return 1;
    return food?.units.find((u) => u.id === id)?.grams ?? 1;
  }

  // Seed the scale amount: from the edited entry if any, else 1 default unit
  // (or 100 g when the food has no default unit).
  untrack(() => {
    if (initialFood) seedScale(initialFood);
  });
  function seedScale(f: PickerFood) {
    if (entry) {
      saveUnitId = entry.unitId;
      amountG = entry.amount * (entry.unitId === null ? 1 : f.units.find((u) => u.id === entry.unitId)?.grams ?? 1);
      return;
    }
    const def = f.units.find((u) => u.isDefault);
    saveUnitId = def ? def.id : null;
    amountG = def ? def.grams : 100;
  }
  // If the unit set changed under us (e.g. after an edit re-created unit rows
  // with new ids), keep the save-as selection valid.
  $effect(() => {
    if (food && saveUnitId !== null && !food.units.some((u) => u.id === saveUnitId)) {
      const def = food.units.find((u) => u.isDefault);
      saveUnitId = def ? def.id : null;
    }
  });

  // One "currently-typed-in" field so its raw keystrokes aren't clobbered by the
  // live recompute; every other field reflects amountG.
  let editKey = $state<string | null>(null);
  let editText = $state('');
  function fieldVal(key: string, computed: string): string {
    return editKey === key ? editText : computed;
  }

  function fmtNut(v: number, unit: string): string {
    return unit === 'kcal' ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
  }
  function fmtAmt(v: number): string {
    return String(Math.round(v * 100) / 100);
  }

  function scaledNutrient(nid: number): string {
    const per100 = food?.nutrients[nid];
    if (per100 === undefined) return '';
    return fmtNut((per100 * amountG) / 100, catalogById.get(nid)?.unit ?? '');
  }
  function setFromNutrient(nid: number, valStr: string) {
    const per100 = food?.nutrients[nid];
    if (per100 === undefined || !(per100 > 0)) return;
    const val = parseDecimal(valStr);
    if (val >= 0) amountG = (val * 100) / per100;
  }
  function setFromUnit(id: number | null, valStr: string) {
    const val = parseDecimal(valStr);
    if (val >= 0) amountG = val * unitGramsOf(id);
  }

  // Unit rows shown in scale mode: grams (base) + every named unit.
  const scaleRows = $derived([
    { key: 'base' as const, id: null as number | null, name: 'gram (g)', grams: 1 },
    ...(food?.units ?? []).map((u) => ({ key: `u${u.id}`, id: u.id as number | null, name: u.name, grams: u.grams }))
  ]);

  function doAdd() {
    if (!food) return;
    const g = unitGramsOf(saveUnitId);
    onadd?.({
      foodId: food.id,
      amount: g > 0 ? amountG / g : amountG,
      unitId: saveUnitId,
      mealGroupId: mealParse(mealGroupId)
    });
  }

  // ---------- meal (add context) ----------
  function initialMeal(): string {
    if (entry === null && defaultMealGroupId != null) return String(defaultMealGroupId);
    const first = mealGroups[0]?.id;
    return first != null ? String(first) : '';
  }
  let mealGroupId = $state<string>(untrack(initialMeal));
  function mealParse(v: string): number | null {
    if (v === '') return null;
    const n = Number(v);
    return Number.isInteger(n) ? n : null;
  }

  // ---------- edit mode ----------
  let eName = $state('');
  let eBrand = $state('');
  let eBarcode = $state('');
  let eNutrients = $state<Record<number, string>>({});
  let eUnits = $state<{ name: string; grams: string }[]>([]);
  let eDefault = $state<number | 'base'>('base');

  function seedEdit(f: PickerFood | null) {
    // For a brand-new food, seed name/barcode from the search/scan that whiffed.
    eName = f?.name ?? prefill?.name ?? '';
    eBrand = f?.brand ?? '';
    eBarcode = f?.barcode ?? prefill?.barcode ?? '';
    eNutrients = Object.fromEntries(
      catalog.map((n) => {
        const v = f?.nutrients[n.id];
        return [n.id, v === undefined || v === null ? '' : String(v)];
      })
    );
    eUnits = (f?.units ?? []).map((u) => ({ name: u.name, grams: String(u.grams) }));
    const di = f?.units.findIndex((u) => u.isDefault) ?? -1;
    eDefault = di >= 0 ? di : 'base';
  }
  // Seed the edit fields each time we enter edit mode (covers re-editing after a
  // save, and the manage/new-food case which starts in edit).
  let editSeededFor = '';
  $effect(() => {
    if (mode !== 'edit') {
      editSeededFor = '';
      return;
    }
    const key = `${food?.id ?? 'new'}`;
    if (editSeededFor !== key) {
      untrack(() => seedEdit(food));
      editSeededFor = key;
    }
  });

  function addUnitRow() {
    eUnits.push({ name: '', grams: '' });
  }
  function removeUnitRow(i: number) {
    eUnits.splice(i, 1);
    if (eDefault === i) eDefault = 'base';
    else if (typeof eDefault === 'number' && eDefault > i) eDefault -= 1;
  }

  function buildInput() {
    return {
      name: eName.trim(),
      brand: eBrand.trim() || null,
      barcode: eBarcode.trim() || null,
      nutrients: Object.fromEntries(
        Object.entries(eNutrients).map(([id, v]) => [id, parseDecimalOrNull(v)])
      ),
      units: eUnits.map((u, i) => ({ name: u.name.trim(), grams: parseDecimal(u.grams), isDefault: eDefault === i }))
    };
  }

  async function save() {
    busy = true;
    err = null;
    try {
      const res = await fetch('/api/foods', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: food?.id ?? null, input: buildInput() })
      });
      if (!res.ok) {
        err = (await res.text()) || 'Could not save.';
        return;
      }
      const updated: PickerFood = await res.json();
      food = updated;
      onfoodchange?.(updated);
      if (context === 'manage') onclose?.();
      else mode = 'scale';
    } finally {
      busy = false;
    }
  }

  let confirmingDelete = $state(false);
  async function del() {
    if (!food) return;
    if (!confirmingDelete) {
      confirmingDelete = true;
      return;
    }
    busy = true;
    try {
      await fetch('/api/foods', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: food.id })
      });
      onclose?.();
    } finally {
      busy = false;
    }
  }

  async function customise() {
    if (!food || food.source !== 'off' || !food.originRef) return;
    busy = true;
    err = null;
    try {
      const res = await fetch('/api/off/override', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ barcode: food.originRef })
      });
      if (!res.ok) {
        err = 'Could not customise that product.';
        return;
      }
      const local: PickerFood = await res.json();
      food = local;
      onfoodchange?.(local);
      seedScale(local);
      mode = 'edit';
    } finally {
      busy = false;
    }
  }

  function enterEdit() {
    mode = 'edit';
  }
  function cancelEdit() {
    confirmingDelete = false;
    err = null;
    if (context === 'manage') onclose?.();
    else mode = 'scale';
  }
</script>

{#if err}<div class="err">{err}</div>{/if}

{#if mode === 'scale' && food}
  <div class="detail-h">
    <b>{food.name}</b>
    {#if food.brand}<span class="brand">{food.brand}</span>{/if}
    <span class="src {food.source}">{food.source === 'off' ? 'Open Food Facts' : 'Local'}</span>
  </div>

  <div class="sec">Nutrition <em>for this amount</em></div>
  <div class="ngrid">
    {#each catalog as n (n.id)}
      {@const known = food.nutrients[n.id] !== undefined}
      <label class="nfield">
        <span>{n.name}</span>
        <span class="nb" class:empty={!known}>
          <input
            type="text"
            inputmode="decimal"
            disabled={!known}
            placeholder="—"
            value={known ? fieldVal(`n${n.id}`, scaledNutrient(n.id)) : ''}
            onfocus={() => {
              editKey = `n${n.id}`;
              editText = scaledNutrient(n.id);
            }}
            oninput={(e) => {
              editText = e.currentTarget.value;
              setFromNutrient(n.id, e.currentTarget.value);
            }}
            onblur={() => (editKey = null)}
          />
          <em>{n.unit}</em>
        </span>
      </label>
    {/each}
  </div>

  <div class="sec">Amount <em>type any row; pick what to save as</em></div>
  <div class="units">
    {#each scaleRows as row (row.key)}
      <label class="urow">
        <input
          class="udef"
          type="radio"
          name="saveunit"
          checked={saveUnitId === row.id}
          onchange={() => (saveUnitId = row.id)}
        />
        <span class="uname">{row.name}</span>
        <input
          class="uamt"
          type="text"
          inputmode="decimal"
          value={fieldVal(row.key, fmtAmt(amountG / row.grams))}
          onfocus={() => {
            editKey = row.key;
            editText = fmtAmt(amountG / row.grams);
          }}
          oninput={(e) => {
            editText = e.currentTarget.value;
            setFromUnit(row.id, e.currentTarget.value);
          }}
          onblur={() => (editKey = null)}
        />
      </label>
    {/each}
  </div>

  {#if mealGroups.length > 0}
    <label class="field meal-field">
      <span>Meal</span>
      <select bind:value={mealGroupId}>
        {#each mealGroups as m (m.id)}
          <option value={String(m.id)}>{m.name}</option>
        {/each}
      </select>
    </label>
  {/if}

  <div class="foot">
    {#if entry && onremove}
      <button type="button" class="ghost danger" onclick={onremove} disabled={busy}>Remove</button>
    {/if}
    <span class="foot-r">
      {#if food.source === 'off'}
        <button type="button" class="ghost" onclick={customise} disabled={busy}>Customise</button>
      {:else}
        <button type="button" class="ghost" onclick={enterEdit} disabled={busy}>Edit</button>
      {/if}
      <button type="button" class="cta" onclick={doAdd} disabled={busy || !(amountG > 0)}>
        {entry ? 'Save' : 'Add'}
      </button>
    </span>
  </div>
{:else}
  <!-- edit mode -->
  <div class="row2">
    <label class="field"><span>Name</span><input bind:value={eName} placeholder="e.g. Granola" /></label>
    <label class="field"><span>Brand <em>optional</em></span><input bind:value={eBrand} placeholder="—" /></label>
  </div>
  <label class="field bc">
    <span>Barcode <em>optional</em></span>
    <span class="input-scan">
      <input bind:value={eBarcode} inputmode="numeric" placeholder="—" />
      <ScanButton onScan={(c) => (eBarcode = c)} />
    </span>
  </label>

  <div class="sec">Nutrition · per 100 g <em>blank = unknown</em></div>
  <div class="ngrid">
    {#each catalog as n (n.id)}
      <label class="nfield">
        <span>{n.name}</span>
        <span class="nb">
          <input type="text" inputmode="decimal" bind:value={eNutrients[n.id]} placeholder="—" />
          <em>{n.unit}</em>
        </span>
      </label>
    {/each}
  </div>

  <div class="sec">Named units <em>name → grams</em></div>
  <div class="units">
    <label class="urow base">
      <input class="udef" type="radio" name="edef" checked={eDefault === 'base'} onchange={() => (eDefault = 'base')} />
      <span class="uname">gram (g)</span>
      <span class="ubase">base</span>
    </label>
    {#each eUnits as unit, i (i)}
      <div class="urow">
        <input class="udef" type="radio" name="edef" checked={eDefault === i} onchange={() => (eDefault = i)} />
        <input class="uname-in" bind:value={unit.name} placeholder="serving" />
        <span class="eq">=</span>
        <input class="ugrams-in" type="text" inputmode="decimal" bind:value={unit.grams} placeholder="grams" />
        <span class="g">g</span>
        <button type="button" class="urm" onclick={() => removeUnitRow(i)} aria-label="Remove unit">✕</button>
      </div>
    {/each}
    <button type="button" class="uadd" onclick={addUnitRow}>+ Add unit</button>
  </div>

  <div class="foot">
    {#if food}
      <button
        type="button"
        class="ghost danger"
        class:confirming={confirmingDelete}
        onclick={del}
        disabled={busy}
      >
        {confirmingDelete ? 'Click again to delete' : 'Delete'}
      </button>
    {/if}
    <span class="foot-r">
      <button type="button" class="ghost" onclick={cancelEdit} disabled={busy}>Cancel</button>
      <button type="button" class="cta" onclick={save} disabled={busy || !eName.trim()}>Save</button>
    </span>
  </div>
{/if}

<style>
  .err {
    background: #fdece5;
    border: 1px solid #f3c9b6;
    color: #b4502d;
    font-size: 12.5px;
    padding: 8px 11px;
    border-radius: 9px;
    margin-bottom: 12px;
  }
  .detail-h {
    display: flex;
    align-items: baseline;
    gap: 8px;
    flex-wrap: wrap;
    margin-bottom: 6px;
  }
  .detail-h b {
    font-size: 15px;
  }
  .brand {
    font-size: 12px;
    color: var(--muted);
  }
  .src {
    font-weight: 600;
    font-size: 11.5px;
  }
  .src.off {
    color: #6b7785;
  }
  .src.local {
    color: var(--accent-ink);
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
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    min-width: 0;
  }
  .field.bc {
    margin-top: 10px;
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
  .field input,
  .field select {
    width: 100%;
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 9px;
    padding: 9px 11px;
    font-size: 16px;
    background: #fff;
  }
  .input-scan {
    position: relative;
    display: block;
  }
  .input-scan input {
    padding-right: 42px;
  }
  .meal-field {
    margin-top: 14px;
  }
  .ngrid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }
  @media (max-width: 560px) {
    .ngrid {
      grid-template-columns: repeat(2, 1fr);
    }
  }
  .nfield {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .nb {
    display: flex;
    align-items: center;
    min-width: 0;
    border: 1px solid var(--line);
    border-radius: 8px;
    background: #fff;
    padding: 0 9px;
  }
  .nb.empty {
    background: var(--panel);
  }
  .nb input {
    border: none;
    outline: none;
    width: 100%;
    min-width: 0;
    padding: 8px 0;
    font-size: 16px;
    background: transparent;
    font-variant-numeric: tabular-nums;
  }
  .nb input:disabled {
    color: var(--faint);
    -webkit-text-fill-color: var(--faint);
    opacity: 1;
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
  .urow:last-of-type {
    border-bottom: none;
  }
  .urow.base {
    background: var(--panel);
    font-size: 13px;
  }
  .udef {
    flex: none;
    margin: 0;
  }
  .uname {
    flex: 1;
    min-width: 0;
    font-size: 13px;
  }
  .uamt {
    width: 90px;
    border: 1px solid var(--line);
    border-radius: 7px;
    padding: 7px 9px;
    font-size: 16px;
    text-align: right;
    font-variant-numeric: tabular-nums;
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
    font-size: 16px;
  }
  .eq {
    color: var(--faint);
  }
  .ugrams-in {
    width: 76px;
    border: 1px solid var(--line);
    border-radius: 7px;
    padding: 6px 9px;
    font-size: 16px;
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
  .foot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 18px;
    gap: 12px;
  }
  .foot-r {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-left: auto;
  }
  .ghost {
    border: 1px solid var(--line);
    background: #fff;
    color: var(--muted);
    font-size: 13px;
    padding: 9px 16px;
    border-radius: 9px;
    cursor: pointer;
  }
  .ghost:disabled {
    opacity: 0.5;
    cursor: default;
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
  .cta {
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    font-size: 13px;
    padding: 9px 22px;
    border-radius: 9px;
    border: none;
    cursor: pointer;
  }
  .cta:hover {
    background: var(--accent-ink);
  }
  .cta:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
