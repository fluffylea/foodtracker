<script lang="ts">
  let { title, sub = '' }: { title: string; sub?: string } = $props();
</script>

<header class="top">
  <div class="date-t">
    <h2>{title}</h2>
    {#if sub}<div class="sub">{sub}</div>{/if}
  </div>
</header>

<style>
  .top {
    padding: 13px var(--gutter);
    border-bottom: 1px solid var(--line);
    background: #fff;
    flex: none;
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
</style>
