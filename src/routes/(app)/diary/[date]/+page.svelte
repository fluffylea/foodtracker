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
  // The default "Log" bucket: entries with no meal, plus any whose meal isn't
  // visible on this day (e.g. its meal was removed) so they're never orphaned.
  const unsortedEntries = $derived(
    data.entries.filter((e) => e.mealGroupId === null || !mealById.has(e.mealGroupId))
  );
  function subtotal(es: (typeof data.entries)) {
    return es.reduce((s, e) => s + (e.energy ?? 0), 0);
  }

  let mealOrder = $state<number[]>(untrack(() => data.mealGroups.map((m) => m.id)));
  $effect(() => {
    mealOrder = data.mealGroups.map((m) => m.id);
  });

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

  // Goal order (today only); resynced after the goal set changes.
  let order = $state<number[]>(untrack(() => data.goals.map((g) => g.nutrientId)));
  $effect(() => {
    order = data.goals.map((g) => g.nutrientId);
  });

  // --- pointer-based reorder (works on touch AND mouse) ---
  // Started from a grip handle (touch-action: none + pointer capture) so it
  // never fights scroll, text selection, or stray clicks. Instead of moving the
  // item live, a drop-indicator line shows where it will land; the reorder is
  // committed only on release. (Native HTML5 drag-and-drop doesn't fire on
  // touch devices, which is why the old version was broken.)
  let dragKind = $state<'goal' | 'meal' | null>(null);
  let dragId = $state<number | null>(null);
  // The id the dragged item will be inserted *before*, or 'end'.
  let dropTarget = $state<number | 'end' | null>(null);

  function onReorderMove(e: PointerEvent) {
    if (dragKind === null || dragId === null) return;
    const el = document
      .elementFromPoint(e.clientX, e.clientY)
      ?.closest(`[data-${dragKind}-id]`) as HTMLElement | null;
    if (!el) return;
    const targetId = Number(el.getAttribute(`data-${dragKind}-id`));
    if (!Number.isInteger(targetId) || targetId === dragId) return;

    const arr = dragKind === 'goal' ? order : mealOrder;
    const rect = el.getBoundingClientRect();
    // meals stack vertically; tiles flow in a grid → use the relevant axis.
    const before =
      dragKind === 'meal'
        ? e.clientY < rect.top + rect.height / 2
        : e.clientX < rect.left + rect.width / 2;
    if (before) {
      dropTarget = targetId;
    } else {
      const i = arr.indexOf(targetId);
      dropTarget = i >= 0 && i + 1 < arr.length ? arr[i + 1] : 'end';
    }
  }
  async function onReorderUp() {
    window.removeEventListener('pointermove', onReorderMove);
    document.body.classList.remove('reordering');
    const kind = dragKind;
    const id = dragId;
    const target = dropTarget;
    dragKind = null;
    dragId = null;
    dropTarget = null;
    if (kind === null || id === null || target === null) return;

    const orig = kind === 'goal' ? order : mealOrder;
    const next = orig.filter((x) => x !== id);
    const at = target === 'end' ? next.length : next.indexOf(target);
    next.splice(at < 0 ? next.length : at, 0, id);
    if (next.join(',') === orig.join(',')) return; // no change

    if (kind === 'goal') order = next;
    else mealOrder = next;
    const body = new FormData();
    body.set('order', JSON.stringify(next));
    await fetch(kind === 'goal' ? '?/reorderGoals' : '?/reorderMeals', {
      method: 'POST',
      body,
      headers: { 'x-sveltekit-action': 'true' }
    });
    await invalidateAll();
  }
  function startReorder(kind: 'goal' | 'meal', id: number, e: PointerEvent) {
    if (!isToday) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    dragKind = kind;
    dragId = id;
    dropTarget = null;
    document.body.classList.add('reordering');
    window.addEventListener('pointermove', onReorderMove);
    window.addEventListener('pointerup', onReorderUp, { once: true });
  }
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
            class:dragging={dragKind === 'goal' && dragId === nid}
            class:drop-before={dropTarget === nid}
            class:drop-end={dropTarget === 'end' && nid === order[order.length - 1]}
            data-goal-id={nid}
          >
            <GoalTile
              name={n.name}
              unit={n.unit}
              consumed={data.totals[nid] ?? 0}
              mode={g.mode}
              targetMin={g.targetMin}
              targetMax={g.targetMax}
              onedit={() => isToday && openEditGoal(g)}
              ongrip={isToday ? (e) => startReorder('goal', nid, e) : undefined}
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

  {#snippet logBody(entries: typeof data.entries, mealId: number | null)}
    {#if entries.length > 0}
      <div class="log">
        {#each entries as e (e.id)}{@render entryRow(e)}{/each}
      </div>
    {/if}
    <button class="add-row" type="button" onclick={() => openAdd(mealId)}>+ Add food</button>
  {/snippet}

  <!-- Named meals (effective-dated; only today's are editable). -->
  {#each mealOrder as mid (mid)}
    {@const meal = mealById.get(mid)}
    {#if meal}
      {@const es = entriesFor(mid)}
      <section
        class="meal-sec"
        class:dragging={dragKind === 'meal' && dragId === mid}
        class:drop-before={dropTarget === mid}
        class:drop-end={dropTarget === 'end' && mid === mealOrder[mealOrder.length - 1]}
        data-meal-id={mid}
      >
        <div class="sec-h meal-head">
          {#if isToday}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <span class="grip" onpointerdown={(e) => startReorder('meal', mid, e)} title="Drag to reorder">⠿</span>
          {/if}
          {#if isToday}
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
          {:else}
            <span class="meal-name plain">{meal.name}</span>
          {/if}
          <span class="meal-sum">{Math.round(subtotal(es)).toLocaleString()} kcal</span>
          {#if isToday && mealOrder.length > 1}
            <form method="POST" action="?/removeMeal" use:enhance class="meal-del-form">
              <input type="hidden" name="id" value={mid} />
              <button class="meal-del" type="submit" title="Remove meal" aria-label="Remove meal">✕</button>
            </form>
          {/if}
        </div>
        {@render logBody(es, mid)}
      </section>
    {/if}
  {/each}

  <!-- Safety net: entries whose meal isn't visible on this day (shouldn't
       normally happen now that every entry has a real meal). -->
  {#if unsortedEntries.length > 0}
    <section class="meal-sec">
      <div class="sec-h meal-head">
        <span class="meal-name plain">Unsorted</span>
        <span class="meal-sum">{Math.round(subtotal(unsortedEntries)).toLocaleString()} kcal</span>
      </div>
      {@render logBody(unsortedEntries, null)}
    </section>
  {/if}

  <!-- New meal (today only). -->
  {#if isToday}
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
  {/if}
</div>

<!-- Floating quick-add (mobile only, thumb-reachable). -->
<button class="fab" type="button" onclick={() => openAdd(null)} aria-label="Add food">
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
</button>

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
    padding: 13px var(--gutter);
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
    padding: 18px var(--gutter);
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
  @media (max-width: 560px) {
    .tiles {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  .fab {
    display: none;
  }
  @media (max-width: 768px) {
    .fab {
      display: grid;
      place-items: center;
      position: fixed;
      right: 16px;
      bottom: calc(58px + env(safe-area-inset-bottom) + 16px);
      width: 52px;
      height: 52px;
      border-radius: 50%;
      background: var(--accent);
      color: #fff;
      border: none;
      box-shadow:
        0 4px 12px rgba(0, 0, 0, 0.22),
        0 1px 3px rgba(0, 0, 0, 0.12),
        inset 0 0 0 1px rgba(255, 255, 255, 0.15);
      z-index: 30;
      cursor: pointer;
    }
    .fab:active {
      background: var(--accent-ink);
    }
  }
  .tile-wrap {
    display: flex;
    position: relative;
  }
  .tile-wrap.dragging {
    opacity: 0.4;
  }
  /* drop-indicator line (grid → vertical line at the tile edge) */
  .tile-wrap.drop-before::before,
  .tile-wrap.drop-end::after {
    content: '';
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    border-radius: 2px;
    background: var(--accent);
  }
  .tile-wrap.drop-before::before {
    left: -5px;
  }
  .tile-wrap.drop-end::after {
    right: -5px;
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
  /* Meal sections — light, like the original Log header (no card border). */
  .meal-sec {
    margin-bottom: 18px;
    position: relative;
  }
  .meal-sec:first-of-type {
    margin-top: 22px;
  }
  /* drop-indicator line (vertical list → horizontal line at the meal edge) */
  .meal-sec.drop-before::before,
  .meal-sec.drop-end::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    border-radius: 2px;
    background: var(--accent);
  }
  .meal-sec.drop-before::before {
    top: -9px;
  }
  .meal-sec.drop-end::after {
    bottom: -9px;
  }
  .meal-head {
    align-items: center;
    gap: 6px;
  }
  .grip {
    color: var(--faint);
    cursor: grab;
    font-size: 13px;
    line-height: 1;
    padding: 4px 2px;
    margin: -4px 0;
    opacity: 0.55;
    touch-action: none;
  }
  .grip:active {
    cursor: grabbing;
    opacity: 1;
  }
  .meal-sec.dragging {
    opacity: 0.5;
  }
  .meal-name-form {
    margin: 0;
    flex: 1;
    min-width: 0;
  }
  /* The meal name is styled to read like the .sec-h label. */
  .meal-name {
    width: 100%;
    border: 1px solid transparent;
    border-radius: 6px;
    background: transparent;
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: var(--muted);
    padding: 3px 5px;
    margin-left: -5px;
  }
  .meal-name:hover {
    border-color: var(--line);
  }
  .meal-name:focus {
    outline: none;
    border-color: var(--accent);
    background: #fff;
    color: var(--ink);
  }
  .meal-name.plain {
    flex: 1;
  }
  .meal-sum {
    margin-left: auto;
    color: var(--faint);
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
  }
  .meal-del-form {
    margin: 0;
    display: flex;
  }
  .meal-del {
    border: none;
    background: transparent;
    color: var(--faint);
    cursor: pointer;
    font-size: 11px;
    padding: 2px 5px;
    border-radius: 5px;
    opacity: 0.45;
  }
  .meal-sec:hover .meal-del {
    opacity: 1;
  }
  .meal-del:hover {
    color: var(--over);
    background: var(--fill);
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
