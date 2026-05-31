# Wave-Survival Defense Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Verification model (read first):** This repo has **no test runner**. Per `CLAUDE.md`, the correctness gate is `npm run build` (`tsc -b` typechecks all three tsconfigs, then bundles) and `npm run lint`. "Observe" means `npm run dev` + look in the browser. Every task verifies with `npm run build && npm run lint`; visual tasks add an observe note. Do **not** write unit tests — there is no harness for them.

**Goal:** Turn the sandbox into a wave-survival defense game: escalating ork waves march on the castle keep; the player + auto-firing towers + villager town-guards defend it; survive all waves → Victory, keep HP → 0 → Defeat.

**Architecture:** Add a `gameStore` phase machine (`menu→prep→wave→victory|defeat`), a `castleStore` (keep HP, fail trigger), and a `waveStore` + `WaveDirector` (one `useFrame`) that spawns orks over time from a ring around the keep. Extend the existing per-entity `Ork` AI with a "march on the castle" fallback target. Reuse the existing homing-bolt system for tower fire and the existing villager town-guard AI for the militia. HUD (`Objective.tsx`) is reworked into a wave/castle-HP/defeat panel. All state uses the project's hand-rolled module-level store pattern (no state lib).

**Tech Stack:** React 19 + @react-three/fiber + three.js + TypeScript + Vite. No tests; `tsc -b` + eslint are the gates.

**Spec:** `docs/superpowers/specs/2026-05-31-wave-survival-defense-design.md`

---

## File Structure

**New files:**
- `src/world/castleStore.ts` — keep HP store; `damageCastle` triggers defeat.
- `src/world/waveStore.ts` — wave table + per-wave progress state.
- `src/world/WaveDirector.tsx` — the spawn/advance `useFrame`; mounted in World's grid group.
- `src/world/Towers.tsx` — auto-fire `useFrame` over `TOWER_SLOTS` when towers built.

**Modified files:**
- `src/world/gameStore.ts` — `started:boolean` → `GamePhase` enum + pub/sub.
- `src/world/orkStore.ts` — roster `subscribe`/`notify`; `createOrk` notifies; add `reapOrk(id)`; add `WAVE_FACTION` helper.
- `src/world/Mobs.tsx` — subscribe to the ork roster, render dynamically.
- `src/world/Ork.tsx` — castle fallback target + `damageCastle` on hit; `reapOrk` when death-fade completes.
- `src/world/World.tsx` — drop the 4 static `<OrkCamp>` enemy spawners; mount `<WaveDirector/>` + `<Towers/>`.
- `src/world/Villager.tsx` — widen guard engagement during `wave` phase.
- `src/hud/Objective.tsx` — wave HUD + castle-HP bar + Defeat screen; drive win/lose from phase.
- `src/hud/StartScreen.tsx` — "Play" → `setPhase('prep')`.
- `src/hud/PauseMenu.tsx` — migrate any `isStarted`/`startGame` usage to phase API.
- `src/world/Character.tsx`, `src/hud/PlayerHud.tsx` — migrate `isStarted` callers.
- `src/hud/hud.css` — castle-HP bar + defeat-screen styles.

**Dependency order:** stores first (Tasks 1–3), then consumers (4–8), then defenders (9–10), then HUD (11), then integration sweep (12).

---

## Task 1: Game-phase state machine

Replace the boolean in `gameStore.ts` with a phase enum. Keep `pauseStore.isFrozen()` as the only freeze chokepoint by toggling `setPaused` on transitions.

**Files:**
- Modify: `src/world/gameStore.ts` (full rewrite)
- Reference: `src/world/pauseStore.ts` (for `setPaused`)

- [ ] **Step 1: Rewrite `gameStore.ts`**

```ts
import { setPaused } from './pauseStore'

// The game's top-level phase. The world boots in 'menu' (paused behind the
// StartScreen). 'prep' is the between-wave breather (world live, shop allowed);
// 'wave' is an active assault; 'victory'/'defeat' are end states.
export type GamePhase = 'menu' | 'prep' | 'wave' | 'victory' | 'defeat'

let phase: GamePhase = 'menu'
const subs = new Set<(p: GamePhase) => void>()

export function getPhase(): GamePhase {
  return phase
}

export function setPhase(p: GamePhase): void {
  if (phase === p) return
  phase = p
  // The world freezes behind the menu and the end screens; it runs during
  // prep + wave. This keeps every `if (isFrozen()) return` gate untouched.
  setPaused(p === 'menu' || p === 'victory' || p === 'defeat')
  subs.forEach((fn) => fn(phase))
}

export function subscribePhase(fn: (p: GamePhase) => void): () => void {
  subs.add(fn)
  fn(phase)
  return () => {
    subs.delete(fn)
  }
}

// Back-compat helper for existing call sites that only asked "has the game
// started?" — true once we've left the menu.
export function isStarted(): boolean {
  return phase !== 'menu'
}
```

