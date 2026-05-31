<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import AddEntryModal from '$lib/components/AddEntryModal.svelte';
  import GoalTile from '$lib/components/GoalTile.svelte';
  import GoalModal from '$lib/components/GoalModal.svelte';
  import { invalidateAll } from '$app/navigation';

  let { data } = $props();

  const catalogById = $derived(new Map(data.catalog.map((n) => [n.id, n])));
  const goalByNutrient = $derived(new Map(data.goals.map((g) => [g.nutrientId, g])));
  const usedNutrientIds = $derived(data.goals.map((g) => g.nutrientId));

  // Goals are managed "now": only the current day's tiles are interactive.
  const isToday = $derived(data.date === data.today);
  const canAddGoal = $derived(isToday && data.goals.length < data.catalog.length);

  // --- entry add/edit modal ---
  type Editing = {
    id: number;
    foodId: number;
    amount: number;
    unitId: number | null;
    mealGroupId: number | null;
  };
  let modal = $state<{ editing: Editing | null; mealId: number | null } | null>(null);
  const modalKey = $derived(modal?.editing ? `e${modal.editing.id}` : `new-${modal?.mealId ?? ''}`);
  function openAdd(mealId: number | null = null) {
    modal = { editing: null, mealId };
  }
  function openEdit(e: (typeof data.entries)[number]) {
    modal = {
      editing: { id: e.id, foodId: e.foodId, amount: e.amount, unitId: e.unitId, mealGroupId: e.mealGroupId },
      mealId: null
    };
  }

  // --- meal groups: grouping, subtotals, drag-reorder, add ---
  const mealById = $derived(new Map(data.mealGroups.map((m) => [m.id, m])));
  function entriesFor(mealId: number | null) {
    return data.entries.filter((e) => e.mealGroupId === mealId);
  }
  const unsortedEntries = $derived(entriesFor(null));
  function subtotal(es: (typeof data.entries)) {
    return es.reduce((s, e) => s + (e.energy ?? 0), 0);
  }

  let mealOrder = $state<number[]>(untrack(() => data.mealGroups.map((m) => m.id)));
  $effect(() => {
    mealOrder = data.mealGroups.map((m) => m.id);
  });
  let mealDragFrom = $state<number | null>(null);
  let mealDragChanged = false;
  function onMealDragStart(i: number) {
    mealDragFrom = i;
    mealDragChanged = false;
  }
  function onMealDragOver(i: number, e: DragEvent) {
    e.preventDefault();
    if (mealDragFrom === null || mealDragFrom === i) return;
    const next = [...mealOrder];
    const [moved] = next.splice(mealDragFrom, 1);
    next.splice(i, 0, moved);
    mealOrder = next;
    mealDragFrom = i;
    mealDragChanged = true;
  }
  async function onMealDragEnd() {
    mealDragFrom = null;
    if (!mealDragChanged) return;
    mealDragChanged = false;
    const body = new FormData();
    body.set('order', JSON.stringify(mealOrder));
    await fetch('?/reorderMeals', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
    await invalidateAll();
  }

  let addingMeal = $state(false);
  let newMealName = $state('');

  // --- goal add/edit modal ---
  type GoalEditing = { nutrientId: number; min: number | null; max: number | null };
  let goalModal = $state<{ editing: GoalEditing | null } | null>(null);
  const goalModalKey = $derived(goalModal?.editing ? `g${goalModal.editing.nutrientId}` : 'gnew');
  function openAddGoal() {
    goalModal = { editing: null };
  }
  function openEditGoal(g: (typeof data.goals)[number]) {
    goalModal = { editing: { nutrientId: g.nutrientId, min: g.targetMin, max: g.targetMax } };
  }

  // --- drag-to-reorder (today only) ---
  // Initialised for SSR/first render; the effect resyncs after the goal set
  // changes (reorder/add/delete, or navigating to another day).
  let order = $state<number[]>(untrack(() => data.goals.map((g) => g.nutrientId)));
  $effect(() => {
    order = data.goals.map((g) => g.nutrientId);
  });
  let dragFrom = $state<number | null>(null);
  let dragChanged = false;

  function onDragStart(i: number) {
    dragFrom = i;
    dragChanged = false;
  }
  function onDragOver(i: number, e: DragEvent) {
    e.preventDefault();
    if (dragFrom === null || dragFrom === i) return;
    const next = [...order];
    const [moved] = next.splice(dragFrom, 1);
    next.splice(i, 0, moved);
    order = next;
    dragFrom = i;
    dragChanged = true;
  }
  async function onDragEnd() {
    dragFrom = null;
    if (!dragChanged) return;
    dragChanged = false;
    const body = new FormData();
    body.set('order', JSON.stringify(order));
    await fetch('?/reorderGoals', { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
    await invalidateAll();
  }

  const totalEnergy = $derived.by(() => {
    const e = data.catalog.find((n) => n.unit === 'kcal');
    return e ? (data.totals[e.id] ?? 0) : 0;
  });
</script>

<svelte:head><title>Plate · {data.label}</title></svelte:head>

<header class="top">
  <div class="date">
    <a class="arw" href="/diary/{data.prev}" aria-label="Previous day">‹</a>
    <div class="date-t">
      <h2>{data.label}</h2>
      <div class="sub">{data.relative ?? data.date}</div>
    </div>
    <a class="arw" href="/diary/{data.next}" aria-label="Next day">›</a>
  </div>
</header>

<div class="body">
  <div class="sec-h">
    <span>Goals</span>
    {#if isToday}
      {#if canAddGoal}<button class="link-btn" type="button" onclick={openAddGoal}>+ Add goal</button>{/if}
    {:else}
      <span class="mut">viewing {data.date} · edit goals on today</span>
    {/if}
  </div>
  {#if data.goals.length === 0}
    <p class="empty">{isToday ? 'No goals yet — add one to start tracking.' : 'No goals for this day.'}</p>
  {:else}
    <div class="tiles">
      {#each order as nid (nid)}
        {@const g = goalByNutrient.get(nid)}
        {@const n = catalogById.get(nid)}
        {#if g && n}
          <div
            class="tile-wrap"
            class:dragging={dragFrom !== null}
            draggable={isToday}
            role={isToday ? 'button' : undefined}
            tabindex="-1"
            ondragstart={() => onDragStart(order.indexOf(nid))}
            ondragover={(e) => isToday && onDragOver(order.indexOf(nid), e)}
            ondragend={onDragEnd}
          >
            <GoalTile
              name={n.name}
              unit={n.unit}
              consumed={data.totals[nid] ?? 0}
              mode={g.mode}
              targetMin={g.targetMin}
              targetMax={g.targetMax}
              onedit={() => isToday && openEditGoal(g)}
            />
          </div>
        {/if}
      {/each}
    </div>
  {/if}

  {#snippet entryRow(e: (typeof data.entries)[number])}
    <button class="entry" type="button" onclick={() => openEdit(e)}>
      <span class="e-nm">{e.foodName}{#if e.brand}<em> · {e.brand}</em>{/if}</span>
      <span class="e-amt">{e.unitLabel}</span>
      <span class="e-k">{e.energy === null ? '—' : Math.round(e.energy).toLocaleString()}</span>
    </button>
  {/snippet}

  <div class="sec-h mt">
    <span>Log</span>
    <span class="mut">{Math.round(totalEnergy).toLocaleString()} kcal · {data.entries.length} item{data.entries.length === 1 ? '' : 's'}</span>
  </div>

  {#if data.mealGroups.length === 0}
    <!-- No meals defined → flat list. -->
    {#if data.entries.length === 0}
      <p class="empty">No food logged for this day.</p>
    {:else}
      <div class="log">
        {#each data.entries as e (e.id)}{@render entryRow(e)}{/each}
      </div>
    {/if}
    <button class="add-row" type="button" onclick={() => openAdd(null)}>+ Add food</button>
  {:else}
    <!-- Grouped by user-defined meals. -->
    {#each mealOrder as mid (mid)}
      {@const meal = mealById.get(mid)}
      {#if meal}
        {@const es = entriesFor(mid)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="meal"
          role="group"
          draggable="true"
          ondragstart={() => onMealDragStart(mealOrder.indexOf(mid))}
          ondragover={(e) => onMealDragOver(mealOrder.indexOf(mid), e)}
          ondragend={onMealDragEnd}
        >
          <div class="meal-h">
            <span class="grip" title="Drag to reorder">⠿</span>
            <form method="POST" action="?/renameMeal" use:enhance class="meal-name-form">
              <input type="hidden" name="id" value={mid} />
              <input
                class="meal-name"
                name="name"
                value={meal.name}
                onchange={(e) => e.currentTarget.form?.requestSubmit()}
                aria-label="Meal name"
              />
            </form>
            <span class="meal-k">{Math.round(subtotal(es)).toLocaleString()} kcal</span>
            <form method="POST" action="?/deleteMeal" use:enhance>
              <input type="hidden" name="id" value={mid} />
              <button class="meal-del" type="submit" title="Delete meal" aria-label="Delete meal">✕</button>
            </form>
          </div>
          {#if es.length > 0}
            <div class="log meal-log">
              {#each es as e (e.id)}{@render entryRow(e)}{/each}
            </div>
          {/if}
          <button class="add-row sm" type="button" onclick={() => openAdd(mid)}>+ Add food</button>
        </div>
      {/if}
    {/each}

    {#if unsortedEntries.length > 0}
      <div class="meal">
        <div class="meal-h">
          <span class="meal-name plain">Unsorted</span>
          <span class="meal-k">{Math.round(subtotal(unsortedEntries)).toLocaleString()} kcal</span>
        </div>
        <div class="log meal-log">
          {#each unsortedEntries as e (e.id)}{@render entryRow(e)}{/each}
        </div>
        <button class="add-row sm" type="button" onclick={() => openAdd(null)}>+ Add food</button>
      </div>
    {/if}
  {/if}

  <!-- New meal -->
  {#if addingMeal}
    <form
      method="POST"
      action="?/createMeal"
      class="new-meal"
      use:enhance={() => async ({ update }) => {
        await update({ reset: false });
        addingMeal = false;
        newMealName = '';
      }}
    >
      <!-- svelte-ignore a11y_autofocus -->
      <input
        class="new-meal-input"
        name="name"
        placeholder="Meal name (e.g. Breakfast)"
        bind:value={newMealName}
        autofocus
      />
      <button class="cta-sm" type="submit">Add</button>
      <button class="ghost-sm" type="button" onclick={() => (addingMeal = false)}>Cancel</button>
    </form>
  {:else}
    <button class="new-meal-btn" type="button" onclick={() => (addingMeal = true)}>+ New meal</button>
  {/if}
</div>

{#if modal}
  {#key modalKey}
    <AddEntryModal
      foods={data.foods}
      catalog={data.catalog}
      mealGroups={data.mealGroups}
      editing={modal.editing}
      defaultMealGroupId={modal.mealId}
      onclose={() => (modal = null)}
    />
  {/key}
{/if}

{#if goalModal}
  {#key goalModalKey}
    <GoalModal
      catalog={data.catalog}
      {usedNutrientIds}
      editing={goalModal.editing}
      onclose={() => (goalModal = null)}
    />
  {/key}
{/if}

<style>
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 13px 20px;
    border-bottom: 1px solid var(--line);
    background: #fff;
    flex: none;
  }
  .date {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .arw {
    width: 28px;
    height: 28px;
    border: 1px solid var(--line);
    border-radius: 8px;
    display: grid;
    place-items: center;
    color: var(--muted);
    font-size: 15px;
  }
  .arw:hover {
    background: var(--fill);
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
  .body {
    padding: 18px 20px;
  }
  .sec-h {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--muted);
    margin-bottom: 10px;
  }
  .sec-h.mt {
    margin-top: 22px;
  }
  .mut {
    color: var(--faint);
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    font-size: 11.5px;
  }
  .tiles {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 9px;
    align-items: stretch;
  }
  .tile-wrap {
    display: flex;
  }
  .tile-wrap[draggable='true'] {
    cursor: grab;
  }
  .tile-wrap.dragging[draggable='true'] {
    cursor: grabbing;
  }
  .link-btn {
    border: none;
    background: transparent;
    padding: 0;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    color: var(--accent-ink);
    text-transform: none;
    letter-spacing: 0;
    cursor: pointer;
  }
  .link-btn:hover {
    text-decoration: underline;
  }
  .log {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 12px;
    overflow: hidden;
  }
  .entry {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 11px 14px;
    border: none;
    border-bottom: 1px solid var(--line2);
    background: transparent;
    cursor: pointer;
    text-align: left;
  }
  .entry:last-child {
    border-bottom: none;
  }
  .entry:hover {
    background: var(--panel);
  }
  .e-nm {
    flex: 1;
    font-size: 13px;
  }
  .e-nm em {
    font-style: normal;
    color: var(--faint);
  }
  .e-amt {
    color: var(--muted);
    font-size: 11.5px;
    background: var(--panel);
    border: 1px solid var(--line2);
    padding: 2px 8px;
    border-radius: 6px;
  }
  .e-k {
    width: 52px;
    text-align: right;
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .empty {
    margin: 0;
    padding: 14px 0 0;
    text-align: center;
    color: var(--faint);
    font-size: 13px;
  }
  .add-row {
    width: 100%;
    margin-top: 10px;
    border: 1px dashed var(--line);
    border-radius: 10px;
    padding: 12px;
    text-align: center;
    background: transparent;
    color: var(--accent-ink);
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
  }
  .add-row:hover {
    background: var(--accent-soft);
    border-color: var(--accent);
  }
  .add-row.sm {
    padding: 8px;
    margin-top: 8px;
    font-size: 12px;
  }

  /* Meal groups */
  .meal {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 12px;
    padding: 8px 12px 10px;
    margin-bottom: 10px;
  }
  .meal-h {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 2px 8px;
    border-bottom: 1px solid var(--line2);
  }
  .grip {
    color: var(--faint);
    cursor: grab;
    font-size: 13px;
    line-height: 1;
  }
  .meal[draggable='true']:active .grip {
    cursor: grabbing;
  }
  .meal-name-form {
    flex: 1;
    min-width: 0;
    margin: 0;
  }
  .meal-name {
    width: 100%;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    font: inherit;
    font-size: 13.5px;
    font-weight: 600;
    color: var(--ink);
    padding: 4px 6px;
  }
  .meal-name:hover {
    border-color: var(--line);
  }
  .meal-name:focus {
    outline: none;
    border-color: var(--accent);
    background: #fff;
  }
  .meal-name.plain {
    flex: 1;
    color: var(--muted);
  }
  .meal-k {
    color: var(--faint);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
  }
  .meal-h form {
    margin: 0;
    display: flex;
  }
  .meal-del {
    border: none;
    background: transparent;
    color: var(--faint);
    cursor: pointer;
    font-size: 12px;
    padding: 4px 6px;
    border-radius: 6px;
  }
  .meal-del:hover {
    color: var(--over);
    background: var(--fill);
  }
  .meal-log {
    margin-top: 6px;
  }
  .new-meal-btn {
    margin-top: 4px;
    border: none;
    background: transparent;
    color: var(--accent-ink);
    font-weight: 600;
    font-size: 12.5px;
    cursor: pointer;
    padding: 6px 2px;
  }
  .new-meal-btn:hover {
    text-decoration: underline;
  }
  .new-meal {
    display: flex;
    gap: 8px;
    align-items: center;
    margin-top: 4px;
  }
  .new-meal-input {
    flex: 1;
    border: 1px solid var(--line);
    border-radius: 9px;
    padding: 8px 11px;
    font-size: 13px;
  }
  .cta-sm {
    background: var(--accent);
    color: #fff;
    border: none;
    border-radius: 9px;
    padding: 8px 14px;
    font-weight: 600;
    font-size: 12.5px;
    cursor: pointer;
  }
  .ghost-sm {
    border: 1px solid var(--line);
    background: #fff;
    color: var(--muted);
    border-radius: 9px;
    padding: 8px 12px;
    font-size: 12.5px;
    cursor: pointer;
  }
</style>
