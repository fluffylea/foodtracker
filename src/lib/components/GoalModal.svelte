<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import { fade, fly } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { modal } from '$lib/actions/modal';
  import { portal } from '$lib/actions/portal';
  import { coarsePointer } from '$lib/pointer.svelte';
  import { reducedMotion } from '$lib/motion';
  import type { Nutrient } from '$lib/server/db/schema';

  type Editing = { nutrientId: number; min: number | null; max: number | null };

  let {
    catalog,
    usedNutrientIds,
    editing = null,
    onclose
  }: {
    catalog: Nutrient[];
    usedNutrientIds: number[];
    editing?: Editing | null;
    onclose: () => void;
  } = $props();

  // Nutrients selectable here: the unused ones, plus this card's current one.
  const options = $derived(
    catalog.filter((n) => !usedNutrientIds.includes(n.id) || n.id === editing?.nutrientId)
  );

  const init = untrack(() => ({
    nutrientId: editing?.nutrientId ?? options[0]?.id ?? 0,
    min: editing?.min != null ? String(editing.min) : '',
    max: editing?.max != null ? String(editing.max) : ''
  }));

  let nutrientId = $state(init.nutrientId);
  let min = $state(init.min);
  let max = $state(init.max);

  const unit = $derived(catalog.find((n) => n.id === nutrientId)?.unit ?? '');
  const name = $derived(catalog.find((n) => n.id === nutrientId)?.name ?? '');

  // Mode derived from which fields are filled — drives the explanatory hint.
  // Coerce with a template literal: a number <input> binding can hand back a
  // number, and `.trim()` on that would throw and freeze the derived.
  const hasMin = $derived(`${min ?? ''}`.trim() !== '');
  const hasMax = $derived(`${max ?? ''}`.trim() !== '');
  const modeHint = $derived.by(() => {
    if (hasMin && hasMax) return `Range — keep ${name} between the two values.`;
    if (hasMin) return `Minimum — reach at least the target.`;
    if (hasMax) return `Maximum — stay under the cap.`;
    return `Display only — track ${name || 'it'} with no target.`;
  });

  const noneAvailable = $derived(options.length === 0);

  function onResult(result: { type: string }) {
    if (result.type === 'success') onclose();
  }

  const dur = $derived(reducedMotion() ? 0 : 240);
  const flyY = $derived(reducedMotion() ? 0 : coarsePointer() ? 300 : 12);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="backdrop" use:portal onclick={onclose} transition:fade={{ duration: dur }}>
  <div
    class="modal"
    use:modal={{ onclose }}
    onclick={(e) => e.stopPropagation()}
    transition:fly={{ y: flyY, duration: dur, easing: cubicOut }}
  >
    <div class="mhead">
      <b>{editing ? 'Edit goal' : 'Add goal'}</b>
      <button class="x" onclick={onclose} aria-label="Close">✕</button>
    </div>

    {#if noneAvailable}
      <div class="mbody">
        <p class="none">Every nutrient already has a goal. Edit or remove one instead.</p>
      </div>
    {:else}
      <form
        class="mbody"
        method="POST"
        use:enhance={() => async ({ result, update }) => {
          await update({ reset: false });
          onResult(result);
        }}
      >
        {#if editing}<input type="hidden" name="originalNutrientId" value={editing.nutrientId} />{/if}
        <input type="hidden" name="nutrientId" value={nutrientId} />

        <label class="field">
          <span>Nutrient</span>
          <select bind:value={nutrientId}>
            {#each options as n (n.id)}
              <option value={n.id}>{n.name}</option>
            {/each}
          </select>
        </label>

        <div class="row2">
          <label class="field">
            <span>Minimum <em>optional</em></span>
            <span class="ib"><input name="min" type="text" inputmode="decimal" placeholder="—" bind:value={min} /><em>{unit}</em></span>
          </label>
          <label class="field">
            <span>Maximum <em>optional</em></span>
            <span class="ib"><input name="max" type="text" inputmode="decimal" placeholder="—" bind:value={max} /><em>{unit}</em></span>
          </label>
        </div>

        <p class="hint">{modeHint}</p>

        <!-- Save first in the DOM so Enter saves, not deletes. -->
        <div class="mfoot" class:rev={editing}>
          {#if editing}
            <button type="submit" formaction="?/saveGoal" class="cta">Save</button>
            <button type="submit" formaction="?/deleteGoal" formnovalidate class="ghost danger">Delete</button>
          {:else}
            <button type="submit" formaction="?/saveGoal" class="cta">Add goal</button>
            <span></span>
          {/if}
        </div>
      </form>
    {/if}
  </div>
</div>

<style>
  .backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgba(40, 34, 28, 0.4);
    display: grid;
    place-items: center;
    padding: 24px;
  }
  .modal {
    width: 100%;
    max-width: 380px;
    background: #fff;
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(70, 60, 45, 0.22);
    overflow: hidden;
  }
  .mhead {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 16px;
    border-bottom: 1px solid var(--line);
  }
  .mhead b {
    font-size: 14px;
  }
  .x {
    border: none;
    background: transparent;
    color: var(--faint);
    cursor: pointer;
    font-size: 14px;
  }
  .mbody {
    padding: 16px;
  }
  .none {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: 12px;
  }
  .field span {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    font-weight: 600;
  }
  .field em {
    font-style: normal;
    color: var(--faint);
    text-transform: none;
    letter-spacing: 0;
    font-weight: 400;
  }
  .field select,
  .ib {
    border: 1px solid var(--line);
    border-radius: 9px;
    padding: 9px 11px;
    font-size: 14px;
    background: #fff;
  }
  .ib {
    display: flex;
    align-items: center;
    padding: 0 11px;
  }
  .ib input {
    border: none;
    outline: none;
    width: 100%;
    padding: 9px 0;
    font-size: 14px;
    background: transparent;
  }
  .ib em {
    font-style: normal;
    color: var(--faint);
    font-size: 11px;
    margin-left: 4px;
  }
  .row2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .hint {
    margin: 2px 0 0;
    font-size: 12px;
    color: var(--muted);
  }
  .mfoot {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 16px;
  }
  .mfoot.rev {
    flex-direction: row-reverse;
  }
  .ghost {
    border: 1px solid var(--line);
    background: #fff;
    color: var(--muted);
    font-size: 12.5px;
    padding: 8px 14px;
    border-radius: 9px;
    cursor: pointer;
  }
  .ghost.danger:hover {
    color: var(--over);
    border-color: #ecc6b8;
  }
  .cta {
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    font-size: 13px;
    padding: 9px 20px;
    border-radius: 9px;
    border: none;
    cursor: pointer;
  }
  .cta:hover {
    background: var(--accent-ink);
  }

  @media (max-width: 560px) {
    .backdrop {
      padding: 0;
      place-items: end stretch;
    }
    .modal {
      max-width: none;
      border-radius: 16px 16px 0 0;
    }
    .mbody {
      padding-bottom: max(16px, env(safe-area-inset-bottom));
    }
  }
</style>
