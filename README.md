# Plate

A self-hosted calorie & nutrition tracker for 1–12 trusted users.
See [DESIGN.md](DESIGN.md) for the full design and roadmap.

> **Status:** milestone 6 — Open Food Facts. Done so far: scaffold + schema (m1),
> session-cookie auth + admin user management (m2), the local-food layer with a
> named-units editor (m3), diary logging with unit→grams math and per-day totals (m4),
> effective-dated goals with per-card editing (m5), Open Food Facts search +
> import-to-shared-cache + per-user "customize" overrides (m6), and user-defined
> effective-dated meal groups — the diary log shows entries under lightweight
> per-meal sections with subtotals; meals are added/removed effective today (past
> days keep theirs, like goals), with a default "Log" bucket and today-only
> management (m7), and a Trends view — an overlay line chart of nutrient totals
> over calendar-snapped periods (week/month/quarter/year) with prev/next
> navigation, a hover cursor + per-metric tooltip, and toggleable metric chips,
> each normalized to its own range so different scales overlay (m8). A per-user
> week-start setting (Sun/Mon) lives in Settings.

## Stack

- **SvelteKit** (adapter-node) — one codebase, single Node process
- **Drizzle ORM + SQLite** (`better-sqlite3`) — one file, easy backup
- **Docker** — single image, SQLite on a mounted volume

## Develop

```sh
npm install
cp .env.example .env      # set BETTER_AUTH_SECRET + OIDC_* (Authentik)
npm run dev               # migrations + seed run automatically on first request
```

Open http://localhost:5173. Migrations also run via `npm run db:migrate`, and new
schema changes are generated with `npm run db:generate`.

## Authentication

Auth is **SSO-only** via a self-hosted [Authentik](https://goauthentik.io) (OIDC),
handled by [Better Auth](https://www.better-auth.com). There is no local
email/password login. Accounts are **auto-provisioned** on first successful SSO
login, so *who* can sign in is controlled in Authentik (bind the application to a
group). Configure `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and the `OIDC_*` vars,
and register `<BETTER_AUTH_URL>/api/auth/oauth2/callback/authentik` as the redirect
URI in Authentik. (Admin/user-management is deferred — every account is a plain
user for now.)

## Production

```sh
docker compose up -d --build
```

The app listens on `:3000` and stores its database in the `plate-data` volume
(`/data/plate.db`). Set `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` (the public https
origin), and the `OIDC_*` vars in the environment. Back up by copying `plate.db`
from the volume.

## Project layout

```
src/
  lib/
    server/
      db/          schema.ts, index.ts (client), migrate.ts, seed.ts
      auth/        index.ts — Better Auth (Authentik OIDC, SSO-only)
      food-sources/  (milestone 6: Open Food Facts)
    components/   shared UI
    date.ts       calendar-day helpers
  routes/
    +layout.svelte       left tab rail
    diary/[date]/        main view (day nav live)
    trends/  foods/  settings/
```
