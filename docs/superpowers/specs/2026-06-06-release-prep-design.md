# Release Prep — Menu, UX & Perf

**Date:** 2026-06-06
**Status:** Design — awaiting review

## Goal

Bring TileWorld to a shippable 1.0 for **both web (browser/itch.io) and Tauri desktop**:
a polished cinematic main menu, difficulty selection, a real settings panel, clean
pause/end-screen flows with in-memory restart (no page reload), a bounded performance
pass, and a verified production build for both targets.

One combined spec (per user request), but built as independent units (U1–U8) so each
can land and be reviewed on its own.

## What already exists (do NOT rebuild)

The hard infrastructure is already in place — this scope is mostly UI/UX + a difficulty
store + a reset orchestrator + tuning:

- **Menu cinematic camera** — [MouseLookCamera.tsx:30-162](src/world/MouseLookCamera.tsx)
  already renders a world-anchored vista of the keep with slow azimuth sway behind
  phase `menu`. The "live orbiting backdrop" is done.
- **Shader warm-up** — [ShaderWarmup.tsx](src/world/ShaderWarmup.tsx) compiles every
  gameplay program behind the StartScreen (8 full-map frames + `gl.compile`), and
  [App.tsx:42](src/App.tsx) disables `checkShaderErrors` in prod. The startup/exploration
  shader stalls are already addressed.
- **~35 `resetX()` functions** across `src/world/*Store.ts` (playerStore, orkStore,
  waveStore, castleStore, villagerStore, inventoryStore, upgradeStore, …) — a central
  `resetRun()` just composes these.
- **End screens** — victory/defeat already render in [Objective.tsx:54-89](src/hud/Objective.tsx)
  (currently restart = `location.reload()`, defeat has no stats).
- **Quality tiers** — [qualityStore.ts](src/world/qualityStore.ts): low/medium/high,
  persisted, `G` to cycle. `dpr` pinned to 1 ([App.tsx](src/App.tsx)).
- **Game phases** — [gameStore.ts](src/world/gameStore.ts): `menu | prep | wave | victory | defeat`,
  with `defeatReason`.
- **Tauri scaffold** — [tauri.conf.json](src-tauri/tauri.conf.json) (productName, identifier,
  window 1280×800, bundle targets `all`, icons) + `@tauri-apps/cli` installed.

## Design decisions (locked)

- **Start-screen layout:** Layout B — left cinematic, full-bleed over the live world.
  Title stacked **TILE / WORLD** lower-left, menu beneath it, compact controls legend
  bottom-right. (Visual companion: `start-b-refined.html`.)
- **Backdrop:** live cinematic (already implemented); static fallback only when quality
  is `low` (skip the full menu render on weak GPUs).
- **Difficulty:** 3 presets (Easy / Normal / Hard) that scale waves only.
- **Settings (lean):** audio on/off, quality, fullscreen. **No** volume sliders, **no**
  sensitivity, **no** FOV/invert, **no** key remapping (out of scope — matches the
  minimal-HUD preference).

---

## Units

### U1 · difficultyStore

New `src/world/difficultyStore.ts`, same module-store shape as the rest.

```ts
export type Difficulty = 'easy' | 'normal' | 'hard'
export interface DiffMods { countMul: number; hpMul: number; prepMul: number }
```

| Preset | countMul | hpMul | prepMul |
|--------|----------|-------|---------|
| easy   | 0.8      | 0.85  | 1.25    |
| normal | 1.0      | 1.0   | 1.0     |
| hard   | 1.25     | 1.2   | 0.8     |

- `getDifficulty()/setDifficulty()/subscribeDifficulty()`, default `normal`, persisted to
  `localStorage` (`tileworld.difficulty`).
- `getMods()` returns the active `DiffMods`.
- **NOT** reset by `resetRun()` — it's a setting, survives restart.

**Wire-in:** wave spawning applies the mods where waves are built/scaled
([waveLogic.ts](src/world/waveLogic.ts) / [WaveDirector.tsx](src/world/WaveDirector.tsx)):
`count = round(WAVES[i].count * countMul)`, `hpScale = WAVES[i].hpScale * hpMul`.
Prep timer uses `PREP_DURATION * prepMul`. Read mods once at wave/prep start (not per
frame). Changing difficulty mid-run is impossible (only selectable on the start screen),
so no live re-scale needed.

### U2 · run reset (kill `location.reload()`)

New `src/world/runReset.ts` + a tiny `runStore.ts` (a `runId` counter + `bumpRun()` +
subscribe).

