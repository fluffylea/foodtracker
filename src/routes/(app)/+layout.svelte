<script lang="ts">
  import { page } from '$app/stores';
  import Icon from '$lib/components/Icon.svelte';

  let { children, data } = $props();

  // Content tabs only — account + settings live in the bottom chip.
  const tabs = [
    { id: 'today', label: 'Today', href: '/diary/today' },
    { id: 'trends', label: 'Trends', href: '/trends' },
    { id: 'foods', label: 'Foods', href: '/foods' }
  ];

  const active = $derived.by(() => {
    const p = $page.url.pathname;
    if (p.startsWith('/diary')) return 'today';
    const seg = p.split('/')[1];
    return tabs.some((t) => t.id === seg) ? seg : '';
  });
  const onSettings = $derived($page.url.pathname.startsWith('/settings'));

  // Mobile bottom bar = content tabs + the account/settings entry.
  const bottomTabs = [...tabs, { id: 'settings', label: 'Settings', href: '/settings' }];
  function tabActive(id: string) {
    return id === 'settings' ? onSettings : active === id;
  }
</script>

<div class="shell">
  <nav class="rail">
    <div class="brand">
      <span class="logo"></span>
      <b>Plate</b>
    </div>
    {#each tabs as tab (tab.id)}
      <a class="tab" class:on={active === tab.id} href={tab.href}>
        <span class="ic"><Icon name={tab.id} /></span>{tab.label}
      </a>
    {/each}
    <div class="railftr" class:on={onSettings}>
      <a class="acct-ic" href="/settings" title="Account &amp; settings" aria-label="Account &amp; settings">
        <Icon name="settings" size={18} />
      </a>
      <a class="acct-name" href="/settings" title={data.user.email}>{data.user.name}</a>
      <form method="POST" action="/logout">
        <button class="logout" type="submit" title="Log out" aria-label="Log out">⏻</button>
      </form>
    </div>
  </nav>
  <main class="main">
    {@render children()}
  </main>

  <nav class="bottombar">
    {#each bottomTabs as tab (tab.id)}
      <a class="btab" class:on={tabActive(tab.id)} href={tab.href}>
        <Icon name={tab.id} size={22} />
        <span>{tab.label}</span>
      </a>
    {/each}
  </nav>
</div>

<style>
  .shell {
    display: flex;
    height: 100vh;
    height: 100dvh;
    background: var(--panel);
  }
  .rail {
    width: var(--rail-w);
    flex: none;
    border-right: 1px solid var(--line);
    background: #fff;
    display: flex;
    flex-direction: column;
    padding: 16px 12px;
    gap: 2px;
  }
  .brand {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 4px 8px 14px;
  }
  .logo {
    width: 24px;
    height: 24px;
    border-radius: 7px;
    background: var(--accent);
    box-shadow:
      inset 0 0 0 2px #fff,
      inset 0 0 0 3px var(--accent);
  }
  .brand b {
    font-size: 15px;
    letter-spacing: -0.02em;
  }
  .tab {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 9px;
    font-size: 13px;
    color: var(--muted);
  }
  .tab .ic {
    display: inline-flex;
    flex: none;
    opacity: 0.75;
  }
  .tab.on {
    background: var(--accent-soft);
    color: var(--accent-ink);
    font-weight: 600;
  }
  .tab.on .ic {
    opacity: 1;
  }
  .tab:hover:not(.on) {
    background: var(--fill);
  }
  .railftr {
    margin-top: auto;
    display: flex;
    align-items: center;
    gap: 4px;
    padding-top: 6px;
    border-top: 1px solid var(--line2);
  }
  /* Account chip → Settings: icon left, name centred, logout right. */
  .acct-ic {
    flex: none;
    display: inline-flex;
    padding: 7px;
    border-radius: 8px;
    color: var(--muted);
    opacity: 0.8;
  }
  .acct-ic:hover {
    background: var(--fill);
    opacity: 1;
  }
  .acct-name {
    flex: 1;
    min-width: 0;
    text-align: center;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
    color: var(--muted);
    padding: 0 4px;
  }
  .acct-name:hover {
    color: var(--ink);
  }
  .railftr.on .acct-ic,
  .railftr.on .acct-name {
    color: var(--accent-ink);
    opacity: 1;
    font-weight: 600;
  }
  .railftr form {
    display: flex;
    margin: 0;
  }
  .logout {
    flex: none;
    width: 24px;
    height: 24px;
    border: 1px solid var(--line);
    border-radius: 7px;
    background: #fff;
    color: var(--muted);
    cursor: pointer;
    display: grid;
    place-items: center;
    font-size: 13px;
    line-height: 1;
  }
  .logout:hover {
    background: var(--fill);
    color: var(--over);
  }
  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    overflow: auto;
  }

  /* Mobile bottom tab bar (hidden on desktop). */
  .bottombar {
    display: none;
  }

  @media (max-width: 768px) {
    .rail {
      display: none;
    }
    .main {
      /* clear the fixed bottom bar */
      padding-bottom: calc(58px + env(safe-area-inset-bottom));
    }
    .bottombar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 40;
      display: flex;
      background: #fff;
      border-top: 1px solid var(--line);
      padding-bottom: env(safe-area-inset-bottom);
    }
    .btab {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 3px;
      padding: 9px 0 7px;
      color: var(--muted);
      font-size: 10px;
      font-weight: 600;
    }
    .btab :global(svg) {
      opacity: 0.7;
    }
    .btab.on {
      color: var(--accent-ink);
    }
    .btab.on :global(svg) {
      opacity: 1;
    }
  }
</style>
