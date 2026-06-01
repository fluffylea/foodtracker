<script lang="ts">
  // One period's chart card (chart + legend). Factored out of the Trends route so
  // the swipe-pager can render prev/current/next periods as panes. The nutrient
  // selection (`active`) is owned by the route and shared across panes, so paging
  // keeps your chosen metrics. Preview panes pass interactive={false}.
  import OverlayChart from '$lib/components/OverlayChart.svelte';
  import type { Nutrient } from '$lib/server/db/schema';
  import type { AxisTick } from '$lib/date';

  let {
    dates,
    series,
    ticks = [],
    granularity = 'day',
    catalog,
    active,
    colorById,
    interactive = true,
    onpick
  }: {
    dates: string[];
    series: Record<number, number[]>;
    ticks?: AxisTick[];
    granularity?: 'day' | 'week';
    catalog: Nutrient[];
    active: Set<number>;
    colorById: Map<number, string>;
    interactive?: boolean;
    onpick?: (index: number) => void;
  } = $props();

  const zeros = $derived(dates.map(() => 0));
  const lines = $derived(
    catalog
      .filter((n) => active.has(n.id))
      .map((n) => ({
        id: n.id,
        name: n.name,
        unit: n.unit,
        color: colorById.get(n.id) ?? '#888',
        values: series[n.id] ?? zeros
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

<div class="card chartcard">
  <OverlayChart
    {dates}
    {lines}
    {ticks}
    {granularity}
    onpick={interactive ? onpick : undefined}
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

<style>
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
