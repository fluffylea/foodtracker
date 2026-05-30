<script lang="ts">
  import { enhance } from '$app/forms';
  let { form } = $props();
</script>

<svelte:head><title>Plate · Sign in</title></svelte:head>

<div class="wrap">
  <form class="card" method="POST" use:enhance>
    <div class="brand">
      <span class="logo"></span>
      <b>Plate</b>
    </div>
    <p class="lede">Sign in to your tracker.</p>

    {#if form?.error}
      <div class="err">{form.error}</div>
    {/if}

    <label class="field">
      <span>Email</span>
      <input name="email" type="email" autocomplete="username" value={form?.email ?? ''} required />
    </label>
    <label class="field">
      <span>Password</span>
      <input name="password" type="password" autocomplete="current-password" required />
    </label>

    <button class="cta" type="submit">Sign in</button>
  </form>
</div>

<style>
  .wrap {
    min-height: 100vh;
    display: grid;
    place-items: center;
    padding: 24px;
    background: var(--bg);
  }
  .card {
    width: 100%;
    max-width: 340px;
    background: #fff;
    border: 1px solid var(--line);
    border-radius: 14px;
    padding: 26px 24px;
    box-shadow: 0 12px 40px rgba(70, 60, 45, 0.08);
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .logo {
    width: 26px;
    height: 26px;
    border-radius: 8px;
    background: var(--accent);
    box-shadow:
      inset 0 0 0 2px #fff,
      inset 0 0 0 3px var(--accent);
  }
  .brand b {
    font-size: 17px;
  }
  .lede {
    color: var(--muted);
    font-size: 13px;
    margin: 8px 0 18px;
  }
  .err {
    background: #fdece5;
    border: 1px solid #f3c9b6;
    color: #b4502d;
    font-size: 12.5px;
    padding: 8px 11px;
    border-radius: 9px;
    margin-bottom: 14px;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 5px;
    margin-bottom: 13px;
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
    padding: 9px 11px;
    font-size: 14px;
    background: #fff;
    color: var(--ink);
  }
  .field input:focus {
    outline: none;
    border-color: var(--accent);
    box-shadow: 0 0 0 3px var(--accent-soft);
  }
  .cta {
    width: 100%;
    margin-top: 4px;
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    font-size: 14px;
    padding: 11px;
    border-radius: 10px;
    border: none;
    cursor: pointer;
  }
  .cta:hover {
    background: var(--accent-ink);
  }
</style>
