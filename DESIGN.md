# FoodTracker ("Plate") — Design Draft

A self-hosted calorie & nutrition tracking app for 1–12 trusted users.
Think YAZIO / FoodNoms, but deployable on your own infra.

> Working name: **Plate** (from the wireframes). Status: **decisions locked (v0.3)** —
> remaining open items marked ❓. Wireframes live in `FoodTracker Wireframes.html`
> (+ `wire.jsx`, `screens1.jsx`, `screens2.jsx`).

---

## 1. Goals & Non-Goals

**Goals**
- Easy self-hosted deploy (`docker compose up`).
- Small, trusted multi-user (1–12 people, shared instance, no open signup).
- Pull nutrition data from open databases (Open Food Facts first).
- Per-user **local food layer**: create custom foods, or override data from open DBs.
- Track consumption per day with flexible units (grams / named servings).
- Per-nutrient daily goals with 4 modes, **snapshotted per day** (effective-dated).
- Browse past & future days.
- Graphs over time.

**Non-Goals (for now)**
- Public sign-up / untrusted users at scale.
- Recipe sharing, social features.
- Native mobile apps (responsive web first).

---

## 2. Decisions (from kickoff)

| Topic | Decision |
|-------|----------|
| Stack | **Full-stack TypeScript: SvelteKit** (adapter-node) |
| ORM / DB | **Drizzle ORM + SQLite** (`better-sqlite3`), single file |
| Food source | **Open Food Facts** first, behind a pluggable `FoodSource` interface |
| Food edits vs history | **Live compute** — entries reference food + amount + unit, recomputed on read. (Snapshotting can be added later if retroactive edits become a problem.) |
| Meals | **User-defined meal groups** (not hardcoded). Entry has optional `meal_group_id`; none = flat list. |
| Goals | **Effective-dated versioning** (see §4). |
| Energy unit | **Per-user setting**, defaults to **kcal** (kJ optional). Display-only conversion; storage stays canonical. |
| Missing nutrients | Stored as **NULL/empty** on the food (not 0) → shown blank in food detail. In daily **totals**, a missing value contributes **0**. |
| Count units | No separate concept — handled by **named units** (e.g. `large = 65 g`, `small = 50 g`). Amount can be fractional: `1.5 × large`. |
| Timezone | **Per-user setting**, defaults to browser/server local. Determines the "day" boundary. |
| Food privacy | Local foods **fully private per user** for now (no cross-user sharing). |
| Auth | Admin-provisioned accounts, password + session cookie. No open signup. |
| Deploy | Single Docker image, SQLite volume mounted for persistence. |

---

## 3. Nutrients & computation

- Global **nutrient catalog** (admin-editable). Seed: energy (kcal), protein, carbs,
  sugars, fat, saturates, fiber, sodium, salt. Each: `key`, `name`, `unit`.
- Canonical storage: nutrient amounts **per 100 g** of food.
- A diary entry of `amount` in `unit`:
  1. resolve `unit → grams` (`g` = 1; named unit = its gram weight).
  2. `grams = amount × unit_grams`.
  3. `nutrient = per100g × grams / 100`.
- **Missing values**: a food may have NULL for a nutrient (genuinely unknown). The food
  detail shows it blank; daily totals treat a NULL contribution as 0. (So a tile total
  is "sum of known values" — we may flag "incomplete" if any contributing food was NULL.)
- **Energy display**: stored in kcal canonically; kJ is a display conversion (×4.184).

---

## 4. Goals (effective-dated)

- Per `user_id`, per `nutrient`. A goal row carries `mode` + targets + `effective_from`.
- `mode`: `maximum` | `minimum` | `range` | `display` (display = tile, no target).
- For day *D*, the active goal for a nutrient = latest row with `effective_from <= D`.
- Editing goals "today" inserts **new rows** with `effective_from = today` for changed
  nutrients → past days keep their old goals. ✅
- Tiles shown for a day = the set of nutrients that have an active goal row for that day.

---

## 5. Database schema (Drizzle / SQLite)

```
users
  id, email (unique), name, password_hash, is_admin, created_at

sessions
  id (token), user_id, expires_at

nutrients                         -- global catalog
  id, key (unique), name, unit, sort_order

foods
  id, owner_user_id (NULL = shared external cache),
  source ('off' | 'local'),
  origin_ref (NULL | OFF barcode/id),   -- set for imports & overrides
  name, brand, barcode, created_at, updated_at
  -- override = source 'local' + origin_ref pointing at an OFF product

food_nutrients
  food_id, nutrient_id, per_100g          -- PK (food_id, nutrient_id)

food_units                                -- 'g' is implicit, not stored
  id, food_id, name, grams, is_default      -- count units are just named units
                                            -- ('large'=65g); amount may be fractional

meal_groups                               -- user-defined
  id, user_id, name, sort_order

diary_entries
  id, user_id, date (YYYY-MM-DD), food_id,
  amount, unit_id (NULL = grams), meal_group_id (NULL),
  sort_order, created_at

goals
  id, user_id, nutrient_id, mode,
  target_min, target_max,                 -- semantics depend on mode
  effective_from (date), created_at
```

