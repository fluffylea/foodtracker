# Plate — Architecture

A self-hosted calorie & nutrition tracker for a small group of trusted users
(1–12, shared instance, no open signup). Think YAZIO / FoodNoms, deployable on
your own infra with `docker compose up`.

This document describes the app **as built**. It is kept in sync with the code;
where a decision has a rationale that isn't obvious from the source, it's noted
here.

---

## 1. Goals & non-goals

**Goals**
- Easy self-hosted deploy (single Docker image + a SQLite volume).
- Small, trusted multi-user — accounts come from an external identity provider
  (Authentik via OIDC), no passwords stored here.
- Pull nutrition data from Open Food Facts, behind a pluggable `FoodSource`.
- Per-user **local food layer**: custom foods, or per-user overrides of OFF data.
- Track consumption per day with flexible units (grams or named servings).
- Per-nutrient daily goals in four display modes, **effective-dated** so past
  days keep the goals they had.
- Browse past & future days; graph nutrients over time.
- Installable PWA that feels native on a phone (mobile-first, offline app-shell).

**Non-goals**
- Public sign-up / untrusted users at scale.
- Recipe sharing or social features (a private recipe snapshot exists; see §7).
- Native mobile apps — it's a responsive PWA.
- Body/measurement metrics (weight, body-fat). Trends covers nutrients only.

---

## 2. Stack

| Concern | Choice |
|---|---|
| Framework | **SvelteKit** (Svelte 5, runes) on `adapter-node` |
| Language | TypeScript throughout (server + client) |
| Build/dev | Vite |
| ORM / DB | **Drizzle ORM** + **SQLite** via `better-sqlite3`, single file, WAL mode |
| Auth | **Better Auth** — SSO-only against one Authentik (OIDC) provider |
| Food data | **Open Food Facts**, behind a `FoodSource` interface |
| Barcode scan | `@zxing/browser` (device camera) |
| Packaging | Single Docker image; SQLite on a mounted volume |
| PWA | Hand-written service worker (app-shell precache, network-first pages) |

Energy is stored canonically in **kcal**; kJ is a display-only conversion
(×4.184). Nutrient amounts on foods are stored **per 100 g**.

---

## 3. Authentication

Auth is owned by **Better Auth** and is **SSO-only** — there is no
email/password login in the app.

- A single `genericOAuth` provider (`providerId: 'authentik'`) is configured
  from env: `OIDC_DISCOVERY_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`. Who
  *can* sign in is governed by Authentik's application/group binding, not here.
- Accounts are **auto-provisioned** on first successful SSO login. Identity is
  the OIDC `sub` (stored on `accounts`). Better Auth requires a unique email on
  the user row; Authentik usernames may have no email, so we fall back to a
  deterministic synthetic address on a dedicated subdomain (never a real
  mailbox). Real emails are used when the provider supplies one.
- IDs are **integer auto-increment** (`generateId: 'serial'`) so every
  `users.id` foreign key (foods, diary, meal groups, goals) is a plain integer.
  Better Auth types `id` as a string; `hooks.server.ts` and `app.d.ts` coerce it
  back to `number` for the app's FK queries.
- App-managed columns live on the user row as Better Auth `additionalFields`
  (`isAdmin`, `energyUnit`, `timezone`, `weekStart`), all `input: false` — the
  app writes them directly via Drizzle, clients can't set them through auth.
- `src/lib/auth-client.ts` is the browser client (used by the login page to
  kick off the OAuth flow); `src/routes/logout/+server.ts` calls
  `auth.api.signOut`.

**Route guarding** is in `src/hooks.server.ts`:
- Runs DB migrations + seed once at startup (idempotent).
- Resolves the session per request; everything except `/login` and `/api/auth/*`
  requires a user, else redirects to `/login?redirectTo=…`.
- Routes Better Auth's own endpoints (`/api/auth/*`) to its handler **by path
  only** — not origin. Behind an HTTPS dev proxy (Tailscale Serve) SvelteKit
  sees `http` while `baseURL` is `https`, so Better Auth's origin check would
  404 every auth request; a path match is proxy-agnostic.
