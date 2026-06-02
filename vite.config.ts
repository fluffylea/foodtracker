import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  server: {
    // Allow the dev server to answer requests proxied in by Tailscale Serve,
    // whose Host header is the machine's tailnet name (e.g. `box.tailXXXX.ts.net`).
    // A leading dot allows that domain and all subdomains. This lets a real phone
    // on the tailnet reach dev over HTTPS — required for camera/getUserMedia,
    // which only works in a secure context. Dev-only (ignored by the prod build).
    allowedHosts: ['.ts.net']
  }
});