- [ ] **Step 2: Find old call sites**

Run: `rg "startGame|subscribeStarted|from './gameStore'|from '../world/gameStore'" src`
Expected: hits in `StartScreen.tsx`, `PauseMenu.tsx`, `Character.tsx`, `PlayerHud.tsx`. `isStarted` is preserved above; `startGame`/`subscribeStarted` are removed and handled in Tasks 11. For THIS task, only ensure nothing imports the now-removed `startGame`/`subscribeStarted` yet — if `npm run build` fails on those, leave them for Task 11 but note them.

- [ ] **Step 3: Verify**

Run: `npm run build`
Expected: PASS, OR failures only of the form "`startGame` is not exported" in `StartScreen.tsx`/`PauseMenu.tsx` (fixed in Task 11). If other errors appear, fix them. Then `npm run lint` (0 errors).

- [ ] **Step 4: Commit**

```bash
git add src/world/gameStore.ts
git commit -m "feat: game phase machine (menu/prep/wave/victory/defeat)"
```

---

## Task 2: Castle keep HP store

**Files:**
- Create: `src/world/castleStore.ts`
- Reference: `src/world/cityPlan.ts` (`CITY_CENTER`), `src/world/gameStore.ts`

- [ ] **Step 1: Create `castleStore.ts`**

```ts
import { CITY_CENTER } from './cityPlan'
import { setPhase, getPhase } from './gameStore'
import { addShake } from './fxStore'

// The keep is the thing you defend. Orks march to CASTLE_CORE and chip its HP;
// at 0 the run is lost. Hand-rolled store, same shape as playerStore.
export const CASTLE_CORE = { x: CITY_CENTER.x, z: CITY_CENTER.z } as const
export const CASTLE_MAX_HP = 500

export interface CastleState {
  hp: number
  maxHp: number
}

const state: CastleState = { hp: CASTLE_MAX_HP, maxHp: CASTLE_MAX_HP }
const subs = new Set<(s: CastleState) => void>()

function notify(): void {
  subs.forEach((fn) => fn(state))
}

export function getCastle(): CastleState {
  return state
}

export function damageCastle(amount: number): void {
  if (state.hp <= 0) return
  state.hp = Math.max(0, state.hp - amount)
  addShake(0.25, 0.3)
  notify()
  if (state.hp <= 0 && getPhase() === 'wave') setPhase('defeat')
}

export function resetCastle(): void {
  state.hp = state.maxHp
  notify()
}

export function subscribeCastle(fn: (s: CastleState) => void): () => void {
  subs.add(fn)
  fn(state)
  return () => {
    subs.delete(fn)
  }
}
```

- [ ] **Step 2: Verify** — `npm run build && npm run lint`. Expected PASS (confirm `addShake` is exported from `fxStore.ts`; if its name differs, adjust the import).

- [ ] **Step 3: Commit**

```bash
git add src/world/castleStore.ts
git commit -m "feat: castle keep HP store + defeat trigger"
```

---

## Task 3: Ork roster pub/sub + reap + wave faction

`Mobs` must re-render as waves add orks, and dead orks must be removed so the array doesn't grow across 8 waves.

**Files:**
- Modify: `src/world/orkStore.ts`

- [ ] **Step 1: Add subscribe/notify to `orkStore.ts`**

Add near the top, after `let nextId = 0`:

```ts
const rosterSubs = new Set<(list: OrkState[]) => void>()

/** Notified whenever an ork is added or reaped, so Mobs re-renders the list. */
export function subscribeOrks(fn: (list: OrkState[]) => void): () => void {
  rosterSubs.add(fn)
  fn(orks)
  return () => {
    rosterSubs.delete(fn)
  }
}

function notifyRoster(): void {
  rosterSubs.forEach((fn) => fn(orks))
}
```

- [ ] **Step 2: Make `createOrk` and `resetOrks` notify; add `reapOrk`**

In `createOrk`, replace the final `orks.push(o); return o` with:

```ts
  orks.push(o)
  notifyRoster()
  return o
```

In `resetOrks`, after `nextId = 0` add `notifyRoster()`.

Add a reap function:

```ts
/** Remove a dead ork from the roster (called once its death-fade finishes). */
export function reapOrk(id: number): void {
  const i = orks.findIndex((o) => o.id === id)
  if (i === -1) return
  orks.splice(i, 1)
  notifyRoster()
}
```

- [ ] **Step 3: Add the wave faction constant**

Append:

```ts
import type { OrkFaction } from './factions'
// All wave invaders share one warband so they never brawl each other and all
// march on the keep together.
export const WAVE_FACTION: OrkFaction = 'red'
```

(If `OrkFaction` is already imported at the top of the file, add `WAVE_FACTION` next to the existing import instead of re-importing.)

- [ ] **Step 4: Verify** — `npm run build && npm run lint`. Expected PASS.

- [ ] **Step 5: Commit**

