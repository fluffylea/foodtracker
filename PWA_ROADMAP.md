# Plate — Mobile / PWA Roadmap

> Status: **decisions locked**, ready to build. This plan supersedes the ad-hoc
> mobile patches in commits `6bb08b9`…`0fd98e4` (swipe-day, FAB, pointer-drag,
> grips). It keeps what worked and replaces the parts that fought the platform.

---

## 1. Root cause (why the patches kept missing)

The app is **desktop-first with a hover-reveal interaction model**, and nearly
every mobile complaint is that model meeting a touchscreen:

- **Hover distinguishes "looking" from "acting"; touch has none.** So every
  surface that *reveals* an action on hover instead *fires* it on tap. On the
  Today screen that's four mutate-on-tap targets per meal: the entry row is a
  `<button>`, the meal name is an always-live `<input>`, the delete `✕` is always
  present, the goal tile is a `<button>`. No safe surface to rest a thumb on.
- **Every gesture conflict = one surface doing two jobs with no way to tell them
  apart.** The goal grip sits *inside* a button (a near-miss fires edit); the
  trends plot is one big navigate target (a scrub-to-read ends in navigation);
  reorder uses `elementFromPoint` with no drag threshold (fights scroll + text
  selection).
- **No modal discipline.** Tapping "outside" a transient control can fall through
  and *open another* overlay — the cascading-modal trap (drag meal → accidentally
  focus rename → tap away → hit a food → its modal opens → stuck).
- **Top bar is unreachable AND scrolls away** — `.top` is a normal child of the
  scrolling `.main`, not sticky.

The fix is not more one-off patches; it's a **shared touch interaction model**
the screens hang off of.

---

## 2. Decisions (locked)

