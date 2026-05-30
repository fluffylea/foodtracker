<script lang="ts">
  import { page } from '$app/stores';
  import { enhance } from '$app/forms';
  import PageHeader from '$lib/components/PageHeader.svelte';

  let { data, form } = $props();
  const me = $derived($page.data.user);
</script>

<svelte:head><title>Plate · Settings</title></svelte:head>

<PageHeader title="Settings" />
<div class="body">
  <section class="card block">
    <h3>Account</h3>
    <dl class="kv">
      <dt>Name</dt><dd>{me.name}</dd>
      <dt>Email</dt><dd>{me.email}</dd>
      <dt>Role</dt><dd>{me.isAdmin ? 'Admin' : 'User'}</dd>
      <dt>Energy unit</dt><dd>{me.energyUnit}</dd>
      <dt>Timezone</dt><dd>{me.timezone}</dd>
    </dl>
    <p class="hint">Editing preferences (energy unit, timezone) lands in a later milestone.</p>
  </section>

  {#if me.isAdmin}
    <section class="card block">
      <h3>Users</h3>

      {#if form?.error}
        <div class="msg err">{form.error}</div>
      {:else if form?.created}
        <div class="msg ok">Created {form.created}.</div>
      {:else if form?.deleted}
        <div class="msg ok">User removed.</div>
      {/if}

      <div class="ulist">
        {#each data.accounts as u (u.id)}
          <div class="urow">
            <span class="uname">{u.name}</span>
            <span class="uemail">{u.email}</span>
            {#if u.isAdmin}<span class="badge">admin</span>{/if}
            {#if u.id !== me.id}
              <form method="POST" action="?/deleteUser" use:enhance>
                <input type="hidden" name="id" value={u.id} />
                <button class="del" type="submit" aria-label="Delete user">Remove</button>
              </form>
            {:else}
              <span class="you">you</span>
            {/if}
          </div>
        {/each}
      </div>

      <form class="addform" method="POST" action="?/createUser" use:enhance>
        <h4>Add user</h4>
        <div class="grid">
          <label class="field">
            <span>Name</span>
            <input name="name" value={form && 'name' in form ? form.name : ''} required />
          </label>
          <label class="field">
            <span>Email</span>
            <input name="email" type="email" value={form && 'email' in form ? form.email : ''} required />
          </label>
          <label class="field">
            <span>Password</span>
            <input name="password" type="password" minlength="8" required />
          </label>
        </div>
        <label class="check">
          <input name="isAdmin" type="checkbox" />
          <span>Make this user an admin</span>
        </label>
        <button class="cta" type="submit">Create user</button>
      </form>
    </section>
  {/if}
</div>

<style>
  .body {
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
    max-width: 680px;
  }
  .block {
    padding: 16px 18px;
  }
  h3 {
    margin: 0 0 12px;
    font-size: 14px;
  }
  h4 {
    margin: 0 0 10px;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
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
  .msg {
    font-size: 12.5px;
    padding: 8px 11px;
    border-radius: 9px;
    margin-bottom: 12px;
  }
  .msg.err {
    background: #fdece5;
    border: 1px solid #f3c9b6;
    color: #b4502d;
  }
  .msg.ok {
    background: var(--good-soft);
    border: 1px solid #cfe0c4;
    color: #4d7340;
  }
  .ulist {
    border: 1px solid var(--line);
    border-radius: 10px;
    overflow: hidden;
    margin-bottom: 18px;
  }
  .urow {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    border-bottom: 1px solid var(--line2);
    font-size: 13px;
  }
  .urow:last-child {
    border-bottom: none;
  }
  .uname {
    font-weight: 500;
  }
  .uemail {
    color: var(--muted);
    font-size: 12px;
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .badge {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    background: var(--accent-soft);
    color: var(--accent-ink);
    padding: 2px 7px;
    border-radius: 6px;
  }
  .you {
    font-size: 11px;
    color: var(--faint);
  }
  .urow form {
    margin: 0;
  }
  .del {
    border: 1px solid var(--line);
    background: #fff;
    color: var(--muted);
    font-size: 12px;
    padding: 5px 10px;
    border-radius: 7px;
    cursor: pointer;
  }
  .del:hover {
    color: var(--over);
    border-color: #ecc6b8;
  }
  .grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .field span {
    font-size: 10.5px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--muted);
    font-weight: 600;
  }
  .field input {
    border: 1px solid var(--line);
    border-radius: 9px;
    padding: 8px 10px;
    font-size: 13px;
    background: #fff;
  }
  .field input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .check {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    margin: 12px 0;
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