```bash
git add src/world/orkStore.ts
git commit -m "feat: ork roster pub/sub, reapOrk, wave faction"
```

---

## Task 4: Mobs renders the live roster

**Files:**
- Modify: `src/world/Mobs.tsx` (full rewrite)
- Reference: `src/world/villagerStore.ts` subscribe pattern

- [ ] **Step 1: Rewrite `Mobs.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { getOrks, resetOrks, subscribeOrks, type OrkState } from './orkStore'
import { resetObjectiveTotal } from './objectiveStore'
import { OrkView } from './Ork'

export function Mobs() {
  // Subscribe to the roster so orks spawned over the course of a wave (and
  // reaped on death) appear/disappear. The list reference is stable; we copy to
  // force a re-render.
  const [orks, setOrks] = useState<OrkState[]>(() => [...getOrks()])

  useEffect(() => {
    const unsub = subscribeOrks((list) => setOrks([...list]))
    return () => {
      unsub()
      // Reset on unmount so HMR + remount don't double-register.
      resetOrks()
      resetObjectiveTotal()
    }
  }, [])

  return (
    <group>
      {orks.map((o) => (
        <OrkView key={o.id} state={o} />
      ))}
    </group>
  )
}
```

- [ ] **Step 2: Verify** — `npm run build && npm run lint`. Expected PASS.

- [ ] **Step 3: Commit**

```bash
git add src/world/Mobs.tsx
git commit -m "feat: Mobs renders live ork roster via subscription"
```

---

## Task 5: Orks march on the castle + reap on death

Add the castle as the standing fallback target, deal damage to it in range, and reap the ork when its death-fade finishes.

**Files:**
- Modify: `src/world/Ork.tsx`
- Reference: `src/world/castleStore.ts`, `src/world/cityPlan.ts` (`KEEP_HALF`)

- [ ] **Step 1: Add imports** (top of `Ork.tsx`)

```ts
import { CASTLE_CORE, damageCastle } from './castleStore'
import { KEEP_HALF } from './cityPlan'
import { reapOrk } from './orkStore'
```

(`reapOrk` may be added to the existing `./orkStore` import line instead.)

- [ ] **Step 2: Reap when the death-fade completes**

In the death-fade block, where it currently does `if (opacity <= 0 && visible) setVisible(false)`, add the reap immediately after `setVisible(false)`:

```ts
      if (opacity <= 0 && visible) {
        setVisible(false)
        reapOrk(state.id) // drop from roster so waves don't accumulate corpses
      }
```

- [ ] **Step 3: Add castle as the fallback target**

In the target-acquisition block, after the existing player/enemy selection (after the `else if (enemy) { ... }` that sets `targetOrk`), add a castle fallback and a `targetIsCastle` flag. Declare the flag near `targetIsPlayer`:

```ts
    let targetIsCastle = false
```

Then after the player/enemy `if/else if` chain, before `const hasTarget = ...`:

```ts
    // Fallback goal: if no player/rival-ork target, march on the keep.
    if (!targetIsPlayer && !targetOrk) {
      tx = CASTLE_CORE.x
      tz = CASTLE_CORE.z
      // Distance to the keep's AABB edge (not its centre) so orks stop at the
      // wall and strike it, instead of trying to stand inside the keep.
      const ddx = Math.max(0, Math.abs(CASTLE_CORE.x - state.x) - KEEP_HALF.x)
      const ddz = Math.max(0, Math.abs(CASTLE_CORE.z - state.z) - KEEP_HALF.z)
      dist = Math.hypot(ddx, ddz)
      targetIsCastle = true
    }
```

Update `hasTarget`:

```ts
    const hasTarget = targetIsPlayer || targetOrk !== null || targetIsCastle
```

- [ ] **Step 4: Deal damage to the castle on a melee hit**

In the swing-resolution block, the melee branch currently handles `targetIsPlayer` / `targetOrk`. Add a castle branch. Replace:

```ts
          } else if (dist <= cfg.melee + 0.2) {
            if (targetIsPlayer && isPlayerAlive()) {
              damagePlayer(cfg.damage, tNow)
            } else if (targetOrk && targetOrk.hp > 0) {
              damageOrk(targetOrk, cfg.damage, tNow)
            }
          }
```

with:

```ts
          } else if (dist <= cfg.melee + 0.2) {
            if (targetIsPlayer && isPlayerAlive()) {
              damagePlayer(cfg.damage, tNow)
            } else if (targetOrk && targetOrk.hp > 0) {
              damageOrk(targetOrk, cfg.damage, tNow)
            } else if (targetIsCastle) {
              damageCastle(cfg.damage)
              spawnFloat(`-${cfg.damage}`, '#ff7a3a', CASTLE_CORE.x, 4, CASTLE_CORE.z)
            }
          }
```

(`spawnFloat` is already imported in `Ork.tsx`.)

