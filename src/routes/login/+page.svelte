<script lang="ts">
  import { page } from '$app/stores';
  import { authClient } from '$lib/auth-client';

  // Only allow same-origin internal paths as post-login targets.
  function safeRedirect(target: string | null): string {
    if (target && target.startsWith('/') && !target.startsWith('//')) return target;
    return '/';
  }

  let loading = $state(false);
  // Better Auth surfaces OAuth failures as an `error` query param on return.
  let error = $derived($page.url.searchParams.get('error'));

  async function signIn() {
    loading = true;
    const { error: err } = await authClient.signIn.oauth2({
      providerId: 'authentik',
      callbackURL: safeRedirect($page.url.searchParams.get('redirectTo'))
    });
    // On success the browser is redirected to Authentik; we only land here on error.
    if (err) loading = false;
  }
</script>

<svelte:head><title>Plate · Sign in</title></svelte:head>

<div class="wrap">
  <div class="card">
    <div class="brand">
      <span class="logo"></span>
      <b>Plate</b>
    </div>
    <p class="lede">Sign in with your Authentik account.</p>

    {#if error}
      <div class="err">Sign-in failed. Please try again or contact your administrator.</div>
    {/if}

    <button class="cta" type="button" onclick={signIn} disabled={loading}>
      {loading ? 'Redirecting…' : 'Sign in with Authentik'}
    </button>
  </div>
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
  .cta:disabled {
    opacity: 0.6;
    cursor: default;
  }
</style>
