<script lang="ts">
  import { shortDayLabel, formatDayLabel, type AxisTick } from '$lib/date';

  type Line = { id: number; name: string; unit: string; color: string; values: number[] };
  let {
    dates,
    lines,
    ticks = [],
    granularity = 'day',
    height = 280,
    onpick
  }: {
    dates: string[];
    lines: Line[];
    ticks?: AxisTick[];
    granularity?: 'day' | 'week';
    height?: number;
    onpick?: (index: number) => void;
  } = $props();

  const n = $derived(dates.length);

  function indexFromX(clientX: number): number | null {
    if (!plotEl || n === 0) return null;
    const rect = plotEl.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    return Math.round(frac * (n - 1));
  }

  // Keep edge tick labels from spilling past the plot.
  function tickAlign(x: number): string {
    if (x <= 2) return '0';
    if (x >= 98) return '-100%';
    return '-50%';
  }

  // Each metric is normalized to its own max over the window, so lines with
  // very different scales (kcal vs g) overlay and their shapes are comparable.
  function maxOf(values: number[]): number {
    const m = Math.max(0, ...values);
    return m > 0 ? m : 1;
  }
  function xAt(i: number): number {
    return n > 1 ? (i / (n - 1)) * 100 : 50;
  }

  // A day/week with value 0 is treated as "no data" (untracked) — not drawn and
  // not averaged. Real points are joined solid when adjacent, dashed across a
  // gap; a metric with a single real point shows just a dot.
  type Seg = { x1: number; y1: number; x2: number; y2: number };
  function shape(line: Line): { solid: Seg[]; dashed: Seg[]; dot: { x: number; y: number } | null } {
    const max = maxOf(line.values);
    const pts: { i: number; x: number; y: number }[] = [];
    line.values.forEach((v, i) => {
      if (v > 0) pts.push({ i, x: xAt(i), y: 100 - (v / max) * 100 });
    });
    const solid: Seg[] = [];
    const dashed: Seg[] = [];
    for (let k = 0; k < pts.length - 1; k++) {
      const a = pts[k];
      const b = pts[k + 1];
      const seg = { x1: a.x, y1: a.y, x2: b.x, y2: b.y };
      (b.i - a.i === 1 ? solid : dashed).push(seg);
    }
    return { solid, dashed, dot: pts.length === 1 ? { x: pts[0].x, y: pts[0].y } : null };
  }

  // ---- hover cursor ----
  let plotEl: HTMLDivElement | undefined = $state();
  let hover = $state<number | null>(null);

  function onMove(e: PointerEvent) {
    hover = indexFromX(e.clientX);
  }
  function onLeave() {
    hover = null;
  }
  function onClick(e: MouseEvent) {
    const i = indexFromX(e.clientX);
    if (i !== null) onpick?.(i);
  }

  function fmt(v: number, unit: string): string {
    return unit === 'kcal' ? Math.round(v).toLocaleString() : String(Math.round(v * 10) / 10);
  }

  // Lone points (a metric with a single real value) — rendered as HTML dots so
  // they stay circular (an SVG <circle> would squash under the non-uniform scale).
  const loneDots = $derived(
    lines
      .map((l) => {
        const dot = shape(l).dot;
        return dot ? { x: dot.x, y: dot.y, color: l.color } : null;
      })
      .filter((d): d is { x: number; y: number; color: string } => d !== null)
  );

  const hoverX = $derived(hover === null ? 0 : xAt(hover));
  // Flip the tooltip to the left of the cursor once past ~60% width.
  const tipRight = $derived(hoverX > 60);
</script>