---

## 6. App structure (SvelteKit)

```
src/
  lib/
    server/
      db/            schema.ts, migrations, client (drizzle + better-sqlite3)
      auth/          sessions, password hashing
      food-sources/  index.ts (FoodSource interface), openfoodfacts.ts
      nutrition.ts   unit→grams, per-entry & per-day aggregation
    components/      GoalTile, ProgressBar, DiaryEntry, charts, ...
    stores/          client state (selected day, etc.)
  routes/
    (app)/
      +layout.svelte         left tab bar, auth guard
      diary/[date]/          main view
      graphs/
      foods/                 manage local foods & overrides
      settings/              nutrients, goals, meal groups, account
    api/ or +server.ts       JSON endpoints (or use form actions / load fns)
    login/
```

UI tabs (left bar): **Diary · Graphs · Foods · Settings**.

Diary view: day selector (prev/next/pick) → goal tiles (name, consumed vs goal,
progress bar, mode-aware color) → entries (grouped by meal group if any, else flat) →
add-food flow (search OFF + local, pick amount + unit).

---

## 7. Open Food Facts integration

- `FoodSource` interface: `search(query)`, `getByRef(ref)`.
- Search hits OFF API live; on add/import we **cache** the product as a shared food
  (`owner_user_id = NULL`, `source = 'off'`, `origin_ref = barcode`) so the diary never
  depends on OFF uptime.
- "Customize"/override: clone the cached food into a local food owned by the user
  (`source = 'local'`, `origin_ref` preserved); edits affect only that user.
- Map OFF `nutriments` → our nutrient catalog by key.

---

## 8. Build roadmap (milestones)

1. **Scaffold** — SvelteKit + Drizzle + SQLite, Docker, base layout + tab bar.
2. **Auth** — admin-provisioned users, login, session guard, seed admin via env.
3. **Nutrients + Foods (local)** — catalog seed, local food CRUD with units.
4. **Diary core** — entries, unit→grams math, per-day nutrient totals, day navigation.
5. **Goals** — effective-dated goals, goal tiles with the 4 modes.
6. **OFF integration** — search, import-with-cache, override flow.
7. **Meal groups** — user-defined groups, grouped diary UI.
8. **Graphs** — per-nutrient-over-time endpoint + overlay chart UI (Trends direction A).
9. **Settings polish + deploy** — compose file, volume, backup notes.
10. **Recipes** *(later)* — `foods.kind = 'recipe'` + component composer, derived nutrition.

---

## 9. UI directions (from wireframes)

Brand: **Plate**. Left rail tabs: **Today · Trends · Foods · Settings**. Warm-white cards,
soft grey strokes, orange accent. Chosen directions:

- **Today (daily tracker)** → **Direction A — "Dashboard"**: goal tiles on top (4-up grid),
  user-defined meals listed below, prev/next day in the header. (`DailyA`)
- **Add food (desktop)** → **Direction B — "Modal two-pane"**: search/results on the left,
  amount + unit picker + scaled nutrition + meal selector on the right. (`AddModal`)
  - Mobile uses the slide-over flow (`MobileAdd`).
- **Trends (graphs)** → **Direction A — "Overlay"** *(not nailed down)*: metric chips on top,
  one shared-axis chart overlaying all active metrics, normalized (% of goal / z-score / raw)
  so correlations are visible. (`GraphsA`) — Direction B (left control panel) still on the table.
- **Goal tiles**: four modes rendered as max (fill→cap, red over), min (greens up to floor),
  range (shaded band + marker), display (number + sparkline). (`GoalModes`)

## 10. Resolved & new open questions

**Resolved** (see decisions table §2): energy unit (kcal default, setting), missing-data
semantics (NULL on food, 0 in totals), count units (= named units), timezone (per-user
setting), cross-user sharing (none for now).

**Recipes → deferred, schema reserved.** A recipe is a food built from other foods to save
commonly-made meals. Decision: **reserve `foods.kind` now, build later** (milestone 9+),
keep it minimal.
```
foods.kind        'item' | 'recipe'        -- default 'item'
recipe_components  id, recipe_food_id, component_food_id, amount, unit_id   -- added later
```
Recipe nutrition = sum of components, recomputed live, with optional per-serving yield.

**Body/measurement metrics → out of scope for now.** Trends tracks **nutrients only**; the
"Weight" line in the wireframe is dropped. (Revisit if we want weight/body-fat logging later.)

**Still open ❓**
- **Graphs direction** — A (chips + overlay) vs B (left control panel). Leaning A; not final.
- **Trends normalization toggle** — % of goal / z-score / raw — keep all three or simplify?
