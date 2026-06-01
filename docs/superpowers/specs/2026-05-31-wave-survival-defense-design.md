# Wave-Survival Defense — Design

**Date:** 2026-05-31
**Status:** Approved design, pending implementation plan.

## Goal

Turn the existing action-RPG sandbox into a structured game: orks invade in
escalating **waves** and march on the player's **castle keep**. The player (plus
auto-firing towers and the existing villager town-guards) defends it. A breather
between waves lets the player shop/upgrade. Survive all waves → **Victory**.
Keep HP reaches 0 → **Defeat**.

### Decisions (from brainstorming)

- Core shape: **wave survival / defense**.
- Lose condition: **the castle keep falls** (keep HP → 0). Player death is NOT
  the fail state — death respawns (existing behaviour); the stakes live on the
  keep, which orks pummel while the player is down.
- Defenders: **towers auto-fire + villager militia**.
- Scope: full system.

## What already exists (reused, not rebuilt)

- **Game loop** — every entity owns a `useFrame`; there is no central loop and
  none is needed. The per-entity contract (freeze-gate via `isFrozen()`, read
  `getPlayer()`, mutate own store) is the loop.
- **Start/victory flow** — `gameStore.started`, `objectiveStore`, and
  `Objective.tsx` already gate a StartScreen and show a Victory screen.
- **Villager militia** — castle villagers already act as **town guards**
  ([Villager.tsx](../../../src/world/Villager.tsx): `nearestHostile`, guard
  combat). They break off daily routine to fight orks/bears within
  `GUARD_DEFEND_RADIUS` of their home, deal-damage-only (never take damage).
  Militia = **tune + ensure they engage waves**, not new AI.
- **Homing projectiles** — `projectileStore.spawnBolt(x,y,z,{kind:'ork',ref},dmg)`
  already homes onto and damages orks. Towers reuse this directly.
- **Ork combat/AI** — `Ork.tsx` targets nearest {player, rival ork}; A* chase;
  melee/ranged swing → `damagePlayer` / `damageOrk`. We add one target type.
- **Castle** — keep at `CITY_CENTER` (57,33), footprint `KEEP_HALF` (±3.5 × ±3),
  `CASTLE_BOUNDS`. Towers at `TOWER_SLOTS` (built when `cityStore.towersBuilt`).

## What's missing (the work)

### 1. Game-phase state machine — rework `gameStore.ts`

Replace the `started: boolean` with a phase enum:

```
type GamePhase = 'menu' | 'prep' | 'wave' | 'victory' | 'defeat'
```

- `getPhase()` / `setPhase(p)` / `subscribePhase(fn)` — same hand-rolled pub/sub
  shape, immediate-call subscribe.