- `resetRun()` calls every `resetX()` (player, orks, waves, castle, villagers, inventory,
  resources, upgrades, city, buffs, fx, towers, ore, herb/forage, dummies, traders,
  graves, projectiles, orbs, animals, dust, impacts, hitstop, grade, voice, unlocks,
  objective, block, bridges, houseBlockers, …) — exclude `difficultyStore`,
  `qualityStore`, and audio (settings persist).
- `App.tsx` keys the scene: `<World key={runId} />` (inside `<Canvas>`). A `bumpRun()`
  remounts the whole world subtree, so mount-time seeding (initial villagers/heirs,
  castle HP, ore nodes, props) re-runs cleanly.
- **Order matters:** `resetRun()` → set phase → `bumpRun()`. Stores are clean before the
  remounted components read them.
- Two entry points:
  - **Return to Menu:** `resetRun()` → `setPhase('menu')` → `bumpRun()`.
  - **Play Again / Restart:** `resetRun()` → `bumpRun()` → `setPhase('prep')`.
- ShaderWarmup re-runs on remount; GL program cache makes it near-instant. Acceptable
  (restart already reads as a "load"). Far cheaper than a full page reload (no JS re-parse,
  no asset re-fetch).
- Pointer lock: end screens already exit it; menu has none — nothing to add.

### U3 · SettingsPanel (shared)

New `src/hud/SettingsPanel.tsx` — one overlay used by **both** the start screen and the
pause menu (single source of truth for options).

- Rows: **Audio** (On/Off, existing `audio.ts`), **Quality** (Low/Medium/High segmented,
  `qualityStore`), **Fullscreen** (toggle).
- **Fullscreen** via a small `src/world/fullscreenStore.ts` helper: `toggleFullscreen()`
  calls `document.documentElement.requestFullscreen()` / `document.exitFullscreen()`;
  tracks state from the `fullscreenchange` event; `subscribeFullscreen()`. Works in both
  the browser and the Tauri webview.
- Opened via a `settingsStore` open/close flag (ORed into `isFrozen()` like shop/tree, so
  the world holds still when settings is open during gameplay). Esc closes it (defer
  rule, same as other modals in [PauseMenu.tsx:40](src/hud/PauseMenu.tsx)).
- Styling in [hud.css](src/hud/hud.css); reuse the existing `.seg`/`.seg-btn` styles from
  the start screen quality control.

### U4 · StartScreen redesign (layout B)

Rework [StartScreen.tsx](src/hud/StartScreen.tsx) to the cinematic left-aligned layout:

- Remove the `.start-card` + `.start-bg` (the live world is the backdrop now).
- Lower-left stack: kicker "A LOW-POLY ADVENTURE", stacked **TILE / WORLD** title,
  tagline, **PLAY** (primary), **Difficulty** segmented (Easy/Normal/Hard → `setDifficulty`),
  **Settings** button (opens U3 panel).
- Controls legend: keep the existing `CONTROLS` list, restyled compact bottom-right, faint.
- `Play` → `setPhase('prep')` (unchanged). `Quit` (Tauri-only) stays, moved into Settings
  or kept as a small corner button (`IS_TAURI`).
- On `low` quality, drop a static gradient behind the menu instead of relying on the live
  render (cheap-GPU path) — a CSS `.start-static-bg` shown only when quality === 'low'.
- All new CSS in [hud.css](src/hud/hud.css).

### U5 · PauseMenu additions

Extend [PauseMenu.tsx](src/hud/PauseMenu.tsx):

- Keep **Resume**. Replace the inline audio/quality buttons with a single **Settings**
  button (opens U3). Keep the **AI paths** toggle dev-only (`import.meta.env.DEV`).
- Add **Return to Menu** (U2: `resetRun` → menu) with a confirm step ("Abandon this run?"
  — a second click / inline confirm, not a browser `confirm()`).
- Add **Quit** when `IS_TAURI`.

### U6 · End-screen polish

In [Objective.tsx](src/hud/Objective.tsx) victory/defeat blocks:

- Replace both `location.reload()` buttons with **Play Again** (U2 restart) and
  **Return to Menu** (U2 menu).
- Give **defeat** the same stat row victory has (level, gold, waves survived) plus the
  wave reached. Keep the existing reason-aware titles/copy.
- Consider extracting these into a small `EndScreen.tsx` to keep `Objective.tsx` focused
  (Objective is also the live banner) — optional refactor, only if it reads cleaner.

### U7 · Performance pass (bounded)

Per the perf memory: post-processing ≈76% of frame cost; CPU AI is cheap. dpr already 1;
shader stalls already warmed. Concrete, bounded work:

