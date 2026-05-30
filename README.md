# Plate

A self-hosted calorie & nutrition tracker for 1–12 trusted users.
See [DESIGN.md](DESIGN.md) for the full design and roadmap.

> **Status:** milestone 2 — auth. App shell (Today / Trends / Foods / Settings tabs),
> day navigation, and the full database schema (milestone 1) plus session-cookie login,
> a route guard, logout, and admin user management (milestone 2) are in place.
> Foods, diary, goals, OFF integration and graphs follow in later milestones.

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
