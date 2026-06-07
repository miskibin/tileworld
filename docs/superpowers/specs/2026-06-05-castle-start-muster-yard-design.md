# Castle Start Area — Muster Yard + Wayfinder Signpost

**Date:** 2026-06-05
**Status:** Design — awaiting user review
**Topic:** Fill the empty meadow ring the player sees at game start (before the
upgrade tree builds out the castle).

## Problem

At boot the castle is just the **Keep** + **war bell**. Walls, towers, gates,
houses, farm and the courtyard flagstone are all gated behind the upgrade tree
and render `null` until bought ([City.tsx](../../../src/world/City.tsx)). So the
meadow immediately around the keep — the first thing the player sees — reads as
empty grass.

## Goals

- Make the start view feel purposeful, not barren.
- Add **gameplay content** (interactive/onboarding), not decoration. The day is a
  free-roam window whose verbs live out in the biomes — home-ring content should
  **launch the player outward / onboard**, never duplicate the biome verbs.
- Stay cheap: no new point lights (recompile stutter), minimal hot-path cost.
- Survive the castle being built — nothing here may collide with structures the
  upgrade tree later raises.

## Non-goals

- No ringing the whole castle. Content concentrates at the gate approaches.
- No new economy / reward from the dummies (would become a farm exploit).
- No UI chrome / text labels in 3D.

## Decisions (from brainstorming)

| Question | Choice |
|---|---|
| Direction | Gameplay content (purposeful objects) |
| Objects | Training dummies / muster yard **+** starter signpost |
| Signpost form | Tiny 3D biome-icon arms (no text) |
| Dummy behavior | One **sparring pell** (teaches block) + passive dummies |
| Spread | Signpost + main yard at south gate **+** a smaller second cluster at another gate |
| Persistence | Permanent (no fade) |

## Placement

All placements authored in **base coords** and mapped via `shiftToCentre`
(castle-attached) — the same idiom as the existing market stall. Everything sits
**outside the wall bounds** (`CASTLE_BOUNDS`, south edge base `z63`) so it never
overlaps courtyard flagstone or the south-row house slots when those upgrades
build.

- **South-gate approach (primary):** market stall already reserves base
  `x65–71, z68–73`. Main muster yard sits east of it, base ≈ `x73–80, z66–73`.
  Wayfinder signpost at the road fork by the gate, base ≈ `(75, 66)`.
- **Second cluster (secondary):** small passive-only pair at the **east gate**
  approach (the rock/mining egress), base ≈ `x88–92, z52–56`. Outside the east
  wall (`x85`). No pell, no signpost — just 2 dummies, to occupy more of the
  start view. Exact side is easily re-tuned in `npm run dev` / `npm run shot`.

## Components & files

New:
- `src/world/dummyStore.ts` — module-level external store (mirrors
  [oreStore.ts](../../../src/world/oreStore.ts) minus the brain/reward).
- `src/world/TrainingDummy.tsx` — the dummy mesh model (build via **model-smith**).
- `src/world/Signpost.tsx` — post + biome-glyph arms model (model-smith).
- `src/world/MusterYard.tsx` — placement component: spawns the dummy set (incl.
  the pell), the rope/posts, and mounts the signpost. Two instances (primary
  south, secondary east) driven by a small placement list.

Edited:
- [Character.tsx](../../../src/world/Character.tsx) — new swing-scan block beside
  the ore block (~line 879); add `dummyCollidesAt` to the two movement-collision
  chains (~lines 458, 466).
- [obstacles.ts](../../../src/world/obstacles.ts) — reserve the yard footprints
  (`baseBox(...)` lines in `RESERVED`, mirroring the market stall at line 88).
- [scripts/inspect-model.tsx](../../../scripts/inspect-model.tsx) — register
  `TrainingDummy` + `Signpost` for `npm run inspect`.
- [World.tsx](../../../src/world/World.tsx) — mount `<MusterYard/>` instances
  inside the offset group.

## dummyStore shape

```
interface DummyState {
  id, x, y, z
  seed
  hurtFlashUntil      // brief flash on hit (like ore)
  wobbleUntil         // recoil-wobble timer set on hit
  collisionRadius     // ~0.35
  isPell: boolean     // the one sparring pell vs a passive target
  nextBonkAt?: number // pell only — telegraph timer (world clock seconds)
}
```

Functions: `createDummy(x,z,seed,{isPell})`, `resetDummy()`, `getDummies()`,
`getAliveDummies()` (all dummies — they never die), `damageDummy(d, now)` (sets
flash + wobble, returns nothing — no HP, no reward), `dummyCollidesAt(x,z,r)`
(mirror `oreCollidesAt`).

