<script lang="ts">
  import PageHeader from '$lib/components/PageHeader.svelte';
</script>

<svelte:head><title>Plate · Foods</title></svelte:head>

<PageHeader title="My foods" sub="local layer · overrides the open databases" />
<div class="body">
  <section class="card ph">
    <h3>Foods — milestone 3</h3>
    <p>Custom foods &amp; overrides with the named-units editor. Recipes come later (§10).</p>
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
