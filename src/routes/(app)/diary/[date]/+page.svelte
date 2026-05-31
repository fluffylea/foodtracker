<script lang="ts">
  import { untrack } from 'svelte';
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
  type Editing = { id: number; foodId: number; amount: number; unitId: number | null };
  let modal = $state<{ editing: Editing | null } | null>(null);
  const modalKey = $derived(modal?.editing ? `e${modal.editing.id}` : 'new');
  function openAdd() {
    modal = { editing: null };
  }
  function openEdit(e: (typeof data.entries)[number]) {
    modal = { editing: { id: e.id, foodId: e.foodId, amount: e.amount, unitId: e.unitId } };
  }

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

  <div class="sec-h mt">
    <span>Log</span>
    <span class="mut">{Math.round(totalEnergy).toLocaleString()} kcal · {data.entries.length} item{data.entries.length === 1 ? '' : 's'}</span>
  </div>

  {#if data.entries.length === 0}
    <p class="empty">No food logged for this day.</p>
  {:else}
    <div class="log">
      {#each data.entries as e (e.id)}
        <button class="entry" type="button" onclick={() => openEdit(e)}>
          <span class="e-nm">{e.foodName}{#if e.brand}<em> · {e.brand}</em>{/if}</span>
          <span class="e-amt">{e.unitLabel}</span>
          <span class="e-k">{e.energy === null ? '—' : Math.round(e.energy).toLocaleString()}</span>
        </button>
      {/each}
    </div>
  {/if}

  <button class="add-row" type="button" onclick={openAdd}>+ Add food</button>
</div>

{#if modal}
  {#key modalKey}
    <AddEntryModal foods={data.foods} catalog={data.catalog} editing={modal.editing} onclose={() => (modal = null)} />
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
</style>
