<script lang="ts">
  import { page } from '$app/stores';
  import Icon from '$lib/components/Icon.svelte';

  let { children, data } = $props();

  const tabs = [
    { id: 'today', label: 'Today', href: '/diary/today' },
    { id: 'trends', label: 'Trends', href: '/trends' },
    { id: 'foods', label: 'Foods', href: '/foods' },
    { id: 'settings', label: 'Settings', href: '/settings' }
  ];

  // Active tab from the current path: /diary/* → today, else first segment.
  const active = $derived.by(() => {
    const p = $page.url.pathname;
    if (p.startsWith('/diary')) return 'today';
    const seg = p.split('/')[1];
    return tabs.some((t) => t.id === seg) ? seg : 'today';
  });
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
    <div class="railftr">
      <span class="ava">{data.user.name.slice(0, 1).toUpperCase()}</span>
      <span class="railftr-t" title={data.user.email}>{data.user.name}</span>
      <form method="POST" action="/logout">
        <button class="logout" type="submit" title="Log out" aria-label="Log out">⏻</button>
      </form>
    </div>
  </nav>
  <main class="main">
    {@render children()}
  </main>
</div>

<style>
  .shell {
    display: flex;
    height: 100vh;
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
    gap: 8px;
    padding: 9px 6px 2px;
    border-top: 1px solid var(--line2);
  }
  .ava {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent-ink);
    flex: none;
    display: grid;
    place-items: center;
    font-size: 11px;
    font-weight: 600;
  }
  .railftr-t {
    font-size: 11.5px;
    color: var(--muted);
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
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
</style>