1. **Adaptive quality auto-downgrade** — new `src/world/perfStore.ts` + a sampler in a
   lightweight `useFrame` (or fold into an existing always-on one). Sample frame dt only
   during live gameplay (`phase` prep/wave, `!isFrozen()`), rolling ~3s window. If median
   FPS < ~45 on the current tier, tier ≠ `low`, and the user has **not** manually changed
   quality this session, drop **one** tier and fire a toast ("Lowered graphics for
   performance"). **One** downgrade per run, **downward only**, never auto-raise. A flag
   set when the user touches any quality control disables auto-downgrade for the session.
   The median-FPS decision is a **pure function** → unit-tested.
2. **Post-stack audit** — confirm the heaviest effects (god rays / DoF) are gated to the
   intended tiers; move any stragglers so `medium` is genuinely lighter than `high`.
   Measure with `<Perf>` before/after; record numbers in the perf memory. No new effects.
3. **Warm-up coverage audit** — verify [ShaderWarmup.tsx](src/world/ShaderWarmup.tsx)
   covers every program that appears in real play (bosses are the `berserker` variant —
   covered; structures/animals are mounted behind the menu so `gl.compile` + the full-map
   frames warm them). Add any genuinely-missed program; note ones that can't warm headless
   (drei `<Text>` materials).

### U8 · Build & ship

- **Web:** set Vite `base: './'` (relative paths) so the `dist/` build runs from any
  static host / itch.io zip. Verify `npm run build` is clean (`tsc -b` + bundle).
- **Tauri:** [tauri.conf.json](src-tauri/tauri.conf.json) is already configured; verify
  the `icons/` referenced exist, then `npm run tauri build` produces an installer. Add
  convenience scripts: `"tauri:dev": "tauri dev"`, `"tauri:build": "tauri build"`.
- Add a short **Release** section to `CLAUDE.md` (or a `RELEASE.md`) documenting both build
  commands and the itch.io zip step.
- Smoke-test both artifacts: menu → pick difficulty → play a wave → die → restart →
  return to menu → fullscreen toggle.

## Data flow

```
StartScreen ──setDifficulty──▶ difficultyStore ──getMods──▶ WaveDirector/waveLogic
StartScreen/Pause ──open──▶ settingsStore ──▶ SettingsPanel ──▶ qualityStore / audio / fullscreenStore
Pause/EndScreen ──Return/Restart──▶ resetRun() ──▶ all resetX() ; ──bumpRun()──▶ App key ──▶ World remount
gameplay frame ──dt──▶ perfStore (median) ──▶ setQuality(down one) + toast   [once, downward, unless manual]
```

All HUD ↔ world communication stays store-mediated (no props/context), matching the
codebase convention.

## Error handling / edge cases

- **Fullscreen rejected** (browser blocks without gesture): `requestFullscreen` is called
  from a click, so it's gestured; catch the promise rejection and leave state unchanged.
- **localStorage unavailable** (private mode): difficulty/quality fall back to defaults at
  runtime, same try/catch pattern as `qualityStore`.
- **Auto-downgrade thrash:** guarded by once-per-run + downward-only + manual-override flag.
- **Reset completeness:** any store missing from `resetRun()` leaks state across runs — U2
  has a unit test asserting key stores return to initial after mutate→reset.
- **Remount during warm-up:** `bumpRun()` always leaves phase consistent before remount;
  ShaderWarmup self-disables per instance, so a fresh instance re-warms safely.

## Testing

**Unit (vitest, pure logic — the project's test gate):**
- difficulty mods applied to wave count/HP/prep (extend [waveLogic.test.ts](src/world/waveLogic.test.ts)).
- `resetRun()` returns mutated stores to initial values.
- perf median-FPS downgrade decision (pure function).

**Build gate:** `npm run build` (`tsc -b`) after each unit; `npm test` after U1/U2/U7.

**Manual (`npm run dev`, browser):** menu layout B + live backdrop + low-quality static
fallback; difficulty selection; settings panel from both entry points; fullscreen;
pause → return to menu; death → play again (no page reload, clean state); victory stats;
auto-downgrade by forcing low FPS. Then `npm run build` + `npm run tauri build` smoke test.

## Out of scope (YAGNI)

Volume sliders, mouse-sensitivity slider, FOV/invert-Y, key remapping, save/load,
difficulty modifier toggles, new post-processing effects, achievements, leaderboards.

## Suggested build order

U1 (difficulty) → U2 (resetRun) → U3 (settings) → U4 (start screen) → U5 (pause) →
U6 (end screens) → U7 (perf) → U8 (ship). Each ends green on `npm run build` (+ `npm test`
where logic changed).
