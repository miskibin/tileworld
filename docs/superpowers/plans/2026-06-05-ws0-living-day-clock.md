# WS0 — Living Day Clock (Sky-as-Countdown) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** During the prep "day", make the sun sweep across the sky in proportion to how much prep time is left, so the sky itself becomes a visible countdown to the night assault (today the daytime clock is pinned to 7.2h).

**Architecture:** Add a pure `getPrepProgress()` getter to `waveStore` derived from the existing `prepSecondsLeft` countdown. In the `DayNight` per-frame driver, when the game phase is `'prep'`, set the eased day-clock target from that progress mapped onto a daytime sun arc (`T_DAWN → T_DUSK`). Wave/menu/end phases keep their current phase-driven targets. No new render objects, no new lights, no new passes.

**Tech Stack:** TypeScript, React-Three-Fiber `useFrame`, the hand-rolled module-level stores (`waveStore`, `timeStore`, `gameStore`), Vitest.

---

## Background / why the clock is frozen today

`DayNight.tsx`'s `useFrame` eases `day.t` toward `dayTarget.current`, which a
`subscribePhase` effect sets to `NIGHT_T (0.0)` during `'wave'` and `DAY_T
(=DAY_START_T=0.30=7.2h)` otherwise. It never advances within the day, so daytime
sits at golden-hour 7.2h. `advanceDay()` exists in `timeStore` but is unused.

Sun height for clock value `t` (from `timeStore.sunDirAt`): `e = sin((t-0.25)·2π)`.
- `t=0.25` sunrise (east, horizon) · `t=0.50` noon (highest) · `t=0.75` sunset
  (west, horizon) · `t=0.0/1.0` midnight (lowest).
- `t=0.30` ≈ low morning golden sun (the current frozen daytime + menu look).
- `t=0.70` ≈ low golden **west** sun, still above the horizon (`e≈0.31`).

So mapping prep progress `0→1` onto `t = 0.30→0.70` sweeps the sun morning → noon →
low golden west across the prep day, then the existing `'wave'` ease drops it to
midnight. Menu/start stay at `0.30`, so the StartScreen → first-prep transition is
seamless.

## File structure

- **Modify** `src/world/waveStore.ts` — add `getPrepProgress()` (pure getter over
  the existing `prepSecondsLeft` + `PREP_DURATION`).
- **Modify** `src/world/waveStore.test.ts` — unit tests for `getPrepProgress()`.
- **Modify** `src/world/DayNight.tsx` — import `getPhase` + `getPrepProgress`, add
  `T_DAWN`/`T_DUSK` constants, drive `dayTarget.current` from prep progress each
  frame during `'prep'`.

No other files change. `SunShadow`, `Sky`, fog, moon, and stars all already read
the same `timeStore` clock, so they follow the moving sun for free.

---

## Task 1: `getPrepProgress()` getter + tests

