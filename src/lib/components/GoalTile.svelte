<script lang="ts">
  import type { GoalMode } from '$lib/server/goals';

  let {
    name,
    unit,
    consumed,
    mode,
    targetMin,
    targetMax,
    onedit
  }: {
    name: string;
    unit: string;
    consumed: number;
    mode: GoalMode;
    targetMin: number | null;
    targetMax: number | null;
    onedit: () => void;
  } = $props();

  function fmt(v: number): string {
    return unit === 'kcal' ? Math.round(v).toLocaleString() : String(Math.round(v * 10) / 10);
  }

  const glyph = $derived(
    { maximum: 'max', minimum: 'min', range: 'range', display: 'track', none: '' }[mode]
  );

  type Bar = { fillPct: number; tone: 'accent' | 'good' | 'over'; markers: number[] };

  // Bar scales 0..threshold by default; once consumed exceeds the threshold the
  // scale grows to the actual amount and a marker shows where the threshold was.
  const bar = $derived.by((): Bar | null => {
    const c = consumed;
    if (mode === 'minimum' && targetMin !== null) {
      const min = targetMin;
      const scaleMax = (c > min ? c : min) || 1;
      return { fillPct: Math.min((c / scaleMax) * 100, 100), tone: c >= min ? 'good' : 'accent', markers: c > min ? [(min / scaleMax) * 100] : [] };
    }
    if (mode === 'maximum' && targetMax !== null) {
      const max = targetMax;
      const scaleMax = (c > max ? c : max) || 1;
      // Under/at the cap = goal satisfied (green); over = exceeded (over).
      return { fillPct: Math.min((c / scaleMax) * 100, 100), tone: c > max ? 'over' : 'good', markers: c > max ? [(max / scaleMax) * 100] : [] };
    }
    if (mode === 'range' && targetMin !== null && targetMax !== null) {
      const min = targetMin;
      const max = targetMax;
      if (c <= max) {
        const scaleMax = max || 1;
        return { fillPct: (c / scaleMax) * 100, tone: c >= min ? 'good' : 'accent', markers: [(min / scaleMax) * 100] };
      }
      const scaleMax = c || 1;
      return { fillPct: 100, tone: 'over', markers: [(min / scaleMax) * 100, (max / scaleMax) * 100] };
    }
    return null; // display / none → no bar
  });

  const sub = $derived.by(() => {
    if (mode === 'maximum') return `${fmt(consumed)} / ${fmt(targetMax ?? 0)} ${unit}`;
    if (mode === 'minimum') return `${fmt(consumed)} / ${fmt(targetMin ?? 0)} ${unit}`;
    if (mode === 'range') return `${fmt(consumed)} ${unit} · ${fmt(targetMin ?? 0)}–${fmt(targetMax ?? 0)}`;
    return `${fmt(consumed)} ${unit}`;
  });
</script>

<button class="tile" type="button" onclick={onedit}>
  <div class="nm">
    <span class="nm-name">{name}</span>
    {#if glyph}<span class="mode m-{mode}">{glyph}</span>{/if}
  </div>
  <div class="val">{sub}</div>

  {#if bar}
    <div class="bar {bar.tone}">
      <i style="width: {bar.fillPct}%"></i>
      {#each bar.markers as m}<span class="mk" style="left: {m}%"></span>{/each}
    </div>
  {/if}
</button>

<style>
  .tile {
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    text-align: left;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 11px;
    padding: 10px 11px;
    cursor: pointer;
    font: inherit;
    color: inherit;
  }
  .tile:hover {
    border-color: var(--faint);
    box-shadow: 0 2px 8px rgba(70, 60, 45, 0.06);
  }
  .nm {
    display: flex;
    align-items: center;
    gap: 5px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    font-weight: 600;
  }
  .nm-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .mode {
    flex: none;
    font-size: 8.5px;
    font-weight: 600;
    letter-spacing: 0.04em;
    padding: 1px 5px;
    border-radius: 5px;
    background: var(--fill);
    color: var(--faint);
    text-transform: lowercase;
  }
  .mode.m-maximum {
    background: #fbece2;
    color: var(--accent-ink);
  }
  .mode.m-minimum {
    background: var(--good-soft);
    color: var(--good);
  }
  .mode.m-range {
    background: #eceef0;
    color: #6b7785;
  }
  .val {
    font-size: 14px;
    font-weight: 600;
    margin: 7px 0 10px;
    font-variant-numeric: tabular-nums;
  }
  /* Pin the bar to the bottom so bars line up across tiles regardless of how
     the value text wraps. */
  .bar {
    height: 5px;
    border-radius: 4px;
    background: var(--fill);
    margin-top: auto;
    position: relative;
    overflow: visible;
  }
  .bar i {
    display: block;
    height: 100%;
    background: var(--accent);
    border-radius: 4px;
    max-width: 100%;
  }
  .bar.good i {
    background: var(--good);
  }
  .bar.over i {
    background: var(--over);
  }
  .mk {
    position: absolute;
    top: -3px;
    bottom: -3px;
    width: 2px;
    background: var(--ink);
    border-radius: 2px;
    transform: translateX(-1px);
  }
</style>