<div class="ochart" style="height: {height}px">
  <div class="yax"><span>100%</span><span>75</span><span>50</span><span>25</span><span>0</span></div>
  <!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
  <div
    class="plot"
    class:clickable={onpick && lines.length > 0}
    bind:this={plotEl}
    onpointermove={onMove}
    onpointerleave={onLeave}
    onclick={onClick}
  >
    <svg viewBox="0 0 100 100" preserveAspectRatio="none">
      {#each [0, 25, 50, 75, 100] as y}
        <line class="gl" x1="0" x2="100" y1={y} y2={y} />
      {/each}
      {#each ticks as t (t.index)}
        <line class="vgl" x1={xAt(t.index)} x2={xAt(t.index)} y1="0" y2="100" />
      {/each}
      {#each lines as l (l.id)}
        {@const s = shape(l)}
        {#each s.solid as g}<line class="seg" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} style="stroke: {l.color}" />{/each}
        {#each s.dashed as g}<line class="seg gap" x1={g.x1} y1={g.y1} x2={g.x2} y2={g.y2} style="stroke: {l.color}" />{/each}
      {/each}
      {#if hover !== null && lines.length > 0}
        <line class="cursor" x1={hoverX} x2={hoverX} y1="0" y2="100" />
      {/if}
    </svg>

    {#each loneDots as d}
      <span class="lonedot" style="left: {d.x}%; top: {d.y}%; background: {d.color}"></span>
    {/each}

    {#if hover !== null && lines.length > 0}
      <div class="tip" class:right={tipRight} style="left: {hoverX}%">
        <div class="tip-date">
          {granularity === 'week' ? `Week of ${shortDayLabel(dates[hover])}` : formatDayLabel(dates[hover])}
        </div>
        {#each lines as l (l.id)}
          <div class="tip-row">
            <i style="background: {l.color}"></i>
            <span class="tip-nm">{l.name}</span>
            <span class="tip-v">{l.values[hover] > 0 ? `${fmt(l.values[hover], l.unit)} ${l.unit}` : '—'}</span>
          </div>
        {/each}
      </div>
    {/if}

    {#if lines.length === 0}
      <div class="empty">Pick a metric to plot.</div>
    {/if}
  </div>
  <div class="xax">
    {#each ticks as t (t.index)}
      <span class="tick" style="left: {xAt(t.index)}%; transform: translateX({tickAlign(xAt(t.index))})">
        <span class="tlabel">{t.label}</span>
        {#if t.sub}<span class="tsub">{t.sub}</span>{/if}
      </span>
    {/each}
  </div>
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
    bottom: 32px;
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
    bottom: 32px;
  }
  .plot.clickable {
    cursor: pointer;
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
  .vgl {
    stroke: var(--line2);
    stroke-width: 1;
    opacity: 0.6;
    vector-effect: non-scaling-stroke;
  }
  .seg {
    stroke-width: 2;
    stroke-linecap: round;
    vector-effect: non-scaling-stroke;
  }
  .seg.gap {
    stroke-width: 1.5;
    stroke-dasharray: 2 3;
    opacity: 0.55;
  }
  .lonedot {
    position: absolute;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    border: 1.5px solid #fff;
    transform: translate(-50%, -50%);
    pointer-events: none;
  }
  .cursor {
    stroke: var(--muted);
    stroke-width: 1;
    stroke-dasharray: 3 3;
    vector-effect: non-scaling-stroke;
  }
  .tip {
    position: absolute;
    top: 0;
    transform: translateX(8px);
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 8px;
    box-shadow: 0 6px 20px rgba(70, 60, 45, 0.14);
    padding: 7px 9px;
    pointer-events: none;
    white-space: nowrap;
    z-index: 2;
  }
  .tip.right {
    transform: translateX(calc(-100% - 8px));
  }
  .tip-date {
    font-size: 11px;
    font-weight: 600;
    color: var(--ink);
    margin-bottom: 5px;
  }
  .tip-row {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11.5px;
  }
  .tip-row i {
    width: 9px;
    height: 3px;
    border-radius: 2px;
    flex: none;
  }
  .tip-nm {
    color: var(--muted);
    flex: 1;
  }
  .tip-v {
    color: var(--ink);
    font-variant-numeric: tabular-nums;
    margin-left: 10px;
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
    bottom: 4px;
    height: 24px;
  }
  .tick {
    position: absolute;
    top: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    line-height: 1.2;
    white-space: nowrap;
  }
  .tlabel {
    font-size: 9.5px;
    color: var(--muted);
    font-weight: 600;
  }
  .tsub {
    font-size: 9px;
    color: var(--faint);
    font-variant-numeric: tabular-nums;
  }
</style>
