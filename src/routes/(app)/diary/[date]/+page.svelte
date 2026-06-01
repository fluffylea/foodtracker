<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import AddEntryModal from '$lib/components/AddEntryModal.svelte';
  import GoalTile from '$lib/components/GoalTile.svelte';
  import GoalModal from '$lib/components/GoalModal.svelte';
  import { createReorder } from '$lib/gestures/reorder.svelte';
  import { flipDuration } from '$lib/motion';
  import { flip } from 'svelte/animate';
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
  const entryById = $derived(new Map(data.entries.map((e) => [e.id, e])));

  // The default "Log" bucket: entries with no meal, plus any whose meal isn't
  // visible on this day (e.g. its meal was removed) so they're never orphaned.
  const unsortedEntries = $derived(
    data.entries.filter((e) => e.mealGroupId === null || !mealById.has(e.mealGroupId))
  );
  function subtotalIds(ids: number[]) {
    return ids.reduce((s, id) => s + (entryById.get(id)?.energy ?? 0), 0);
  }
  // Resolve id lists into present rows. `animate:flip` needs the animated element
  // to be the *only* child of its keyed {#each}, so we filter here rather than
  // guard with {#if} inside the loop.
  function entriesOf(ids: number[]) {
    return ids.flatMap((id) => {
      const e = entryById.get(id);
      return e ? [e] : [];
    });
  }

  // `data.entries` already arrives sorted (getDay orders by sortOrder), so a
  // straight push preserves each meal's sequence.
  function groupEntryIds(d: typeof data): Map<number, number[]> {
    const m = new Map<number, number[]>(d.mealGroups.map((mg) => [mg.id, []]));
    for (const e of d.entries) {
      if (e.mealGroupId !== null && m.has(e.mealGroupId)) m.get(e.mealGroupId)!.push(e.id);
    }
    return m;
  }

  // These mirror the server data but are locally mutable so a drag can reorder
  // optimistically. Initialised eagerly (untrack) so they're correct during SSR,
  // then resynced whenever the server data changes (e.g. after a commit). The
  // entry map is the model the cross-meal entry drag mutates.
  let mealOrder = $state<number[]>(untrack(() => data.mealGroups.map((m) => m.id)));
  let mealEntryIds = $state<Map<number, number[]>>(untrack(() => groupEntryIds(data)));
  $effect(() => {
    mealOrder = data.mealGroups.map((m) => m.id);
    mealEntryIds = groupEntryIds(data);
  });
  // Present meals in drag order (filtered for the same flip-placement reason).
  const meals = $derived(
    mealOrder.flatMap((mid) => {
      const meal = mealById.get(mid);
      return meal ? [{ mid, meal }] : [];
    })
  );

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
  // Present goal tiles in drag order, pre-resolved (flip-placement, as above).
  const goalTiles = $derived(
    order.flatMap((nid) => {
      const g = goalByNutrient.get(nid);
      const n = catalogById.get(nid);
      return g && n ? [{ nid, g, n }] : [];
    })
  );

  // --- drag-reorder (goals grid + meals list + entries within/across meals) ---
  // The gesture is a long-press to lift (a plain tap still opens the item); the
  // engine (createReorder) floats a clone under the finger while the real items
  // reflow live via animate:flip. We just map a move onto our reactive models
  // and persist the result. Goals/meals are single ordered lists; entries are
  // grouped by meal and can hop between meals.
  function moveInList(arr: number[], dragId: number, refId: number | null, before: boolean): number[] {
    const next = arr.filter((x) => x !== dragId);
    if (refId === null) {
      next.push(dragId);
      return next;
    }
    const i = next.indexOf(refId);
    next.splice(i < 0 ? next.length : before ? i : i + 1, 0, dragId);
    return next;
  }

  function reshuffleEntry(dragId: number, toGroup: number, refId: number | null, before: boolean) {
    const next = new Map(mealEntryIds);
    for (const [g, ids] of next) {
      if (ids.includes(dragId)) next.set(g, ids.filter((x) => x !== dragId));
    }
    const target = (next.get(toGroup) ?? []).slice();
    if (refId === null) target.push(dragId);
    else {
      const i = target.indexOf(refId);
      target.splice(i < 0 ? target.length : before ? i : i + 1, 0, dragId);
    }
    next.set(toGroup, target);
    mealEntryIds = next;
  }

  async function postForm(action: string, field: string, value: unknown) {
    const body = new FormData();
    body.set(field, JSON.stringify(value));
    await fetch(action, { method: 'POST', body, headers: { 'x-sveltekit-action': 'true' } });
  }

  const reorder = createReorder({
    axisFor: (kind) => (kind === 'goal' ? 'x' : 'y'),
    reshuffle({ kind, dragId, toGroup, refId, before }) {
      if (kind === 'goal') order = moveInList(order, dragId, refId, before);
      else if (kind === 'meal') mealOrder = moveInList(mealOrder, dragId, refId, before);
      else reshuffleEntry(dragId, Number(toGroup), refId, before);
    },
    async commit(kind) {
      if (kind === 'goal') await postForm('?/reorderGoals', 'order', order);
      else if (kind === 'meal') await postForm('?/reorderMeals', 'order', mealOrder);
      else {
        const items: { id: number; mealGroupId: number }[] = [];
        for (const mid of mealOrder) {
          for (const id of mealEntryIds.get(mid) ?? []) items.push({ id, mealGroupId: mid });
        }
        await postForm('?/reorderEntries', 'items', items);
      }
      await invalidateAll();
    }
  });
  const reorderItem = reorder.reorderItem;
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
    <div class="tiles" data-reorder-zone="goal" data-reorder-group="0">
      {#each goalTiles as t (t.nid)}
        <div
          class="tile-wrap"
          class:reorder-placeholder={reorder.draggingKind === 'goal' && reorder.draggingId === t.nid}
          data-reorder-kind="goal"
          data-reorder-group="0"
          data-reorder-id={t.nid}
          use:reorderItem={{ kind: 'goal', group: 0, id: t.nid, disabled: !isToday }}
          animate:flip={{ duration: flipDuration() }}
        >
          <GoalTile
            name={t.n.name}
            unit={t.n.unit}
            consumed={data.totals[t.nid] ?? 0}
            mode={t.g.mode}
            targetMin={t.g.targetMin}
            targetMax={t.g.targetMax}
            onedit={() => isToday && openEditGoal(t.g)}
          />
        </div>
      {/each}
    </div>
  {/if}

  {#snippet entryContent(e: (typeof data.entries)[number])}
    <span class="e-nm">{e.foodName}{#if e.brand}<em> · {e.brand}</em>{/if}</span>
    <span class="e-amt">{e.unitLabel}</span>
    <span class="e-k">{e.energy === null ? '—' : Math.round(e.energy).toLocaleString()}</span>
  {/snippet}

  <!-- Named meals (effective-dated; only today's are editable). Each meal is a
       drop-zone for entries, so an entry can be dragged in (even when empty). -->
  {#each meals as { mid, meal } (mid)}
    {@const ids = mealEntryIds.get(mid) ?? []}
    <section
      class="meal-sec"
      class:reorder-placeholder={reorder.draggingKind === 'meal' && reorder.draggingId === mid}
      data-reorder-kind="meal"
      data-reorder-group="0"
      data-reorder-id={mid}
      use:reorderItem={{ kind: 'meal', group: 0, id: mid, disabled: !isToday, handle: '.grip' }}
      animate:flip={{ duration: flipDuration() }}
    >
      <div class="sec-h meal-head">
        {#if isToday}
          <span class="grip" title="Drag to reorder" aria-label="Drag to reorder meal">⠿</span>
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
        <span class="meal-sum">{Math.round(subtotalIds(ids)).toLocaleString()} kcal</span>
        {#if isToday && mealOrder.length > 1}
          <form method="POST" action="?/removeMeal" use:enhance class="meal-del-form">
            <input type="hidden" name="id" value={mid} />
            <button class="meal-del" type="submit" title="Remove meal" aria-label="Remove meal">✕</button>
          </form>
        {/if}
      </div>
      <div class="log-zone" data-reorder-zone="entry" data-reorder-group={mid}>
        {#if ids.length > 0}
          <div class="log">
            {#each entriesOf(ids) as e (e.id)}
              <button
                class="entry"
                type="button"
                class:reorder-placeholder={reorder.draggingKind === 'entry' && reorder.draggingId === e.id}
                data-reorder-kind="entry"
                data-reorder-group={mid}
                data-reorder-id={e.id}
                use:reorderItem={{ kind: 'entry', group: mid, id: e.id }}
                animate:flip={{ duration: flipDuration() }}
                onclick={() => openEdit(e)}
              >
                {@render entryContent(e)}
              </button>
            {/each}
          </div>
        {/if}
        <button class="add-row" type="button" onclick={() => openAdd(mid)}>+ Add food</button>
      </div>
    </section>
  {/each}

  <!-- Safety net: entries whose meal isn't visible on this day (shouldn't
       normally happen now that every entry has a real meal). Not reorderable. -->
  {#if unsortedEntries.length > 0}
    <section class="meal-sec">
      <div class="sec-h meal-head">
        <span class="meal-name plain">Unsorted</span>
        <span class="meal-sum">{Math.round(unsortedEntries.reduce((s, e) => s + (e.energy ?? 0), 0)).toLocaleString()} kcal</span>
      </div>
      <div class="log">
        {#each unsortedEntries as e (e.id)}
          <button class="entry" type="button" onclick={() => openEdit(e)}>{@render entryContent(e)}</button>
        {/each}
      </div>
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
    position: sticky;
    top: 0;
    z-index: 10;
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
  .meal-head {
    align-items: center;
    gap: 6px;
  }
  /* Meal drag handle — sized for a thumb (long-press to lift, drag, drop). */
  .grip {
    color: var(--faint);
    cursor: grab;
    font-size: 15px;
    line-height: 1;
    padding: 8px 7px;
    margin: -8px -3px -8px -7px;
    opacity: 0.55;
    touch-action: none;
  }
  .grip:active {
    cursor: grabbing;
    opacity: 1;
  }
  /* Drop-zone wrapper (entries + add-row) — purely structural, the meal's whole
     body is a target so an entry can be dragged into an empty meal. */
  .log-zone {
    display: block;
  }
  /* The entry is now a drag source: hint the lift on press without stealing the
     vertical scroll that a quick flick should still do. */
  .entry {
    touch-action: pan-y;
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
