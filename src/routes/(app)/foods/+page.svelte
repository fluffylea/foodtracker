<script lang="ts">
  import FoodEditor from '$lib/components/FoodEditor.svelte';

  let { data, form } = $props();

  let filter = $state('');
  const shown = $derived(
    data.foods.filter((f) => {
      const q = filter.trim().toLowerCase();
      if (!q) return true;
      return f.name.toLowerCase().includes(q) || (f.brand ?? '').toLowerCase().includes(q);
    })
  );

  const selectedId = $derived(data.selected?.id ?? null);
  // Remount the editor when the selection (or new-food intent) changes.
  const editorKey = $derived(data.isNew ? 'new' : (selectedId ?? 'none'));
  const showEditor = $derived(data.isNew || data.selected !== null);

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

<div class="split">
  <div class="list-col">
    <input class="search" placeholder="Filter my foods…" bind:value={filter} />
    {#if shown.length === 0}
      <div class="empty-list">
        {data.foods.length === 0 ? 'No foods yet — create one →' : 'No matches.'}
      </div>
    {:else}
      <div class="flist">
        {#each shown as f (f.id)}
          <a class="frow" class:sel={f.id === selectedId} href="/foods?id={f.id}">
            <span class="fnm">{f.name}{#if f.brand}<em> · {f.brand}</em>{/if}</span>
            <span class="tag {f.source === 'off' ? 'ov' : 'cu'}">{f.source === 'off' ? 'Override' : 'Custom'}</span>
            <span class="fk">{fmtEnergy(f.energyPer100g)}</span>
            <span class="fu">{['g', ...f.unitNames].join(' · ')}</span>
          </a>
        {/each}
      </div>
    {/if}
  </div>

  <div class="edit-col">
    {#if showEditor}
      {#key editorKey}
        <div class="card editor-card">
          <FoodEditor food={data.selected} catalog={data.catalog} error={form?.error} />
        </div>
      {/key}
    {:else}
      <div class="card empty-edit">
        <p>Select a food to edit, or <a href="/foods?new=1">create a new one</a>.</p>
      </div>
    {/if}
  </div>
</div>

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
  .split {
    display: flex;
    gap: 16px;
    padding: 18px 20px;
    align-items: flex-start;
  }
  .list-col {
    flex: 1;
    min-width: 0;
  }
  .edit-col {
    width: 380px;
    flex: none;
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
    padding: 10px 14px;
    border-bottom: 1px solid var(--line2);
    color: var(--ink);
  }
  .frow:last-child {
    border-bottom: none;
  }
  .frow.sel {
    background: var(--accent-soft);
  }
  .frow:hover:not(.sel) {
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
  .editor-card {
    padding: 16px 18px;
  }
  .empty-edit {
    padding: 28px 20px;
    text-align: center;
    color: var(--muted);
    font-size: 13px;
  }
</style>
