<script lang="ts">
  // Thin host: the day's UI lives in <DiaryDay>; this wires the swipe-pager.
  //
  // The centre pane is the live route data; the side panes are the prev/next
  // days, fetched with SvelteKit's `preloadData` (no bespoke API — same load the
  // route runs). A swipe (or a header arrow → pager.go) slides the neighbour to
  // centre, then we `goto` it; the data is already preloaded so the navigation
  // resolves instantly and the Pager snaps home seamlessly under the swap.
  import { preloadData, goto } from '$app/navigation';
  import Pager from '$lib/components/Pager.svelte';
  import DiaryDay from '$lib/components/DiaryDay.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();

  let pager = $state<{ go: (dir: 'prev' | 'next') => void }>();
  let prevData = $state<PageData | null>(null);
  let nextData = $state<PageData | null>(null);

  async function preload(href: string): Promise<PageData | null> {
    const r = await preloadData(href);
    return r.type === 'loaded' && r.status === 200 ? (r.data as PageData) : null;
  }

  // Refresh the neighbour panes whenever the centred day changes. The `cur`
  // guard drops a slow fetch that resolves after we've already moved on.
  $effect(() => {
    const cur = data.date;
    prevData = null;
    nextData = null;
    preload(`/diary/${data.prev}`).then((d) => cur === data.date && (prevData = d));
    preload(`/diary/${data.next}`).then((d) => cur === data.date && (nextData = d));
  });

  function commit(dir: 'prev' | 'next') {
    goto(`/diary/${dir === 'prev' ? data.prev : data.next}`, { noScroll: true, keepFocus: true });
  }
</script>

<svelte:head><title>Plate · {data.label}</title></svelte:head>

<Pager bind:this={pager} key={data.date} oncommit={commit}>
  {#snippet prev()}
    {#if prevData}<DiaryDay data={prevData} interactive={false} />{/if}
  {/snippet}
  {#snippet current()}
    <DiaryDay {data} onprev={() => pager?.go('prev')} onnext={() => pager?.go('next')} />
  {/snippet}
  {#snippet next()}
    {#if nextData}<DiaryDay data={nextData} interactive={false} />{/if}
  {/snippet}
</Pager>