**Files:**
- Modify: `src/world/waveStore.ts`
- Test: `src/world/waveStore.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `src/world/waveStore.test.ts`. First extend the existing import from
`./waveStore` to include `setPrepSecondsLeft` and `getPrepProgress` (add the two
names to the existing `import { ... } from './waveStore'` block at the top):

```ts
// (add these two names to the existing waveStore import block)
//   setPrepSecondsLeft,
//   getPrepProgress,
```

Then append this describe block at the end of the file:

```ts
describe('prep progress (sky-as-countdown)', () => {
  it('is 1 after reset (no prep time set yet)', () => {
    resetWaves()
    expect(getPrepProgress()).toBe(1)
  })

  it('is 0 when the full prep duration remains', () => {
    setPrepSecondsLeft(PREP_DURATION)
    expect(getPrepProgress()).toBe(0)
  })

  it('is 0.5 at the prep midpoint', () => {
    setPrepSecondsLeft(PREP_DURATION / 2)
    expect(getPrepProgress()).toBeCloseTo(0.5, 5)
  })

  it('clamps to [0,1] for out-of-range seconds', () => {
    setPrepSecondsLeft(PREP_DURATION + 50)
    expect(getPrepProgress()).toBe(0)
    setPrepSecondsLeft(-10)
    expect(getPrepProgress()).toBe(1)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- waveStore`
Expected: FAIL — `getPrepProgress is not a function` (and `setPrepSecondsLeft` may
already be exported; the failure is on `getPrepProgress`).

- [ ] **Step 3: Implement `getPrepProgress()`**

Add to `src/world/waveStore.ts` immediately after the `getWave()` function
(around line 96):

```ts
/**
 * Sky-as-countdown progress: 0 at the start of the prep "day" (full timer left)
 * → 1 once the prep timer has run out (or the war bell skipped it). Read by the
 * DayNight driver to sweep the sun across the sky during prep, so the sky tells
 * the player how long until the night assault. Meaningful only while
 * getPhase() === 'prep'; callers gate on that.
 */
export function getPrepProgress(): number {
  const left = Math.min(PREP_DURATION, Math.max(0, state.prepSecondsLeft))
  return 1 - left / PREP_DURATION
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- waveStore`
Expected: PASS — all four new cases green, existing wave tests still green.

- [ ] **Step 5: Run the full unit suite**

Run: `npm test`
Expected: PASS — no regressions in pathfinding/factions/stores/wave tests.

- [ ] **Step 6: Commit**

```bash
git add src/world/waveStore.ts src/world/waveStore.test.ts
git commit -m "feat: getPrepProgress() for sky-as-countdown day clock"
```

---

## Task 2: Drive the prep sun from prep progress in `DayNight`

**Files:**
- Modify: `src/world/DayNight.tsx`

- [ ] **Step 1: Import `getPhase` alongside `subscribePhase`**

In `src/world/DayNight.tsx`, change the gameStore import line (currently
`import { subscribePhase } from './gameStore'`):

```ts
import { getPhase, subscribePhase } from './gameStore'
```

- [ ] **Step 2: Import `getPrepProgress`**

Add this import near the other `./` world imports at the top of `DayNight.tsx`
(e.g. just below the `gameStore` import):

```ts
import { getPrepProgress } from './waveStore'
```

- [ ] **Step 3: Add the prep sun-arc constants**

In `DayNight.tsx`, just below the existing `NIGHT_T` / `DAY_T` / `DAY_LERP_RATE`
constants (around line 43-45), add:

```ts
// Prep "day" sun arc (sky-as-countdown): the sun sweeps from morning (T_DAWN, the
// golden start) up across noon and down to a low golden west (T_DUSK, still above
// the horizon) as the prep timer runs out, so a glance at the sky tells the player
// how long until night. The 'wave' ease then drops it to NIGHT_T (midnight).
const T_DAWN = DAY_T // 0.30 — morning golden hour at prep start (= menu/start look)
const T_DUSK = 0.7 // low golden west as the timer ends (sun still up: e ≈ 0.31)
```

- [ ] **Step 4: Recompute the target from prep progress each frame during prep**

In `DayNight.tsx`'s `useFrame`, inside the existing
`if (!isFrozen() && !day.frozen) { ... }` block, add the prep-target recompute as
the FIRST statement in that block — immediately before the existing
`day.t += (dayTarget.current - day.t) * ...` line:

```ts
      // During the prep day the sun tracks how much prep time is left
      // (sky-as-countdown). Wave/menu/end targets are set on phase change by the
      // subscribePhase effect below; only prep needs a live per-frame target.
      if (getPhase() === 'prep') {
        dayTarget.current = T_DAWN + (T_DUSK - T_DAWN) * getPrepProgress()
      }
```

The surrounding block then reads:

```ts
    if (!isFrozen() && !day.frozen) {
      if (getPhase() === 'prep') {
        dayTarget.current = T_DAWN + (T_DUSK - T_DAWN) * getPrepProgress()
      }
      day.t += (dayTarget.current - day.t) * Math.min(1, dt * DAY_LERP_RATE)
      notifyAcc.current += dt
      if (notifyAcc.current >= NOTIFY_INTERVAL && Math.abs(day.t - lastNotifiedT.current) > 5e-4) {
        notifyAcc.current = 0
        lastNotifiedT.current = day.t
        notifyDay()
      }
    }
```

(The `DAY_LERP_RATE` ease smooths the 1-second steps of `prepSecondsLeft`, and
absorbs the one-frame `progress=1` blip if `'prep'` begins a frame before the
director writes `prepSecondsLeft` — `day.t` moves <2% toward target in one frame.)

- [ ] **Step 5: Typecheck + build (the correctness gate)**

Run: `npm run build`
Expected: PASS — `tsc -b` clean (no unused-import or type errors), vite bundles.

- [ ] **Step 6: Verify in-game**

Run: `npm run dev`, open the app, click through the StartScreen to begin (enters
`'prep'`). Observe over the prep timer (≈150s; scrub faster by ringing the courtyard
**war bell** with E, or watch the HUD prep countdown):
- At prep start the sun sits low in the **east** (morning golden), matching the
  StartScreen look — no jump on start.
- As the prep timer counts down, the sun **rises toward noon then descends to a low
  golden west** — smoothly, no stutter, no flicker.
- When the timer ends / the bell rings, the wave begins and night falls (sun drops
  below the horizon, stars/moon fade in) as before.
- The next day's prep dawns again from the east.

Confirm no console errors and the framerate is unchanged (this adds only two cheap
getter calls per frame; `?perf` overlay if you want to confirm).

- [ ] **Step 7: Commit**

```bash
git add src/world/DayNight.tsx
git commit -m "feat: prep sun sweeps the sky as a countdown to night"
```

---

## Self-review

- **Spec coverage (WS0):** "sun position tracks prep-time remaining" → Task 2 Step 4;
  "`getPrepProgress()` in waveStore (0→1, 1 when over/skipped)" → Task 1 Step 3;
  "`T_DAWN≈0.27..T_DUSK≈0.48`" → realized as `0.30..0.70` after recomputing the sun
  arc (the spec's example numbers were approximate; `0.30→0.70` gives the intended
  morning→noon→golden-west sweep with the sun staying above the horizon, and reuses
  `DAY_T` for a seamless menu→prep handoff); "wave keeps ease to NIGHT_T",
  "menu/victory/defeat unchanged" → preserved (only the `'prep'` branch is new);
  "war-bell skip reads as dusk" → progress jumps toward 1 → target → `T_DUSK`,
  covered by the ease; "unit-test monotonicity + clamping" → Task 1 Step 1 (0, 0.5,
  1, and clamp cases — strictly monotonic in `prepSecondsLeft`).
- **Placeholder scan:** none — every step has exact paths, real code, and concrete
  expected output.
- **Type consistency:** `getPrepProgress(): number` defined in Task 1, consumed in
  Task 2 with the same name/signature; `getPhase()` and `setPrepSecondsLeft` are
  existing exports (verified in `gameStore.ts` / `waveStore.ts`); `DAY_T`,
  `dayTarget`, `DAY_LERP_RATE`, `notifyAcc`, `lastNotifiedT`, `NOTIFY_INTERVAL` all
  already exist in `DayNight.tsx`.
- **Constraints honored:** no new render objects, lights, or full-screen passes; two
  cheap getters per frame on the hot path (no notify, no allocation).

## Remaining workstreams (separate plans, written as we reach them)

WS1 color/light grade + AgX · WS4 luminous haze · WS2 reflective water · WS3 fuller
trees (model-smith) · WS5 ground cover + grass blades · WS6 bake AO / drop N8AO ·
WS7 3 quality tiers + pause-menu selector. See
`docs/superpowers/specs/2026-06-05-visual-lifting-design.md`.