- Forces `content-type: text/html; charset=utf-8` on HTML responses — once the
  service worker serves pages via `respondWith`, some mobile browsers skip the
  `<meta charset>` prescan and default to Latin-1, garbling multi-byte glyphs.

---

## 4. Database schema

SQLite via Drizzle (`src/lib/server/db/schema.ts`). Conventions: ids are
autoincrement integers; a **calendar day** is TEXT `'YYYY-MM-DD'` (resolved in
the user's timezone); timestamps are unix epoch seconds; nutrient values are
per 100 g.

```
-- Better Auth tables (canonical shape, integer ids) --
users          id, name, email (unique), email_verified, image,
               is_admin, energy_unit('kcal'|'kj'), timezone, week_start(0|1),
               created_at, updated_at
sessions       id, token (unique), user_id→users, expires_at, ip, ua, …
accounts       id, user_id→users, account_id, provider_id, tokens…, password
verifications  id, identifier, value, expires_at, …

-- App tables --
nutrients          id, key (unique), name, unit, sort_order        -- global catalog
foods              id, owner_user_id→users (NULL = shared OFF cache),
                   source('off'|'local'), kind('item'|'recipe'),
                   origin_ref (OFF barcode for imports/overrides),
                   name, brand, barcode, created_at, updated_at
food_nutrients     food_id→foods, nutrient_id→nutrients, per_100g   -- PK(food_id,nutrient_id)
                                                                    -- per_100g NULL = unknown
food_units         id, food_id→foods, name, grams, is_default       -- 'g' implicit, not stored
meal_groups        id, user_id→users, name, sort_order,
                   effective_from, removed_from                     -- effective-dated existence
diary_entries      id, user_id→users, date 'YYYY-MM-DD',
                   food_id→foods (RESTRICT), amount, unit_id→food_units (NULL=g),
                   meal_group_id→meal_groups, sort_order, created_at
goals              id, user_id→users, nutrient_id→nutrients,
                   mode('maximum'|'minimum'|'range'|'display'|'none'),
                   target_min, target_max, sort_order, effective_from, created_at
```

Indexes: `foods(owner)`, `foods(origin_ref)`, `food_units(food)`,
`meal_groups(user)`, `diary_entries(user,date)`, `goals(user,nutrient,effective_from)`.

Cascades: deleting a user cascades to their foods/diary/meals/goals. A food
referenced by a diary entry is `RESTRICT` (can't orphan an entry); deleting a
`food_unit` sets the entry's `unit_id` to NULL (falls back to grams).

Migrations are generated by drizzle-kit into `./drizzle` and applied at startup
by `runMigrations()` (`src/lib/server/db/migrate.ts`), which then runs `seed()`.

---

## 5. Nutrients & computation

- The **nutrient catalog** is global and seeded (`src/lib/server/db/seed.ts`):
  energy (kcal), protein, carbohydrates, sugars, fat, saturated fat, fiber,
  salt. `key` is the stable machine id used to map external sources.
  (Salt = sodium × 2.5; we track salt per the EU label convention, not both.)
- A diary entry of `amount` in some unit resolves to grams
  (`grams = amount × unit_grams`, where the implicit `g` unit = 1), then each
  nutrient contribution is `per_100g × grams / 100` (`src/lib/server/diary.ts`).
- **Missing values**: a food may have NULL for a nutrient (genuinely unknown).
  It renders blank in the food detail; in daily/range **totals** a NULL
  contributes 0.
- `getDay(userId, date)` returns every entry with its per-nutrient contribution
  plus the day's totals, in a fixed number of queries (one for entries+joins,
  one for the per-100g nutrients of all referenced foods).

---

## 6. Goals (effective-dated)

Per user, per nutrient, a goal row carries `mode` + targets + `effective_from`
(`src/lib/server/goals.ts`).

- **Modes**: `maximum` (fill→cap, over shown red), `minimum` (greens once the
  floor is met), `range` (shaded band + markers), `display` (number only, no
  target). Mode is **derived** from which targets are present
  (`deriveMode(min, max)`); `none` is a tombstone (see below). `GoalTile.svelte`
  renders the bar/markers per mode.
- For a day *D*, the active goal for a nutrient is the latest row with
  `effective_from <= D`. Editing always writes a row effective **today**, so
  **past days keep their old goals**.
- Removing a goal inserts a `none` **tombstone** effective today — it stops the
  tile from today forward without touching history. Tiles shown for a day = the
  active non-`none` goals for that day, ordered by `sort_order`.
- `sort_order` is carried across versions so reordering tiles is independent of
  the effective-dated value. Retargeting a card (changing its nutrient)
  tombstones the old nutrient and moves the slot to the new one — done in a
  single transaction so the two writes land together or not at all.

---

## 7. Foods & the local layer

`src/lib/server/foods.ts`. A food is one of:

- **Shared OFF cache** — `owner_user_id = NULL`, `source = 'off'`, read-only.
  Created by importing an OFF product; the diary never depends on OFF uptime.
- **Local custom** — `owner_user_id = user`, `source = 'local'`,
  `origin_ref = NULL`. A from-scratch food the user created.
- **Local override** — `owner_user_id = user`, `source = 'local'`,
  `origin_ref = <barcode>`. A per-user editable clone of an OFF product; edits
  affect only that user. (The Foods tab tags these "Override" vs "Custom" by
  whether `origin_ref` is set.)

CRUD: `createFood` / `updateFood` (delete-then-rewrite nutrients + units),
`deleteFood`, all ownership-checked. `parseFoodInput` validates editor payloads
for the `/api/foods` endpoint (numbers arrive comma-tolerant from the client).
Multi-statement writes (create/update, OFF import, override clone, recipe
snapshot) run inside `db.transaction(...)` for atomicity.

**Pickers**: `listFoodsForPicker` preloads the user's local foods + the shared
OFF cache with full per-100g nutrients (for the add dialog's live scaling).
*Perf note:* fine at this scale, but the shared cache grows as OFF foods are
logged — later, bound it (recent/frequent only, or fetch nutrients on select).

**Recipes** (`kind = 'recipe'`): "Save as recipe" snapshots a meal's foods on a
day into one local food whose single `serving` unit equals the whole meal. It's
a **flattened** snapshot — it records the totals, not the source foods, so later
edits to the originals don't change it (`createRecipeFood`).

---

## 8. Open Food Facts integration

`src/lib/server/food-sources/` — `types.ts` defines the `FoodSource` interface
(`search`, `getByRef`); `openfoodfacts.ts` implements it.

- **Search** hits the dedicated search service (`search.openfoodfacts.org`); the
  legacy `cgi/search.pl` is frequently 503. A bare number query is treated as a
  **barcode** and looked up directly via the product API (`world.openfoodfacts.org`).
- All requests carry a descriptive `User-Agent` (OFF asks clients to identify
  themselves) and a 12 s timeout; failures degrade to "no data".
- OFF `nutriments` are mapped to our catalog `key`s (e.g. `energy-kcal_100g →
  energy`). Negative/non-finite values are dropped.
- **Import** (`importOffFood`) caches a product as a shared food, idempotent per
  barcode. **Override** (`createOverride`) ensures the shared cache then clones
  it into a local food owned by the user, idempotent per (user, barcode).

API routes: `POST /api/off/search`, `/api/off/import`, `/api/off/override`, and
`/api/foods` (create/update/delete local foods). All sit behind the auth guard.

---

## 9. Diary & meal groups

**Meal groups** (`src/lib/server/mealgroups.ts`) are user-defined and
**effective-dated** like goals: a meal is visible on day *D* when
`effective_from <= D < (removed_from ?? ∞)`. Every user has at least a default
backdated `Log` meal (`ensureDefaultMeal`). Removing a meal soft-sets
`removed_from = today` and **deletes that meal's entries dated today-or-later**
(past days keep the meal and its entries) — done in one transaction. The last
meal visible today can't be removed.

**Diary entries** (`src/lib/server/diary.ts`): add/update/delete are all
ownership-checked; a unit must belong to the food, the amount must be > 0, and
the meal group (if any) must be visible on that day. `updateEntry` can change
the entry's `food_id` too — "Customise" swaps an OFF product for a fresh local
copy — so the unit is validated against the new food. Drag-reorder
(`reorderEntries`) takes the full visual arrangement, writes each row's
`sort_order` and new `meal_group_id` (cross-meal moves), skips entries the user
doesn't own, and maps an unknown/foreign meal id to NULL rather than leaking
another user's group; the whole reorder commits in one transaction.

The page load (`diary/[date]/+page.server.ts`) resolves `today` in the user's
timezone, redirects `/diary/today`, and returns the day plus the catalog,
picker foods, visible goals, and meals. Mutations are SvelteKit **form
actions** on the same route (`addEntry`, `updateEntry`, `deleteEntry`,
`saveRecipe`, `reorder*`, `saveGoal`, `deleteGoal`, `createMeal`, `renameMeal`,
`removeMeal`).

---

## 10. Trends

`src/lib/server/trends.ts` + `src/lib/date.ts`.

- `rangeTotals(user, from, to)` returns dense per-day arrays aligned to every
  day in the window (one query joining entries → food nutrients → optional unit
  weight), so the chart has a continuous x-axis with gaps as 0.
- Views: **week / month / quarter / year**. `periodBounds` snaps the range to
  the period containing a reference date (respecting the user's `week_start`).
- The **year** view collapses to one point per week via `aggregateWeekly`
  (averaged over a week's *logged* days, so untracked days don't drag it down) —
  365 daily points are too noisy.
- `axisTicks` tunes x-axis labels per view (every day for week; week-starts for
  month/quarter; alternating month names for year).
- The UI (`trends/+page.svelte`, `OverlayChart`, `TrendChart`) overlays multiple
  nutrients on a shared axis, **each normalized to its own range** so
  correlations are visible. Metric chips toggle which nutrients are shown.

---

## 11. App structure & UI

```
src/
  app.css, app.html, app.d.ts        global styles, shell, Locals types
  hooks.server.ts                    migrate-on-boot, auth guard, /api/auth routing
  service-worker.ts                  app-shell precache + network-first pages
  lib/
    server/
      auth/        Better Auth instance (Authentik OIDC)
      db/          schema, drizzle client, migrate, seed
      food-sources/  FoodSource interface + openfoodfacts
      foods.ts, diary.ts, goals.ts, mealgroups.ts, trends.ts
    components/    DiaryDay, AddEntryModal, FoodForm, GoalTile, GoalModal,
                   OverlayChart, TrendChart, Pager, Sheet, ScanButton,
                   BarcodeScanner, PageHeader, Icon
    actions/       longPressDrag, modal, portal   (Svelte use: actions)
    gestures/      reorder.svelte.ts               (the drag-reorder engine)
    auth-client.ts, date.ts, number.ts, motion.ts,
    overlay.svelte.ts, pointer.svelte.ts
  routes/
    (app)/         +layout (rail + bottom bar, auth'd), +page → /diary/today
      diary/[date]/   the main day view + all its form actions
      trends/         period chart
      foods/          manage local foods & overrides
      settings/       timezone + week-start prefs
    login/, logout/
    api/foods, api/off/{search,import,override}    JSON endpoints
```

**Layout** (`(app)/+layout.svelte`): a left rail on desktop (Today · Trends ·
Foods, with account/settings + logout in the footer); a fixed bottom tab bar on
mobile (≤768px). The shell owns a single `.main` scroller and locks the document
so it can't rubber-band underneath.

**Mobile-first, gesture-driven** (most of the interesting client code):
- **Day pager** (`Pager.svelte`) renders prev/current/next panes and animates a
  swipe between days; only the centre pane is interactive (owns modals, drag,
  mutating forms). Goals/meals are editable only on **today's live pane**.
- **Drag-reorder** for goal tiles, meals, and entries (incl. cross-meal moves).
  `longPressDrag` is the gesture primitive — long-press to lift on touch (a tap
  still opens; a flick still scrolls), drag-on-move for mouse, with pointer
  capture, edge auto-scroll, and trailing-click suppression. `reorder.svelte.ts`
  layers a floating clone + drop-target math on top; the real list reorders live
  via `animate:flip`.
- **Overlays**: `modal` (focus trap, Escape-closes-top, restores focus) +
  `portal` (re-parents to `<body>` so a `position:fixed` overlay escapes the
  pager's `transform` containing block) + `overlay.svelte.ts` (a stack so only
  the top overlay reacts to Escape and a drag can't start mid-modal).
- **Barcode scanning** (`BarcodeScanner` / `ScanButton`) uses the device camera
  via `@zxing/browser`; requires a secure context (hence the HTTPS dev setup).
- `pointer.svelte.ts` / `motion.ts` branch behaviour on coarse-pointer and
  `prefers-reduced-motion`.

**Number input**: amounts/nutrients use `type="text" inputmode="decimal"` and
parse via `src/lib/number.ts`, accepting both `.` and `,` decimal separators
(a `type="number"` field rejects `,` on many non-US/UK keypads).

---

## 12. PWA & offline

`service-worker.ts` targets "app-feel", not full offline data sync:
- Versioned build assets + static files are **precached** (cache-first) so the
  installed app opens instantly.
- Pages and same-origin GETs are **network-first** with a cache fallback, so a
  flaky connection shows the last-seen screen instead of a browser error.
- POSTs (mutations) and cross-origin requests (Open Food Facts) always hit the
  network. The cache name carries the build version plus a manual epoch so a
  fix that changes cached response semantics can force a purge.

`static/manifest.webmanifest` + icons make it installable.

---

## 13. Deployment

Single Docker image (`Dockerfile`, multi-stage: build → prune dev deps → slim
runtime). SQLite lives on a mounted volume at `/data`. Migrations run
automatically on boot.

**Environment** (`.env.example`):
- `DATABASE_PATH` — SQLite file path (default `./data/plate.db`).
- `BETTER_AUTH_SECRET` — signs sessions/cookies (`openssl rand -base64 32`).
- `BETTER_AUTH_URL` — public origin (cookies + OAuth redirects); the https URL
  behind your reverse proxy in production.
- `OIDC_DISCOVERY_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET` — Authentik
  provider. Register `<BETTER_AUTH_URL>/api/auth/oauth2/callback/authentik` as
  the redirect URI.
- `PORT` — Node server port (default 3000).

**Dev over HTTPS for device testing**: camera/`getUserMedia` needs a secure
context, so plain `http://LAN-ip` won't do. Expose the dev server via Tailscale
Serve and point `BETTER_AUTH_URL` at the tailnet hostname (`vite.config.ts`
already allows `*.ts.net` hosts).

> **Note:** `docker-compose.yml` still references the pre-SSO env vars
> (`ORIGIN`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`) and should be updated to the
> `BETTER_AUTH_*` / `OIDC_*` set above.

---

## 14. Security posture

- Auth is delegated to **Better Auth + Authentik (OIDC)**: no passwords stored
  in this app, sessions are httpOnly cookies, SvelteKit provides CSRF for form
  posts. The trusted-user model (≤12 known accounts, provider-gated) is the
  intended threat model.
- Every server query is **ownership-scoped** by `user_id`; shared OFF-cache
  foods (owner NULL) are loggable by anyone but read-only.
- **Deferred hardening** (acceptable for the trusted-user model): per-IP login
  throttling lives at the Authentik layer; "log out everywhere" / token
  revocation beyond session expiry is not surfaced in-app.

---

## 15. Reserved / future

- **Recipes** beyond the flat snapshot (§7): a composer referencing component
  foods with live-recomputed nutrition. `foods.kind = 'recipe'` is already in
  use for snapshots; a `recipe_components` table would be the next step.
- **Bounding the shared OFF cache** as it grows (§7 perf note).
- **Body/measurement metrics** remain out of scope.
