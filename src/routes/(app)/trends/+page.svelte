<script lang="ts">
  import { goto, preloadData } from '$app/navigation';
  import Pager from '$lib/components/Pager.svelte';
  import TrendChart from '$lib/components/TrendChart.svelte';
  import { coarsePointer } from '$lib/pointer.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

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

  // Which nutrients are plotted (client-side toggle, shared across pager panes).
  // Default: energy + protein.
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

  // --- period swipe-pager (touch: drag the chart to page prev/next period) ---
  let pager = $state<{ go: (dir: 'prev' | 'next') => void }>();
  let prevData = $state<PageData | null>(null);
  let nextData = $state<PageData | null>(null);

  async function preload(href: string): Promise<PageData | null> {
    const r = await preloadData(href);
    return r.type === 'loaded' && r.status === 200 ? (r.data as PageData) : null;
  }

  function periodHref(ref: string) {
    return `/trends?view=${data.view}&ref=${ref}`;
  }

  $effect(() => {
    const key = `${data.view}:${data.prevRef}`;
    prevData = null;
    nextData = null;
    preload(periodHref(data.prevRef)).then((d) => key === `${data.view}:${data.prevRef}` && (prevData = d));
    if (!data.atLatest) {
      preload(periodHref(data.nextRef)).then(
        (d) => key === `${data.view}:${data.prevRef}` && (nextData = d)
      );
    }
  });

  function commit(dir: 'prev' | 'next') {
    goto(periodHref(dir === 'prev' ? data.prevRef : data.nextRef), {
      noScroll: true,
      keepFocus: true
    });
  }
</script>

<svelte:head><title>Plate · Trends</title></svelte:head>

<header class="top">
  <div class="navrow">
    <a class="arw" href={periodHref(data.prevRef)} aria-label="Previous period" onclick={(e) => { e.preventDefault(); pager?.go('prev'); }}>‹</a>
    <div class="date-t">
      <h2>{data.label}</h2>
      <div class="sub">{viewLabel[data.view]} · each metric to its own range</div>
    </div>
    {#if data.atLatest}
      <span class="arw disabled" aria-hidden="true">›</span>
    {:else}
      <a class="arw" href={periodHref(data.nextRef)} aria-label="Next period" onclick={(e) => { e.preventDefault(); pager?.go('next'); }}>›</a>
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

  <!-- Swipe (touch) pages prev/next period; on a fine pointer the gesture is off
       (hover-scrub + arrows stay primary) but go() still animates the arrows. -->
  <Pager
    bind:this={pager}
    enabled={coarsePointer()}
    key={`${data.view}:${data.prevRef}`}
    hasNext={!data.atLatest}
    oncommit={commit}
  >
    {#snippet prev()}
      {#if prevData}
        <TrendChart
          dates={prevData.dates}
          series={prevData.series}
          ticks={prevData.ticks}
          granularity={prevData.granularity}
          catalog={data.catalog}
          {active}
          {colorById}
          interactive={false}
        />
      {/if}
    {/snippet}
    {#snippet current()}
      <TrendChart
        dates={data.dates}
        series={data.series}
        ticks={data.ticks}
        granularity={data.granularity}
        catalog={data.catalog}
        {active}
        {colorById}
        onpick={pick}
      />
    {/snippet}
    {#snippet next()}
      {#if nextData}
        <TrendChart
          dates={nextData.dates}
          series={nextData.series}
          ticks={nextData.ticks}
          granularity={nextData.granularity}
          catalog={data.catalog}
          {active}
          {colorById}
          interactive={false}
        />
      {/if}
    {/snippet}
  </Pager>
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
</style>