- [ ] **Step 5: Verify** — `npm run build && npm run lint`. Expected PASS. The castle-target path won't be exercised until WaveDirector exists (Task 7); that's fine.

- [ ] **Step 6: Commit**

```bash
git add src/world/Ork.tsx
git commit -m "feat: orks march on + damage the castle keep, reap on death"
```

---

## Task 6: Wave table + progress store

**Files:**
- Create: `src/world/waveStore.ts`
- Reference: `src/world/orkConfig.ts` (`OrkVariant`)

- [ ] **Step 1: Create `waveStore.ts`**

```ts
import type { OrkVariant } from './orkConfig'

// Escalating assault waves. `variants` is the pool sampled (round-robin by spawn
// index) for that wave; `hpScale` multiplies each ork's base HP; `count` orks
// spawn `spawnInterval` seconds apart. The final wave is the boss push.
export interface WaveDef {
  count: number
  hpScale: number
  variants: OrkVariant[]
  spawnInterval: number
}

export const WAVES: WaveDef[] = [
  { count: 5, hpScale: 1.0, variants: ['grunt'], spawnInterval: 1.6 },
  { count: 7, hpScale: 1.0, variants: ['grunt', 'grunt', 'scout'], spawnInterval: 1.4 },
  { count: 9, hpScale: 1.1, variants: ['grunt', 'scout', 'berserker'], spawnInterval: 1.3 },
  { count: 11, hpScale: 1.2, variants: ['grunt', 'scout', 'berserker', 'shaman'], spawnInterval: 1.2 },
  { count: 13, hpScale: 1.3, variants: ['grunt', 'berserker', 'scout', 'shaman'], spawnInterval: 1.1 },
  { count: 15, hpScale: 1.45, variants: ['berserker', 'scout', 'grunt', 'shaman'], spawnInterval: 1.0 },
  { count: 18, hpScale: 1.6, variants: ['berserker', 'shaman', 'scout', 'grunt'], spawnInterval: 0.9 },
  { count: 1, hpScale: 8.0, variants: ['berserker'], spawnInterval: 0.5 }, // boss
]

export const PREP_DURATION = 12 // seconds between waves

export interface WaveProgress {
  /** 0-based index into WAVES; -1 before the first wave starts. */
  index: number
  total: number
  /** orks still alive in the current wave */
  enemiesAlive: number
  /** orks spawned so far this wave */
  spawned: number
}

const state: WaveProgress = { index: -1, total: WAVES.length, enemiesAlive: 0, spawned: 0 }
const subs = new Set<(s: WaveProgress) => void>()

function notify(): void {
  subs.forEach((fn) => fn(state))
}

export function getWave(): WaveProgress {
  return state
}

/** Begin wave `i`: reset per-wave counters. */
export function beginWave(i: number): void {
  state.index = i
  state.spawned = 0
  state.enemiesAlive = 0
  notify()
}

export function markSpawned(): void {
  state.spawned += 1
  notify()
}

/** Update the alive count; notify only when it actually changes (HUD churn). */
export function setEnemiesAlive(n: number): void {
  if (state.enemiesAlive === n) return
  state.enemiesAlive = n
  notify()
}

export function resetWaves(): void {
  state.index = -1
  state.enemiesAlive = 0
  state.spawned = 0
  notify()
}

export function subscribeWave(fn: (s: WaveProgress) => void): () => void {
  subs.add(fn)
  fn(state)
  return () => {
    subs.delete(fn)
  }
}
```

- [ ] **Step 2: Verify** — `npm run build && npm run lint`. Expected PASS (confirm `OrkVariant` includes `'grunt' | 'scout' | 'berserker' | 'shaman'` in `orkConfig.ts`; adjust the pools if a name differs).

- [ ] **Step 3: Commit**

```bash
git add src/world/waveStore.ts
git commit -m "feat: wave table + progress store"
```

---

## Task 7: WaveDirector — spawn & advance

**Files:**
- Create: `src/world/WaveDirector.tsx`
- Reference: `src/world/orkStore.ts` (`createOrk`, `getAliveOrks`, `WAVE_FACTION`), `src/world/orkConfig.ts` (`ORK_CONFIG`), `src/world/obstacles.ts` (`findSpawnNear`), `src/world/castleStore.ts` (`CASTLE_CORE`), `src/world/gameStore.ts`, `src/world/waveStore.ts`, `src/world/pauseStore.ts`

- [ ] **Step 1: Create `WaveDirector.tsx`**

