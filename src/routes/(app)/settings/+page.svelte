<script lang="ts">
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import PageHeader from '$lib/components/PageHeader.svelte';

  const me = $derived($page.data.user);
  let prefsSaved = $state(false);
</script>

<svelte:head><title>Plate · Settings</title></svelte:head>

<PageHeader title="Settings" />
<div class="body">
  <section class="card block">
    <h3>Account</h3>
    <dl class="kv">
      <dt>Name</dt><dd>{me.name}</dd>
      <dt>Email</dt><dd>{me.email}</dd>
      <dt>Energy unit</dt><dd>{me.energyUnit}</dd>
      <dt>Timezone</dt><dd>{me.timezone}</dd>
    </dl>
    <p class="hint">Energy-unit and timezone editing land in a later milestone.</p>
    <form method="POST" action="/logout" class="logout-row">
      <button class="logout-btn" type="submit">Log out</button>
    </form>
  </section>

  <section class="card block">
    <h3>Preferences</h3>
    <form
      class="pref"
      method="POST"
      action="?/savePrefs"
      use:enhance={() => async ({ update }) => {
        await update({ reset: false });
        prefsSaved = true;
        setTimeout(() => (prefsSaved = false), 2000);
      }}
    >
      <label class="prow">
        <span>Week starts on</span>
        <select name="weekStart" value={String(me.weekStart)}>
          <option value="1">Monday</option>
          <option value="0">Sunday</option>
        </select>
      </label>
      <div class="prow-foot">
        {#if prefsSaved}<span class="saved">Saved ✓</span>{/if}
        <button class="cta" type="submit">Save</button>
      </div>
    </form>
    <p class="hint">Used for the Trends week view.</p>
  </section>
</div>

<style>
  .body {
    padding: 18px var(--gutter);
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .block {
    padding: 16px 18px;
  }
  h3 {
    margin: 0 0 12px;
    font-size: 14px;
  }
  .kv {
    display: grid;
    grid-template-columns: 110px 1fr;
    gap: 7px 12px;
    margin: 0;
    font-size: 13px;
  }
  .kv dt {
    color: var(--muted);
  }
  .kv dd {
    margin: 0;
  }
  .hint {
    margin: 14px 0 0;
    font-size: 12px;
    color: var(--faint);
  }
  .logout-row {
    margin: 14px 0 0;
  }
  .logout-btn {
    border: 1px solid var(--line);
    background: #fff;
    color: var(--muted);
    font-size: 13px;
    padding: 8px 16px;
    border-radius: 9px;
    cursor: pointer;
  }
  .logout-btn:hover {
    color: var(--over);
    border-color: #ecc6b8;
  }
  .pref {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .prow {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
  }
  .prow select {
    border: 1px solid var(--line);
    border-radius: 9px;
    padding: 8px 10px;
    font-size: 13px;
    background: #fff;
  }
  .prow-foot {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 12px;
  }
  .saved {
    font-size: 12.5px;
    color: var(--good);
    font-weight: 600;
  }
  .cta {
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    font-size: 13px;
    padding: 9px 16px;
    border-radius: 9px;
    border: none;
    cursor: pointer;
  }
  .cta:hover {
    background: var(--accent-ink);
  }
</style>
