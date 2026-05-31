<script lang="ts">
  import { shortDayLabel } from '$lib/date';

  type Line = { id: number; name: string; unit: string; color: string; values: number[] };
  let { dates, lines, height = 280 }: { dates: string[]; lines: Line[]; height?: number } = $props();

  const n = $derived(dates.length);

  // Each metric is normalized to its own max over the window, so lines with
  // very different scales (kcal vs g) overlay and their shapes are comparable.
  function pointsFor(values: number[]): string {
    const max = Math.max(0, ...values);
    const denom = max > 0 ? max : 1;
    return values
      .map((v, i) => {
        const x = n > 1 ? (i / (n - 1)) * 100 : 50;
        const y = 100 - (v / denom) * 100;
        return `${x},${y}`;
      })
      .join(' ');
  }

  // ~5 evenly spaced x-axis date labels.
  const xLabels = $derived.by(() => {
    if (n === 0) return [];
    const count = Math.min(5, n);
    const out: string[] = [];
    for (let k = 0; k < count; k++) {
      const i = Math.round((k / Math.max(1, count - 1)) * (n - 1));
      out.push(shortDayLabel(dates[i]));
    }
    return out;
  });
</script>

<div class="ochart" style="height: {height}px">
  <div class="yax"><span>100%</span><span>75</span><span>50</span><span>25</span><span>0</span></div>
  <div class="plot">
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      {#each [0, 25, 50, 75, 100] as y}
        <line class="gl" x1="0" x2="100" y1={y} y2={y} />
      {/each}
      {#each lines as l (l.id)}
        <polyline points={pointsFor(l.values)} style="stroke: {l.color}" />
      {/each}
    </svg>
    {#if lines.length === 0}
      <div class="empty">Pick a metric to plot.</div>
    {/if}
  </div>
  <div class="xax">{#each xLabels as t}<span>{t}</span>{/each}</div>
</div>

<style>
  .ochart {
    position: relative;
    background: #fff;
    border: 1px solid var(--line2);
    border-radius: 10px;
  }
  .yax {
    position: absolute;
    left: 0;
    top: 8px;
    bottom: 24px;
    width: 34px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    align-items: flex-end;
    padding-right: 4px;
  }
  .yax span {
    font-size: 9px;
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }
  .plot {
    position: absolute;
    left: 40px;
    right: 14px;
    top: 12px;
    bottom: 24px;
  }
  .plot svg {
    width: 100%;
    height: 100%;
    display: block;
    overflow: visible;
  }
  .gl {
    stroke: var(--line2);
    stroke-width: 1;
    vector-effect: non-scaling-stroke;
  }
  polyline {
    fill: none;
    stroke-width: 2;
    stroke-linejoin: round;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }
  .empty {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--faint);
    font-size: 13px;
  }
  .xax {
    position: absolute;
    left: 40px;
    right: 14px;
    bottom: 6px;
    display: flex;
    justify-content: space-between;
  }
  .xax span {
    font-size: 9px;
    color: var(--faint);
  }
</style>