```tsx
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { createOrk, getAliveOrks, WAVE_FACTION } from './orkStore'
import { CASTLE_CORE } from './castleStore'
import { ORK_CONFIG, type OrkVariant } from './orkConfig'
import { findSpawnNear } from './obstacles'
import { getPhase, setPhase } from './gameStore'
import {
  WAVES,
  PREP_DURATION,
  getWave,
  beginWave,
  markSpawned,
  setEnemiesAlive,
} from './waveStore'
import { isFrozen } from './pauseStore'

// Orks enter from a ring around the keep — far enough to read as "incoming",
// close enough to stay inside the player's cull radius while they defend.
const SPAWN_RING = 30

function ringPoint(i: number): { x: number; z: number } {
  // Deterministic spread: golden-angle around the keep so successive spawns
  // don't stack. (No Math.random — matches the project's deterministic style.)
  const a = i * 2.39996
  return {
    x: CASTLE_CORE.x + Math.cos(a) * SPAWN_RING,
    z: CASTLE_CORE.z + Math.sin(a) * SPAWN_RING,
  }
}

/**
 * Drives the assault: counts down the prep timer, spawns the current wave's
 * orks on an interval, and advances to the next wave (or victory) once the wave
 * is cleared. One useFrame, gated on the global freeze like every other entity.
 */
export function WaveDirector() {
  const prepEndsAt = useRef(0)
  const nextSpawnAt = useRef(0)
  const spawnIndex = useRef(0)

  useFrame(({ clock }) => {
    if (isFrozen()) return
    const now = clock.getElapsedTime()
    const phase = getPhase()
    const wave = getWave()

    if (phase === 'prep') {
      // Entering prep: arm the countdown once (index advances here).
      if (prepEndsAt.current <= now - PREP_DURATION - 1 || wave.index < 0 || wave.index === lastClearedRef(spawnIndex)) {
        // (initialised below; see Step note)
      }
      if (prepEndsAt.current === 0) prepEndsAt.current = now + PREP_DURATION
      if (now >= prepEndsAt.current) {
        const nextIndex = wave.index + 1
        beginWave(nextIndex)
        spawnIndex.current = 0
        nextSpawnAt.current = now
        prepEndsAt.current = 0
        setPhase('wave')
      }
      return
    }

    if (phase === 'wave') {
      const def = WAVES[wave.index]
      if (!def) return
      // Spawn on interval until the wave's quota is met.
      if (wave.spawned < def.count && now >= nextSpawnAt.current) {
        const variant: OrkVariant = def.variants[spawnIndex.current % def.variants.length]
        const p = ringPoint(spawnIndex.current + wave.index * 7)
        const spawn = findSpawnNear(p.x, p.z)
        const facing = Math.atan2(CASTLE_CORE.x - spawn.x, CASTLE_CORE.z - spawn.z)
        const o = createOrk(spawn.x, spawn.z, facing, variant, WAVE_FACTION, spawnIndex.current * 1.7)
        o.hp = Math.round(ORK_CONFIG[variant].hp * def.hpScale)
        o.maxHp = o.hp
        spawnIndex.current += 1
        markSpawned()
        nextSpawnAt.current = now + def.spawnInterval
      }
      // Track alive count for the HUD.
      const alive = getAliveOrks().length
      setEnemiesAlive(alive)
      // Wave cleared once everything has spawned and nothing is left alive.
      if (wave.spawned >= def.count && alive === 0) {
        if (wave.index >= WAVES.length - 1) {
          setPhase('victory')
        } else {
          setPhase('prep') // breather, then the next wave
        }
      }
    }
  })

  return null
}

// Helper kept tiny; see Step 2 for the simpler prep-init approach.
function lastClearedRef(_r: { current: number }): number {
  return -999
}
```

> **Step 1 note:** the prep-init guard above is intentionally simplified in Step 2 — replace the messy `if (prepEndsAt.current <= ...)` block with the clean version below. It is shown separately so the executor doesn't ship the placeholder.

- [ ] **Step 2: Replace the prep block with the clean version**

Replace the entire `if (phase === 'prep') { ... return }` block with:

```tsx
    if (phase === 'prep') {
      if (prepEndsAt.current === 0) prepEndsAt.current = now + PREP_DURATION
      if (now >= prepEndsAt.current) {
        beginWave(wave.index + 1)
        spawnIndex.current = 0
        nextSpawnAt.current = now
        prepEndsAt.current = 0
        setPhase('wave')
      }
      return
    }
```

And delete the `lastClearedRef` helper (it was only scaffolding for the placeholder).

- [ ] **Step 3: Verify** — `npm run build && npm run lint`. Expected PASS (confirm `findSpawnNear(x,z)` returns `{x,z}` — see `obstacles.ts` usage in `OrkCamp.tsx`; confirm `ORK_CONFIG[variant].hp` exists).

- [ ] **Step 4: Commit**

```bash
git add src/world/WaveDirector.tsx
git commit -m "feat: WaveDirector spawns + advances escalating waves"
```

---

## Task 8: Wire WaveDirector into World, drop static camps, start prep on Play

**Files:**
- Modify: `src/world/World.tsx`

- [ ] **Step 1: Remove the four static `<OrkCamp>` enemy spawners**

In `World.tsx`, delete these four lines (the WaveDirector owns all orks now):

