<script lang="ts">
  // Camera barcode scanner. Lazy-loads ZXing (pure-JS → works on iOS Safari,
  // which lacks the native BarcodeDetector) only when opened. Decoding is
  // restricted to retail food formats and gated on two consecutive identical
  // reads, so a one-frame misread can't fire a false positive while staying
  // instant. Full-screen on touch; a centred windowed panel on desktop. Reports
  // the code via onDetect and tears the camera down on close / detect / unmount.
  import { onMount } from 'svelte';
  import { portal } from '$lib/actions/portal';

  let { onDetect, onClose }: { onDetect: (code: string) => void; onClose: () => void } = $props();

  let video = $state<HTMLVideoElement>();
  let error = $state<string | null>(null);
  // Mirror a front/user-facing camera so movement feels natural on desktop. The
  // decoder reads the raw frame (drawImage from the video's intrinsic pixels),
  // which a CSS transform doesn't touch — so mirroring the preview is display-only
  // and never affects what ZXing sees.
  let mirrored = $state(false);
  let controls: { stop: () => void } | null = null;
  let done = false; // resolve exactly once

  function cleanup() {
    try {
      controls?.stop();
    } catch {
      /* already stopped */
    }
    controls = null;
  }
  function close() {
    cleanup();
    onClose();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  onMount(() => {
    let cancelled = false;
    (async () => {
      try {
        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        const { DecodeHintType, BarcodeFormat } = await import('@zxing/library');
        const hints = new Map();
        hints.set(DecodeHintType.POSSIBLE_FORMATS, [
          BarcodeFormat.EAN_13,
          BarcodeFormat.UPC_A,
          BarcodeFormat.UPC_E,
          BarcodeFormat.EAN_8
        ]);
        const reader = new BrowserMultiFormatReader(hints);
        if (cancelled || !video) return;

        let last = '';
        let streak = 0;
        controls = await reader.decodeFromConstraints(
          // Ask for a higher-res rear stream — small/distant barcodes need the
          // resolution to resolve the bars.
          { video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } },
          video,
          (result) => {
            if (done || !result) return; // per-frame "not found" errors are ignored
            const text = result.getText();
            if (text === last) streak++;
            else {
              last = text;
              streak = 1;
            }
            if (streak >= 2) {
              done = true;
              navigator.vibrate?.(30);
              cleanup();
              onDetect(text);
            }
          }
        );
        if (cancelled) {
          cleanup();
          return;
        }
        // Mirror unless we got a confirmed rear ('environment') camera.
        const fm = (video.srcObject as MediaStream | null)?.getVideoTracks()[0]?.getSettings().facingMode;
        mirrored = fm !== 'environment';
      } catch (e) {
        const name = (e as { name?: string })?.name;
        error =
          name === 'NotAllowedError'
            ? 'Camera permission denied.'
            : name === 'NotFoundError'
              ? 'No camera found.'
              : 'Camera unavailable. (On a phone this needs HTTPS.)';
      }
    })();

    window.addEventListener('keydown', onKey);
    return () => {
      cancelled = true;
      window.removeEventListener('keydown', onKey);
      cleanup();
    };
  });
</script>

<div class="scanner" use:portal>
  <div class="panel">
    <!-- svelte-ignore a11y_media_has_caption -->
    <video bind:this={video} class:mirrored playsinline muted autoplay></video>

    <div class="overlay">
      <div class="reticle"><span class="laser"></span></div>
      <p class="hint">{error ?? 'Fill the box with the barcode — get close'}</p>
    </div>

    <button class="close" type="button" onclick={close} aria-label="Close scanner">✕</button>
  </div>
</div>

<style>
  .scanner {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: #000;
    display: flex;
  }
  .panel {
    position: relative;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  video {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  video.mirrored {
    transform: scaleX(-1);
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    pointer-events: none;
  }
  /* Big target: a small barcode inside a small box doesn't carry enough pixels
     to decode, so the reticle fills most of the frame to coax the user closer. */
  .reticle {
    width: 84%;
    height: 52%;
    border: 2px solid rgba(255, 255, 255, 0.9);
    border-radius: 14px;
    box-shadow: 0 0 0 100vmax rgba(0, 0, 0, 0.45);
    position: relative;
    overflow: hidden;
  }
  .laser {
    position: absolute;
    left: 0;
    right: 0;
    height: 2px;
    background: var(--accent);
    box-shadow: 0 0 8px var(--accent);
    animation: sweep 1.8s ease-in-out infinite;
  }
  @keyframes sweep {
    0%,
    100% {
      top: 8%;
    }
    50% {
      top: 92%;
    }
  }
  .hint {
    margin: 0;
    color: #fff;
    font-size: 14px;
    font-weight: 600;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
    text-align: center;
    padding: 0 24px;
  }
  .close {
    position: absolute;
    top: calc(12px + env(safe-area-inset-top));
    right: 14px;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: none;
    background: rgba(0, 0, 0, 0.5);
    color: #fff;
    font-size: 16px;
    cursor: pointer;
    display: grid;
    place-items: center;
  }

  /* Desktop: a centred windowed overlay rather than an edge-to-edge takeover. */
  @media (min-width: 700px) and (pointer: fine) {
    .scanner {
      background: rgba(20, 16, 12, 0.55);
      align-items: center;
      justify-content: center;
    }
    .panel {
      width: min(560px, 92vw);
      height: min(440px, 80vh);
      border-radius: 16px;
      box-shadow: 0 24px 60px rgba(0, 0, 0, 0.4);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .laser {
      animation: none;
      top: 50%;
    }
  }
</style>
