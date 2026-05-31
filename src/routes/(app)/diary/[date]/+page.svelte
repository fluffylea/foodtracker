<script lang="ts">
  import AddEntryModal from '$lib/components/AddEntryModal.svelte';

  let { data } = $props();

  type Editing = { id: number; foodId: number; amount: number; unitId: number | null };
  let modal = $state<{ editing: Editing | null } | null>(null);

  const modalKey = $derived(modal?.editing ? `e${modal.editing.id}` : 'new');

  function openAdd() {
    modal = { editing: null };
  }
  function openEdit(e: (typeof data.entries)[number]) {
    modal = { editing: { id: e.id, foodId: e.foodId, amount: e.amount, unitId: e.unitId } };
  }

  function fmtTotal(v: number, unit: string): string {
    if (unit === 'kcal') return Math.round(v).toLocaleString();
    return String(Math.round(v * 10) / 10);
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
  <button class="btn" onclick={openAdd}>+ Add food</button>
</header>

<div class="body">
  <div class="sec-h"><span>Goals</span><span class="mut">goal tiles arrive in milestone 5</span></div>
  <div class="tiles">
    {#each data.catalog as n (n.id)}
      <div class="tile">
        <div class="nm">{n.name}</div>
        <div class="val">{fmtTotal(data.totals[n.id] ?? 0, n.unit)}<small> {n.unit}</small></div>
      </div>
    {/each}
  </div>

  <div class="sec-h mt">
    <span>Log</span>
    <span class="mut">{Math.round(totalEnergy).toLocaleString()} kcal · {data.entries.length} item{data.entries.length === 1 ? '' : 's'}</span>
  </div>

  {#if data.entries.length === 0}
    <div class="empty">
      <p>No food logged for this day.</p>
      <button class="btn" onclick={openAdd}>+ Add food</button>
    </div>
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
</div>

{#if modal}
  {#key modalKey}
    <AddEntryModal foods={data.foods} editing={modal.editing} onclose={() => (modal = null)} />
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
  .btn {
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    font-size: 13px;
    padding: 8px 14px;
    border-radius: 9px;
    border: none;
    cursor: pointer;
  }
  .btn:hover {
    background: var(--accent-ink);
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
  }
  .tile {
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 11px;
    padding: 10px 11px;
  }
  .tile .nm {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    font-weight: 600;
  }
  .tile .val {
    font-size: 18px;
    font-weight: 600;
    margin-top: 7px;
    font-variant-numeric: tabular-nums;
  }
  .tile .val small {
    font-size: 10.5px;
    color: var(--faint);
    font-weight: 400;
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
    border: 1px dashed var(--line);
    border-radius: 12px;
    padding: 28px;
    text-align: center;
    color: var(--muted);
  }
  .empty p {
    margin: 0 0 12px;
    font-size: 13px;
  }
</style>