```tsx
        <OrkCamp position={[22, 1, 52]} rotation={0} seed={3.3} />
        <OrkCamp position={[76, 1, 20]} rotation={-Math.PI / 2} seed={7.7} />
        <OrkCamp position={[74, 1, 54]} rotation={Math.PI / 2} seed={5.1} />
        <OrkCamp position={[50, 1, 13]} rotation={0} seed={9.2} />
```

If `OrkCamp` is now unused, remove its import. (Keeping camp tents as scenery is out of scope for v1.)

- [ ] **Step 2: Mount WaveDirector + Towers inside the grid group**

Add the import at the top:

```tsx
import { WaveDirector } from './WaveDirector'
import { Towers } from './Towers'
```

Inside the `<group position={[-CENTER_X, 0, -CENTER_Z]}>`, near `<Mobs />`, add:

```tsx
        <WaveDirector />
        <Towers />
```

(`<Towers/>` is created in Task 9; if doing strict task order, add only `<WaveDirector/>` here and add `<Towers/>` in Task 9.)

- [ ] **Step 3: Verify** — `npm run build && npm run lint`. (`Towers` import will fail the build until Task 9 — if running tasks in strict order, defer the `Towers` import/mount to Task 9.) Expected PASS once Task 9 lands.

- [ ] **Step 4: Commit**

```bash
git add src/world/World.tsx
git commit -m "feat: mount WaveDirector, remove static ork camps"
```

---

## Task 9: Towers auto-fire

**Files:**
- Create: `src/world/Towers.tsx`
- Reference: `src/world/cityPlan.ts` (`TOWER_SLOTS`), `src/world/cityStore.ts` (`subscribeCity`/`getCity().towersBuilt`), `src/world/projectileStore.ts` (`spawnBolt`), `src/world/orkStore.ts` (`getAliveOrks`), `src/world/tileMap.ts` (`tileTopY`)

- [ ] **Step 1: Create `Towers.tsx`**

```tsx
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { TOWER_SLOTS } from './cityPlan'
import { getCity } from './cityStore'
import { spawnBolt } from './projectileStore'
import { getAliveOrks } from './orkStore'
import { tileTopY } from './tileMap'
import { isFrozen } from './pauseStore'

const TOWER_RANGE = 18
const TOWER_DMG = 14
const TOWER_COOLDOWN = 1.4 // seconds between shots per tower
const TOWER_MUZZLE_Y = 6 // bolt origin height above the tower base

/**
 * Built guard towers auto-fire homing bolts at the nearest ork in range. Reuses
 * the shaman bolt system (projectileStore). Only active once towers are built.
 */
export function Towers() {
  // One independent cooldown clock per tower slot.
  const readyAt = useRef<number[]>(TOWER_SLOTS.map(() => 0))

  useFrame(({ clock }) => {
    if (isFrozen()) return
    if (!getCity().towersBuilt) return
    const now = clock.getElapsedTime()
    const orks = getAliveOrks()
    if (orks.length === 0) return

    for (let i = 0; i < TOWER_SLOTS.length; i++) {
      if (now < readyAt.current[i]) continue
      const tw = TOWER_SLOTS[i]
      // Nearest alive ork within range of this tower.
      let best = null as (typeof orks)[number] | null
      let bestD = TOWER_RANGE * TOWER_RANGE
      for (const o of orks) {
        const dx = o.x - tw.x
        const dz = o.z - tw.z
        const d = dx * dx + dz * dz
        if (d < bestD) {
          bestD = d
          best = o
        }
      }
      if (!best) continue
      const baseY = tileTopY(Math.floor(tw.x), Math.floor(tw.z))
      spawnBolt(tw.x, baseY + TOWER_MUZZLE_Y, tw.z, { kind: 'ork', ref: best }, TOWER_DMG)
      readyAt.current[i] = now + TOWER_COOLDOWN
    }
  })

  return null
}
```

- [ ] **Step 2: Ensure `<Towers/>` is mounted** (done in Task 8 Step 2; if deferred, add it now next to `<WaveDirector/>`).

- [ ] **Step 3: Verify** — `npm run build && npm run lint`. Expected PASS (confirm `TOWER_SLOTS` items expose `.x`/`.z`; see `cityPlan.ts`. Confirm `projectileStore` is actually stepped each frame — find the `stepProjectiles` driver, likely `Projectiles.tsx` in `World.tsx`; if absent, bolts won't move — verify it's mounted).

- [ ] **Step 4: Commit**

```bash
git add src/world/Towers.tsx src/world/World.tsx
git commit -m "feat: guard towers auto-fire at orks during waves"
```

---

## Task 10: Villager militia — engage waves

The town-guard AI already exists in `Villager.tsx` (`nearestHostile`, guard combat). The only change is making guards engage orks marching on the keep during a wave (the default radius may be tuned for local camp raids).

**Files:**
- Modify: `src/world/Villager.tsx`
- Reference: existing `GUARD_DEFEND_RADIUS`, `GUARD_AGGRO`, `GUARD_AGGRO_ARMORED` constants in that file