- `menu` → world paused behind StartScreen (today's boot state).
- `prep` → between-wave breather: world runs, no orks incoming, countdown ticking,
  shop/upgrade-tree allowed.
- `wave` → orks spawning + marching; ends when all wave orks are dead.
- `victory` / `defeat` → end screens.
- **Freeze integration:** keep `pauseStore.isFrozen()` as the single freeze
  chokepoint. Phase transitions into `menu`/`victory`/`defeat` call
  `setPaused(true)`; `prep`/`wave` call `setPaused(false)`. No change to the
  hundreds of `if (isFrozen()) return` gates.
- StartScreen "Play" → `setPhase('prep')`. Migrate `isStarted()` callers to
  `getPhase() !== 'menu'`.

### 2. Castle keep HP — new `castleStore.ts`

Mirror `playerStore` shape.

```
state = { hp: number, maxHp: number }
CASTLE_CORE = { x: CITY_CENTER.x, z: CITY_CENTER.z }
getCastle()            // live ref, read each frame by AI
damageCastle(n)        // clamp ≥0; notify; on hp===0 → setPhase('defeat')
subscribeCastle(fn)    // immediate-call; HUD bar
resetCastle()
```

`maxHp` tuned so a few unblocked orks over a wave threaten it but a defended keep
holds (start ~`500`, tune).

### 3. Ork AI gets a march target — edit `Ork.tsx`

Add the castle as the **standing goal** so wave orks always advance even with no
player nearby. Target priority in the acquisition block:

1. player — if alive and within `cfg.aggro` (existing)
2. nearest rival ork — within `cfg.aggro` (existing; rarely triggers since wave
   orks are one faction)
3. **castle core** — always, as the fallback goal (new)

New `targetIsCastle` branch: path to `CASTLE_CORE`; `inRange` when within
`cfg.melee` of the keep footprint (distance to the `KEEP_HALF` AABB, not the
centre, so they strike the wall). On swing-hit with castle target →
`damageCastle(cfg.damage)` + a floating hit number on the keep.

Note: distant spawned orks must not be culled into inactivity — see §5 spawn
ring. Confirm `isCulled` (player-relative, ~46 tiles) doesn't freeze marching
orks when the player is defending at the keep.

### 4. Wave invaders are one faction — `factions.ts` / `World.tsx`

All wave orks spawn as a single `OrkFaction` (e.g. `'red'`) → `orksHostile` is
false among them → no infighting; all march on the keep. Remove the four static
`<OrkCamp>` *enemy spawners* from `World.tsx` (the WaveDirector owns all orks).
Tents may remain as set dressing (render `OrkCamp` without its spawn effect, or
drop entirely — decide in plan).

### 5. Wave director — new `waveStore.ts` + `WaveDirector.tsx`

**`waveStore.ts`** (pub/sub):

```
state = { index, total, enemiesAlive, spawnedThisWave, toSpawn, prepEndsAt }
WAVES: WaveDef[]   // ~8 waves
getWave() / advance / setEnemiesAlive / subscribeWave()
```

`WaveDef`: `{ count, hpScale, variants: OrkVariant[] weighting, spawnInterval }`.
Escalation: grunt-heavy early → scouts/berserkers mid → shamans late; final wave
= boss (one beefy berserker w/ large `hpScale` + adds).

**`WaveDirector.tsx`** (mounted inside World's grid group, one `useFrame`, gated
on `isFrozen()`):

- `prep`: tick the countdown; at 0 → `setPhase('wave')`, init the wave's spawn
  budget. (Optional "Start now" HUD button just sets `prepEndsAt = now`.)
- `wave`: every `spawnInterval`, `createOrk(...)` at a point on a **ring ~28–32
  tiles around the keep** (deterministic angle from wave+spawn index; snap via
  `findSpawnNear`), wave faction, hp = base × `hpScale`. When
  `spawnedThisWave === count` AND `getAliveOrks().length === 0` → wave cleared:
  last wave → `setPhase('victory')`, else advance index + `setPhase('prep')`.
- Update `waveStore.enemiesAlive` only when it changes (discrete notify).

**Roster rendering fix** — `orkStore.ts` + `Mobs.tsx`:

- `Mobs` currently snapshots `getOrks()` once on mount. Add a `subscribe`/`notify`
  to `orkStore` (mirror `villagerStore`). `createOrk` notifies; `Mobs`
  subscribes and re-renders the keyed list as waves add orks.
- Add `reapOrk(id)` — remove a dead ork from the array (+notify) once its
  death-fade completes in `OrkView` (it already `setVisible(false)` there), so
  the roster doesn't grow unbounded across 8 waves.

### 6. Towers auto-fire — new `Towers` firing logic

When `cityStore.towersBuilt` and phase is `wave`: a `useFrame` (new small
component, or fold into `City`) iterates `TOWER_SLOTS`; each tower on its own
cooldown finds the nearest alive ork within `TOWER_RANGE` and
`spawnBolt(towerX, towerY+H, towerZ, {kind:'ork', ref}, TOWER_DMG)`. Reuses the
existing homing/damage/render pipeline (`Projectiles.tsx`). Tunables:
`TOWER_RANGE`, `TOWER_DMG`, `TOWER_COOLDOWN`.

### 7. Villager militia — tune existing town-guards

Reuse `Villager.tsx` guard combat. Work: ensure guards engage wave orks
approaching the keep — likely widen `GUARD_DEFEND_RADIUS` and/or arm more
castle villagers during `wave` phase. Keep deal-damage-only (invincible) for v1;
note "make guards mortal" as a future tuning lever. No new AI.

### 8. HUD — rework `Objective.tsx`

- Replace the "Clear the orks" banner with a **wave HUD**: `Wave X / N`,
  enemies remaining, and a **castle HP bar**. `prep` shows `Wave X incoming — Ns`
  (+ optional "Start now").
- Keep the **Victory** screen (now = survived final wave). Add a **Defeat**
  screen ("The keep has fallen" + Play Again = `location.reload()`).
- Retire `objectiveStore.won` auto-victory (it would misfire at 0 orks during
  prep). Win/lose now driven by `gameStore` phase. Subscribe HUD to
  `subscribeWave` + `subscribeCastle` + `subscribePhase`.

### Reset / Play Again

Page reload (existing pattern) — resets all module-level stores cleanly. No
in-place full reset needed for v1.

## Data flow

```
StartScreen → setPhase('prep')
WaveDirector(useFrame): prep countdown → setPhase('wave')
  → createOrk(ring) [+orkStore notify] → Mobs renders → OrkView marches to keep
     → in range → damageCastle()  → hp 0 → setPhase('defeat')
  player/towers/guards kill orks (damageOrk / spawnBolt)
  OrkView death-fade done → reapOrk()
  all spawned & 0 alive → next wave (setPhase('prep')) or setPhase('victory')
HUD subscribes: waveStore + castleStore + gameStore.phase
```

## Files

**New:** `castleStore.ts`, `waveStore.ts`, `WaveDirector.tsx` (+ small Towers
firing component or City edit).
**Edited:** `gameStore.ts` (phase machine), `Ork.tsx` (castle target),
`orkStore.ts` (roster notify + reap), `Mobs.tsx` (subscribe), `factions.ts`
(wave faction note), `World.tsx` (drop static camps, mount WaveDirector),
`Villager.tsx` (guard tuning), `Objective.tsx` (wave/castle HUD + defeat),
`StartScreen.tsx`/`PauseMenu.tsx` (phase migration), `hud.css` (HP bar, defeat).

## Out of scope (v1)

Mortal villagers, mid-wave reinforcement events, multiple maps/lanes, persistent
meta-progression between runs, in-place run reset (use reload), boss mechanics
beyond a big-HP unit.

## Open tuning (resolve during implementation, by feel)

Keep `maxHp`; wave count/sizes/`hpScale` curve; spawn ring radius; tower
range/damage/cooldown; guard defend radius; prep duration.
