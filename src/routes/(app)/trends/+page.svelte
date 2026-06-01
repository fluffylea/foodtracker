<script lang="ts">
  import { goto } from '$app/navigation';
  import OverlayChart from '$lib/components/OverlayChart.svelte';

  let { data } = $props();

  const viewLabel = { week: 'Week', month: 'Month', quarter: 'Quarter', year: 'Year' };

  // Click a point: day views jump to that day's diary; the year view (weekly
  // points) drills into that week's chart.
  function pick(index: number) {
    const d = data.dates[index];
    if (!d) return;
    if (data.granularity === 'week') goto(`/trends?view=week&ref=${d}`);
    else goto(`/diary/${d}`);
  }

  // Stable color per nutrient (by catalog position).
  const PALETTE = ['#ef8a3c', '#6f9e63', '#7c8896', '#2c2a27', '#c96442', '#5a8fb0', '#b08968', '#9a7bb0'];
  const colorById = $derived(
    new Map(data.catalog.map((n, i) => [n.id, PALETTE[i % PALETTE.length]]))
  );

  // Which nutrients are plotted (client-side toggle). Default: energy + protein.
  const defaultSelected = $derived(
    new Set(data.catalog.filter((n) => n.key === 'energy' || n.key === 'protein').map((n) => n.id))
  );
  let selected = $state<Set<number>>(new Set());
  let touched = $state(false);
  const active = $derived(touched ? selected : defaultSelected);

  function toggle(id: number) {
    const next = new Set(active);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected = next;
    touched = true;
  }

  const zeros = $derived(data.dates.map(() => 0));
  const lines = $derived(
    data.catalog
      .filter((n) => active.has(n.id))
      .map((n) => ({
        id: n.id,
        name: n.name,
        unit: n.unit,
        color: colorById.get(n.id) ?? '#888',
        values: data.series[n.id] ?? zeros
      }))
  );

  function fmt(v: number, unit: string): string {
    return unit === 'kcal' ? Math.round(v).toLocaleString() : String(Math.round(v * 10) / 10);
  }
  // Average over logged points only (value > 0); 0 means "no data" for that day.
  function avg(values: number[]): number {
    const v = values.filter((x) => x > 0);
    return v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0;
  }
</script>

<svelte:head><title>Plate · Trends</title></svelte:head>

<header class="top">
  <div class="navrow">
    <a class="arw" href="?view={data.view}&ref={data.prevRef}" aria-label="Previous period">‹</a>
    <div class="date-t">
      <h2>{data.label}</h2>
      <div class="sub">{viewLabel[data.view]} · each metric to its own range</div>
    </div>
    {#if data.atLatest}
      <span class="arw disabled" aria-hidden="true">›</span>
    {:else}
      <a class="arw" href="?view={data.view}&ref={data.nextRef}" aria-label="Next period">›</a>
    {/if}
  </div>
  <div class="seg">
    {#each data.views as v}
      <a class="seg-item" class:on={v === data.view} href="?view={v}">
        {v === 'week' ? 'W' : v === 'month' ? 'M' : v === 'quarter' ? '3M' : 'Y'}
      </a>
    {/each}
  </div>
</header>

<div class="body">
  <div class="chips">
    {#each data.catalog as n (n.id)}
      <button
        class="chip"
        class:on={active.has(n.id)}
        type="button"
        style={active.has(n.id) ? `--c: ${colorById.get(n.id)}` : ''}
        onclick={() => toggle(n.id)}
      >
        {n.name}
      </button>
    {/each}
  </div>

  <div class="card chartcard">
    <OverlayChart
      dates={data.dates}
      {lines}
      ticks={data.ticks}
      granularity={data.granularity}
      onpick={pick}
      height={300}
    />

    {#if lines.length > 0}
      <div class="legend">
        {#each lines as l (l.id)}
          {@const a = avg(l.values)}
          <span class="leg">
            <i style="background: {l.color}"></i>
            <span class="leg-nm">{l.name}</span>
            <em>{a > 0 ? `avg ${fmt(a, l.unit)} ${l.unit}` : 'no data'}</em>
          </span>
        {/each}
      </div>
    {/if}
  </div>
</div>

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
  .navrow {
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
  .arw.disabled {
    opacity: 0.35;
    cursor: default;
  }
  .date-t {
    min-width: 130px;
    text-align: center;
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
  .seg {
    display: inline-flex;
    background: var(--fill);
    border-radius: 9px;
    padding: 3px;
  }
  .seg-item {
    padding: 5px 13px;
    font-size: 12px;
    border-radius: 7px;
    color: var(--muted);
    font-weight: 600;
  }
  .seg-item.on {
    background: #fff;
    color: var(--ink);
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  }
  .body {
    padding: 18px var(--gutter);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
    margin-bottom: 14px;
  }
  .chip {
    font-size: 12px;
    padding: 5px 11px;
    border-radius: 20px;
    border: 1px solid var(--line);
    color: var(--muted);
    background: #fff;
    cursor: pointer;
  }
  .chip.on {
    border-color: transparent;
    color: #fff;
    background: var(--c);
    font-weight: 600;
  }
  .chartcard {
    padding: 14px 15px;
  }
  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 18px;
    margin-top: 13px;
  }
  .leg {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 12.5px;
  }
  .leg i {
    width: 14px;
    height: 3px;
    border-radius: 2px;
    flex: none;
  }
  .leg em {
    font-style: normal;
    color: var(--faint);
    font-size: 11.5px;
    font-variant-numeric: tabular-nums;
  }
</style>