- [ ] **Step 1: Read the guard constants**

Run: `rg "GUARD_DEFEND_RADIUS|GUARD_AGGRO|nearestHostile" src/world/Villager.tsx`
Note the current values and where `nearestHostile(state, GUARD_DEFEND_RADIUS, aggro)` is called.

- [ ] **Step 2: Widen engagement during waves**

Import the phase:

```ts
import { getPhase } from './gameStore'
```

At the guard-combat call site, scale the defend radius up while a wave is active so castle villagers push out to meet the assault (tune the multiplier by feel — start 1.8×):

```ts
      const waveActive = getPhase() === 'wave'
      const defendR = GUARD_DEFEND_RADIUS * (waveActive ? 1.8 : 1)
      const aggro = armorTier > 0 ? GUARD_AGGRO_ARMORED : GUARD_AGGRO
      const foe = nearestHostile(state, defendR, aggro)
```

(Replace the existing `const foe = nearestHostile(state, GUARD_DEFEND_RADIUS, aggro)` line and its surrounding `aggro` setup with the above.)

- [ ] **Step 3: Verify** — `npm run build && npm run lint`. Expected PASS.

- [ ] **Step 4: Commit**

```bash
git add src/world/Villager.tsx
git commit -m "feat: villager guards push out to meet wave assaults"
```

---

## Task 11: HUD — wave panel, castle HP, defeat screen, phase wiring

**Files:**
- Modify: `src/hud/Objective.tsx` (full rewrite)
- Modify: `src/hud/StartScreen.tsx` ("Play" → `setPhase('prep')`)
- Modify: `src/hud/PauseMenu.tsx` (migrate any removed gameStore exports)
- Modify: `src/hud/hud.css` (castle-HP bar + defeat screen)

- [ ] **Step 1: Rewrite `Objective.tsx`**

```tsx
import { useEffect, useState } from 'react'
import { getPlayer } from '../world/playerStore'
import { getWave, subscribeWave, type WaveProgress } from '../world/waveStore'
import { getCastle, subscribeCastle, type CastleState } from '../world/castleStore'
import { getPhase, subscribePhase, type GamePhase } from '../world/gameStore'
import { playVictory } from '../audio/sfx'

export function Objective() {
  const [phase, setPhase] = useState<GamePhase>(() => getPhase())
  const [wave, setWave] = useState<WaveProgress>(() => getWave())
  const [castle, setCastle] = useState<CastleState>(() => getCastle())

  useEffect(() => subscribePhase(setPhase), [])
  useEffect(() => subscribeWave((s) => setWave({ ...s })), [])
  useEffect(() => subscribeCastle((s) => setCastle({ ...s })), [])

  // Release pointer-lock + play fanfare on victory.
  useEffect(() => {
    if (phase !== 'victory') return
    if (document.pointerLockElement) document.exitPointerLock()
    playVictory()
  }, [phase])

  useEffect(() => {
    if (phase !== 'defeat') return
    if (document.pointerLockElement) document.exitPointerLock()
  }, [phase])

  if (phase === 'menu') return null

  if (phase === 'victory') {
    const p = getPlayer()
    return (
      <div className="victory-screen">
        <div className="victory-title">Victory!</div>
        <div className="victory-sub">Every wave repelled. The keep stands.</div>
        <div className="victory-stats">
          <span>Level {p.level}</span>
          <span>{p.gold} ★ gold</span>
          <span>{wave.total} waves survived</span>
        </div>
        <button className="victory-again" onClick={() => location.reload()}>
          Play Again
        </button>
      </div>
    )
  }

  if (phase === 'defeat') {
    return (
      <div className="victory-screen defeat-screen">
        <div className="victory-title">The Keep Has Fallen</div>
        <div className="victory-sub">You held until wave {Math.max(1, wave.index + 1)} of {wave.total}.</div>
        <button className="victory-again" onClick={() => location.reload()}>
          Play Again
        </button>
      </div>
    )
  }

  // prep / wave: banner + castle HP bar.
  const hpPct = Math.max(0, (castle.hp / castle.maxHp) * 100)
  return (
    <div className="objective-banner">
      <span className="objective-label">
        {phase === 'prep'
          ? `Wave ${wave.index + 2} incoming…`
          : `Wave ${wave.index + 1} / ${wave.total}`}
      </span>
      {phase === 'wave' && (
        <span className="objective-count">{wave.enemiesAlive} orks left</span>
      )}
      <div className="castle-hp">
        <span className="castle-hp-label">Keep</span>
        <div className="castle-hp-track">
          <div className="castle-hp-fill" style={{ width: `${hpPct}%` }} />
        </div>
      </div>
    </div>
  )
}
```

> Note: during `prep`, `wave.index` is the just-cleared wave (or -1 before wave 1), so "incoming" shows `index + 2`. During `wave` it's `index + 1`.

