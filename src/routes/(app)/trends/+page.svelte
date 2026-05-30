<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
</script>

<svelte:head><title>Plate · Trends</title></svelte:head>

<PageHeader title="Trends" />
<div class="body">
  <section class="card ph">
    <h3>Trends — milestone 8</h3>
    <p>Overlay chart of active nutrient metrics on a shared time axis (Trends direction A).</p>
  </section>
</div>

<style>
  .body {
    padding: 18px 20px;
  }
  .ph {
    padding: 18px 20px;
  }
  .ph h3 {
    margin: 0 0 6px;
    font-size: 15px;
  }
  .ph p {
    margin: 0;
    color: var(--muted);
    font-size: 13px;
    max-width: 560px;
  }
</style>
