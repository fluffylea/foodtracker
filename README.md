# Plate

A self-hosted calorie & nutrition tracker for 1–12 trusted users.
See [DESIGN.md](DESIGN.md) for the full design and roadmap.

> **Status:** milestone 4 — diary core. Done so far: scaffold + schema (m1),
> session-cookie auth + admin user management (m2), the local-food layer with a
> named-units editor (m3), and diary logging — add/edit/remove entries with
> amount + unit, unit→grams math, and per-day nutrient totals on the Today view (m4).
> Goals, Open Food Facts integration, meal groups and graphs follow next.

## Stack

- **SvelteKit** (adapter-node) — one codebase, single Node process
- **Drizzle ORM + SQLite** (`better-sqlite3`) — one file, easy backup
- **Docker** — single image, SQLite on a mounted volume

## Develop

```sh
npm install
cp .env.example .env      # adjust ADMIN_EMAIL / ADMIN_PASSWORD
npm run dev               # migrations + seed run automatically on first request
```

Open http://localhost:5173. Migrations also run via `npm run db:migrate`, and new
schema changes are generated with `npm run db:generate`.

## Production

```sh
docker compose up -d --build
```

The app listens on `:3000` and stores its database in the `plate-data` volume
(`/data/plate.db`). On first boot it creates the admin account from
`ADMIN_EMAIL` / `ADMIN_PASSWORD`. Back up by copying `plate.db` from the volume.

## Project layout

```
src/
  lib/
    server/
      db/          schema.ts, index.ts (client), migrate.ts, seed.ts
      auth/        password.ts (scrypt) — sessions land in milestone 2
      food-sources/  (milestone 6: Open Food Facts)
    components/   shared UI
    date.ts       calendar-day helpers
  routes/
    +layout.svelte       left tab rail
    diary/[date]/        main view (day nav live)
    trends/  foods/  settings/
```