- [ ] **Step 2: StartScreen → prep**

Run: `rg "startGame|setPaused|onClick" src/hud/StartScreen.tsx` to find the Play handler. Replace the `startGame()` call (and any direct `setPaused(false)`) with:

```ts
import { setPhase } from '../world/gameStore'
// ...in the Play button handler:
setPhase('prep')
```

`setPhase('prep')` already calls `setPaused(false)` internally, so remove redundant pause calls. If StartScreen subscribed via `subscribeStarted`, switch it to `subscribePhase((p) => setVisible(p === 'menu'))`.

- [ ] **Step 3: PauseMenu + other callers**

Run: `rg "subscribeStarted|startGame" src` — for any remaining hit (e.g. `PauseMenu.tsx`, `Character.tsx`, `PlayerHud.tsx`), replace `subscribeStarted(fn)` with `subscribePhase((p) => fn(p !== 'menu'))` and `startGame()` with `setPhase('prep')`. `isStarted()` callers need no change (still exported).

- [ ] **Step 4: Add HUD styles to `hud.css`**

```css
/* Castle keep HP bar in the objective banner */
.castle-hp {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}
.castle-hp-label {
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.8;
}
.castle-hp-track {
  width: 160px;
  height: 8px;
  background: rgba(0, 0, 0, 0.45);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 4px;
  overflow: hidden;
}
.castle-hp-fill {
  height: 100%;
  background: linear-gradient(90deg, #6fd0ff, #2a8fd6);
  transition: width 0.2s linear;
}
.defeat-screen .victory-title {
  color: #ff6a5a;
}
```

- [ ] **Step 5: Verify** — `npm run build && npm run lint`. Expected PASS. Then **observe**: `npm run dev`, click Play → "Wave 1 incoming…" then waves spawn and march on the keep; the keep HP bar drops when orks reach it; clearing all waves shows Victory; letting the keep fall shows Defeat.

- [ ] **Step 6: Commit**

```bash
git add src/hud/Objective.tsx src/hud/StartScreen.tsx src/hud/PauseMenu.tsx src/hud/hud.css
git commit -m "feat: wave/castle HUD + defeat screen + phase wiring"
```

---

## Task 12: Integration sweep + reset wiring

Make sure a fresh run starts clean and there are no dangling references.

**Files:**
- Modify: `src/world/Mobs.tsx` (or wherever world reset happens) — also reset castle + waves.

- [ ] **Step 1: Reset castle + waves on world (re)mount**

In `Mobs.tsx`'s unmount cleanup (or the existing world reset path), also call `resetCastle()` and `resetWaves()` so HMR/remount starts fresh:

```ts
import { resetCastle } from './castleStore'
import { resetWaves } from './waveStore'
// ...in the cleanup:
      resetOrks()
      resetObjectiveTotal()
      resetCastle()
      resetWaves()
```

- [ ] **Step 2: Confirm projectiles are stepped**

Run: `rg "stepProjectiles|<Projectiles" src/world` — confirm a component drives `stepProjectiles` each frame and is mounted in `World.tsx` (tower bolts depend on it). If missing, that's a separate bug — note it.

- [ ] **Step 3: Full gate**

Run: `npm run build && npm run lint`
Expected: build PASS (tsc clean), lint 0 errors. Then `npm run dev` and play a full run: Play → survive/clear waves → Victory; separately let the keep fall → Defeat; Play Again reloads clean.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: reset castle + waves on remount; integration sweep"
```

---

## Self-Review (completed)

**Spec coverage:** phase machine (T1), castle HP + defeat (T2), ork march target (T5), wave faction (T3), wave director + roster fix + reap (T3/T4/T6/T7), drop static camps (T8), towers (T9), villager militia (T10), HUD + defeat (T11), reset (T12). All spec sections map to a task.

**Placeholder scan:** the only intentional scaffold (the `lastClearedRef` helper / messy prep guard in T7 Step 1) is explicitly replaced in T7 Step 2 — flagged, not shipped. Tuning constants (`CASTLE_MAX_HP`, wave sizes, `SPAWN_RING`, tower stats, guard radius) are concrete values, adjustable by feel.

**Type consistency:** `getPhase/setPhase/subscribePhase/GamePhase`, `getCastle/damageCastle/subscribeCastle/CastleState/CASTLE_CORE`, `getWave/beginWave/markSpawned/setEnemiesAlive/subscribeWave/WaveProgress/WAVES`, `subscribeOrks/reapOrk/WAVE_FACTION`, `createOrk(x,z,facing,variant,faction,seed)` — names used consistently across tasks.

**Assumptions to confirm during execution (flagged in-task):** `addShake` export name (fxStore), `OrkVariant` member names, `findSpawnNear` return shape, `TOWER_SLOTS` field names, that `stepProjectiles` is driven somewhere, exact guard constants in `Villager.tsx`, StartScreen's Play handler shape.
