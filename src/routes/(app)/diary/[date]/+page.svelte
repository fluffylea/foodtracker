<script lang="ts">
  let { data } = $props();
</script>

<svelte:head><title>Plate · {data.label}</title></svelte:head>

<header class="top">
  <div class="date">
    <a class="arw" href="/diary/{data.prev}" aria-label="Previous day">‹</a>
    <div class="date-t">
      <h2>{data.label}</h2>
      <div class="sub">{data.relative ?? data.date}</div>
    </div>
    <a class="arw" href="/diary/{data.next}" aria-label="Next day">›</a>
  </div>
  <div class="top-r">
    <button class="btn" disabled>+ Add food</button>
  </div>
</header>

<div class="body">
  <section class="placeholder card">
    <h3>Diary — milestone 1 scaffold</h3>
    <p>
      Day navigation is live (prev/next, <code>/diary/today</code> alias). Goal tiles, meals
      and the add-food flow arrive in milestones 4–6.
    </p>
  </section>
</div>

<style>
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 13px 20px;
    border-bottom: 1px solid var(--line);
    background: #fff;
    flex: none;
  }
  .date {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .arw {
    width: 28px;
    height: 28px;
    border: 1px solid var(--line);
    border-radius: 8px;
    display: grid;
    place-items: center;
    color: var(--muted);
    font-size: 15px;
  }
  .arw:hover {
    background: var(--fill);
  }
  .date-t h2 {
    font-size: 16px;
    margin: 0;
  }
  .date-t .sub {
    font-size: 11px;
    color: var(--faint);
    margin-top: 1px;
  }
  .btn {
    background: var(--accent);
    color: #fff;
    font-weight: 600;
    font-size: 13px;
    padding: 8px 14px;
    border-radius: 9px;
    border: none;
    cursor: pointer;
  }
  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .body {
    padding: 18px 20px;
  }
  .placeholder {
    padding: 18px 20px;
  }
  .placeholder h3 {
    margin: 0 0 6px;
    font-size: 15px;
  }
  .placeholder p {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
    max-width: 560px;
  }
  code {
    background: var(--fill);
    padding: 1px 5px;
    border-radius: 5px;
    font-size: 12px;
  }
</style>
