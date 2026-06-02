# Plate

A self-hosted calorie & nutrition tracker for a small group of trusted users
(1–12, shared instance, no open signup). Installable PWA, mobile-first.

See [DESIGN.md](DESIGN.md) for the architecture.

## Features

- **Diary** — log foods per day with flexible units (grams or named servings,
  fractional amounts), grouped into user-defined meals with subtotals.
  Swipe between days; drag to reorder tiles, meals, and entries.
- **Foods** — a per-user local layer: create custom foods, or override Open
  Food Facts products (edits stay private to you).
- **Open Food Facts** — search and barcode scan (device camera); imported
  products are cached locally so the diary never depends on OFF uptime.
- **Goals** — per-nutrient daily targets in four modes (max / min / range /
  display), effective-dated so editing today never rewrites past days.
- **Trends** — overlay line chart of nutrient totals over week/month/quarter/
  year, each metric normalized to its own range so different scales compare.
- **Per-user settings** — timezone (sets the day boundary) and week start.

## Stack

- **SvelteKit** (Svelte 5, adapter-node) — one Node process
- **Drizzle ORM + SQLite** (`better-sqlite3`, WAL) — one file, easy backup
- **Better Auth** — SSO-only via Authentik (OIDC); no passwords stored here
- **Docker** — single image, SQLite on a mounted volume

## Develop

```sh
npm install
cp .env.example .env      # set BETTER_AUTH_SECRET + BETTER_AUTH_URL + OIDC_* (Authentik)
npm run dev               # migrations + seed run automatically on boot
```

Open http://localhost:5173.

- `npm run check` — type-check (svelte-check)
- `npm run db:generate` — generate a migration from schema changes
- `npm run db:migrate` — apply migrations (also runs at server startup)

Camera barcode scanning needs a secure context, so test it on a device over
HTTPS (e.g. Tailscale Serve) rather than `http://LAN-ip` — see `.env.example`.

## Authentication

Auth is **SSO-only** via a self-hosted [Authentik](https://goauthentik.io)
(OIDC), handled by [Better Auth](https://www.better-auth.com) — there is no
local email/password login. Accounts are **auto-provisioned** on first
successful SSO login, so *who* can sign in is controlled in Authentik (bind the
application to a group).

Set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and the `OIDC_*` vars, then register
`<BETTER_AUTH_URL>/api/auth/oauth2/callback/authentik` as the redirect URI in
Authentik.

## Deployment

TBD

## Layout

```
src/
  hooks.server.ts     migrate-on-boot, auth guard
  service-worker.ts   app-shell precache, network-first pages
  lib/
    server/           db (schema/migrate/seed), auth, food-sources,
                      foods·diary·goals·mealgroups·trends
    components/        UI (DiaryDay, AddEntryModal, FoodForm, charts, …)
    actions/ gestures/ drag-reorder, modal, portal
  routes/
    (app)/diary/[date]/  main view + form actions
    (app)/trends/ foods/ settings/
    login/ logout/  api/foods  api/off/{search,import,override}
```