**Infinite HP / zero reward is the whole point** — practice feel only, so there's
nothing to farm. Solid collision so you stand and swing.

## Models

- **TrainingDummy:** wooden cross-post + straw torso + burlap head, base on
  `y=0`. Pell variant gets a small pivoting "arm" club (a child group rotated in
  the View) for its telegraphed bonk. Headless-inspect clean.
- **Signpost:** central post + 4–5 plank arms. Each arm tipped with a tiny 3D
  glyph pointing the **real world-direction** to that biome: rock cube (E), reed
  bundle (S swamp), white crystal (snow, NW), tan pyramid (desert, NE), tree-tuft
  (forest, W). Passive — no interaction. Any glow is **emissive-only** (no point
  lights). No `<Text>`, so it mounts in the headless checker.

## Behavior

### Passive dummies (swing-scan hook)

New block in Character's swing scan, copied from the ore block:

```
for (const d of getAliveDummies()) {
  if (!inCone(d.x, d.z)) continue
  damageDummy(d, hitT)
  hitDummy = true
  spawnImpact(d.x, d.y + 0.9, d.z, { color: '#d8c48a', count: 5, ... }) // straw puff
  spawnFloat(`${dmg}`, '#e8dcb0', d.x, d.y + 1.6, d.z)
}
// after the scan: if (hitDummy) { playHit(); addShake(0.2); small FOV/hitstop }
```

`damageDummy` sets `hurtFlashUntil` + `wobbleUntil`; the View tilts/recoils on
the wobble timer and tints the straw on the flash (mirror `OreView`).

### Sparring pell (one dummy, south yard)

A small timed behavior in the pell's View (`isPell`):
- On a slow timer (`nextBonkAt`), telegraph a wind-up (raise the club ~0.4s),
  then swing it down ("bonk").
- At the bonk frame, if the player is within ~1.6 tiles **and** facing the pell:
  - **Blocking** (`getBlockState().blocking`): bright clang — spark `spawnImpact`,
    `spawnFloat('Blocked!', '#9adcff')`, a satisfying FOV kick / small shake.
    (Optionally `absorbBlockedHit()` for realism; default **off** so practice
    never punishes.)
  - **Not blocking:** dull thud — soft `spawnImpact`, tiny screen nudge, a
    `spawnFloat('Bonk', ...)`. **No HP change** (harmless trainer).
- Reset `nextBonkAt` to a few seconds out and loop.

This teaches the right-click block timing safely, at home, before the first
night.

### Collision & reservation

- `dummyCollidesAt` added to both per-axis movement checks in Character
  (one extra cheap store loop, ≤5 dummies).
- Signpost gets a small solid blocker via `registerHouseBlocker` (or a stub
  obstacle) so the post can't be walked through.
- `obstacles.ts` `RESERVED`: `baseBox(73, 80, 66, 73, shiftToCentre)` (south) and
  `baseBox(88, 92, 52, 56, shiftToCentre)` (east) so scatter drops no trees on
  the yards.

### Cull / lifecycle

- Each View does an internal `isCulled` check (copy `OreView`) — freezes its
  matrix + skips work when the player roams far.
- `dummyStore` reset on `MusterYard` unmount (HMR safety), like `resetOre` in
  [OreNodes.tsx](../../../src/world/OreNodes.tsx).

## Constraints honored

- **No point lights** added (glyph glow = emissive only) → no shader-recompile
  stutter ([project_pointlight-count-stutter]).
- Hot path: +1 collision-store loop (tiny). Per-frame work is one short View tick
  per dummy, culled when far.
- Post-processing (the real frame cost) untouched.

## Verification

- `npm run inspect TrainingDummy` and `npm run inspect Signpost` — fix every
  FAIL/WARN (floating/sunk parts, NaN, base off `y=0`).
- `npm test` — pure logic only; no test covers visuals/R3F. (No store math here
  worth a unit test beyond a trivial `dummyStore` create/collide check — add one
  if cheap.)
- `npm run build` — the real correctness gate (tsc across all tsconfigs).
- `npm run dev` — walk up, swing the dummies (flash/wobble/damage floats), block
  the pell (clang vs thud), confirm signpost arms point at the right biomes, and
  that buying walls/houses doesn't collide with the yards. `npm run shot` for a
  start-view screenshot.

## Optional / deferred

- Pell `absorbBlockedHit()` stamina drain — off by default.
- Block-success could be wired to fire the existing block VO/SFX if one exists.