| Topic | Decision |
|-------|----------|
| Reorder | **Long-press to drag.** Press-hold any tile/meal to lift + drag; a normal tap still opens it. Same surface, disambiguated by time + movement. |
| Navigation | **Floating ‹ › arrow buttons** in the thumb zone (Diary + Trends), composed with the FAB. Animated swipe pager deferred to an optional final phase (§7). |
| Edit safety | **Modal discipline** (one overlay at a time; a dismiss-tap can't open another), **deliberate rename** (no always-live input), **confirm on meal delete** (desktop + mobile). |

### Why floating buttons over swipe (engineering call)

Swipe felt clunky for a structural reason, not a tuning one: it was bolted onto
SSR-navigated `/diary/[date]` routes with no motion-synced panes, so finger and
screen were never in lockstep. Doing it right needs a different architecture —
prefetch adjacent days, render prev/current/next as client panes in a draggable
track, rubber-band + spring-snap, commit the URL only after settle. Floating
arrows are nearly free, secure, reachable, compose with long-press-drag and the
FAB, and work on Trends too (where swipe is *ruled out* because horizontal drag
is the scrub gesture). So buttons are the committed fix; the pager is §7, optional.

---

## 3. Interaction model (the foundation everything hangs off)

1. **Tap is always safe and primary** — opens or logs, never renames/deletes/
   reorders by accident.
2. **One surface, one gesture, disambiguated by intent** — tap vs long-press vs
   scrub via time + movement thresholds, not by hitting an 11px glyph.
3. **Structural/destructive actions are deliberate** — behind long-press, a `⋯`
   menu, or a confirm; never always-on.
4. **Only one overlay at a time, and dismiss can't cascade** — a tap that closes
   a menu/sheet does nothing else.
5. **Primary controls live in the thumb zone and stay put** — sticky, never
   scroll the day-switcher off.
6. **Branch on `pointer: coarse`, not width** — so a narrow desktop window
   doesn't inherit finger-sized behavior, and a tablet does.

---

## 4. Phased plan

### Phase 0 — Interaction foundations *(small; unblocks the rest)*
- **Coarse-pointer helper** (`matchMedia('(pointer: coarse)')`) so touch behavior
  keys off input type, not the `768px` width breakpoint.
- **Overlay manager** — one store that owns "which overlay is open." Enforces a
  single overlay at a time; the backdrop *absorbs* the dismiss-tap so it can't
  fall through and open another sheet/menu; focus trap; Esc / Android-back closes.
  This is the fix for the cascading-modal trap.
- **Long-press-drag utility** — pointerdown starts a ~200ms timer + records start
  point; movement past ~8px before it fires = scroll (cancel); on fire = lift
  (scale + shadow + `navigator.vibrate`), pointer capture, begin drag; auto-scroll
  near top/bottom edges; commit on release. Shared by goals + meals.
- **`touch-action` / `user-select` audit** on all chrome so drag/scrub never
  highlights text (retire the `body.reordering` hack in favor of per-surface rules).
- Make page headers **sticky** (interim, until Phase 3 moves nav to the thumb).

### Phase 1 — Long-press reorder *(challenge #1)*
- Reuse the existing **drop-indicator line + commit-on-release** logic (that part
  was good) but drive it from the Phase 0 long-press utility.
- Goals (grid) + meals (list): press-hold to lift → drag → drop indicator → commit.
  **Tap still opens** the tile/meal. Retire the `⠿` grips (or keep purely as a
  static hint).
- Files: `src/routes/(app)/diary/[date]/+page.svelte`, `GoalTile.svelte`.

### Phase 2 — Safe Today *(challenges #4 + the cascading-modal bug)*
- **Meal name → plain text by default.** Rename becomes deliberate: a `⋯` menu
  (Rename / Delete) or a clear pencil opens a single rename field. No always-live
  input you can fall into while reaching for a drag.
- **Meal delete → confirm**, desktop *and* mobile. Match `FoodEditor`'s existing
  "Click again to delete" pattern, or a small confirm sheet. Remove the bare `✕`.
- **Entry "Remove"** in the add/edit modal gets the same confirm treatment.
- All menus/sheets go through the Phase 0 overlay manager → tap-away just closes,
  never opens an entry modal underneath.
- Files: `src/routes/(app)/diary/[date]/+page.svelte`, `AddEntryModal.svelte`.

### Phase 3 — Reachable navigation *(challenge #2)*
- **Diary + Trends:** floating ‹ › arrow buttons in the thumb zone, composed with
  the FAB (shared floating-control cluster, sticky, never scroll away).
- Date label (Diary) / period label (Trends) → tap opens a picker.
- Files: both `+page.svelte` headers, `+layout.svelte` (shared cluster).

### Phase 4 — Trends touch model *(challenge #5)*
- On `pointer: coarse`: **drag = scrub-to-read** (tooltip follows finger; release
  never navigates). Opening a day = a deliberate tap (no movement) or an explicit
  "Open day ›" affordance in the tooltip.
- Bigger chip / segmented-control hit targets.
- Files: `OverlayChart.svelte`, `src/routes/(app)/trends/+page.svelte`.

### Phase 5 — Add-food / Edit-food alignment *(challenge #3)*
- Extract a shared **bottom-sheet shell** + **nutrient-grid** component so
  `AddEntryModal` (log an entry) and `FoodEditor` (edit a food) read as one
  family. *Specifics to be defined with the user when we reach this.*

### Phase 6 — Real PWA app-feel
- **Service worker** (`src/service-worker.ts`, SvelteKit auto-registers it):
  cache the app shell, network-first for data. Today the app is *installable*
  (manifest) but not offline-capable and doesn't load instantly.
- Overscroll / momentum polish (`overscroll-behavior`), safe-area audit,
  theme-color, installability/maskable-icon check.

### Phase 7 — *(Optional)* Animated swipe day-pager
- Only if floating buttons still feel like the weak point after everything above.
- Requires the prefetch + client-pane architecture described in §2 — built as an
  isolated task on the Diary only (Trends keeps buttons; its drag is the scrub).

---

## 5. Recent commits: keep / redo / drop

- **Keep:** bottom tab bar, safe-area insets, 16px inputs (no zoom), two-step
  add-food sheet, the drop-indicator line, the FAB as a base.
- **Redo:** the grip + `elementFromPoint` reorder (reuse commit-on-release, replace
  the trigger with long-press); the always-on meal `<input>` + bare `✕`.
- **Drop:** raw swipe-to-change-day (superseded by floating buttons; revisit only
  as the §7 animated pager).

---

## 6. Suggested build order

`Phase 0 → 1 → 2` first (these kill the worst daily friction and share the
foundation), then `3 → 4` (reach + trends), then `5 → 6` (polish), with `7`
optional. Each phase is independently shippable.
