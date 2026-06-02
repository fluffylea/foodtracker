<script lang="ts">
  // A small camera button that owns the scanner overlay and reports the scanned
  // code via onScan. Shared by every barcode entry point (add-food search,
  // Foods-tab filter, the edit barcode field). Renders nothing where a camera
  // isn't available (no getUserMedia / insecure context), so callers can drop it
  // in unconditionally. Position it inside a `position: relative` field wrapper.
  import { browser } from '$app/environment';
  import BarcodeScanner from './BarcodeScanner.svelte';

  let { onScan }: { onScan: (code: string) => void } = $props();

  const canScan = browser && !!navigator.mediaDevices?.getUserMedia;
  let scanning = $state(false);
</script>

{#if canScan}
  <button class="scan-btn" type="button" onclick={() => (scanning = true)} aria-label="Scan barcode" title="Scan barcode">
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
      <path d="M3 5v14M7 5v14M11 5v14M14 5v14M18 5v14M21 5v14" stroke-width="1.6" />
    </svg>
  </button>
{/if}

{#if scanning}
  <BarcodeScanner
    onDetect={(code) => {
      scanning = false;
      onScan(code);
    }}
    onClose={() => (scanning = false)}
  />
{/if}

<style>
  .scan-btn {
    position: absolute;
    right: 7px;
    top: 50%;
    transform: translateY(-50%);
    width: 30px;
    height: 30px;
    display: grid;
    place-items: center;
    border: none;
    background: transparent;
    color: var(--muted);
    border-radius: 7px;
    cursor: pointer;
  }
  .scan-btn:hover {
    color: var(--accent-ink);
    background: var(--fill);
  }
</style>
