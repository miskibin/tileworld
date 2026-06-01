# Map Overhaul — Phase 1 (structural)

Status: **Phase 1 implemented + verified.** `tsc -b` clean; 7 pathfinding + 11
map-reachability tests pass; live preview renders with no console errors. (Two
pre-existing `waveStore`/`waveLogic` test failures are unrelated branch WIP — ork
hp/scale tuning — not touched by this work.)

Scope split: **Phase 1 = terrain / layout / nav** (this doc). **Phase 2 = per-biome
creatures + loot/items** (separate spec).

## Current state (ground truth from working tree, commit abe1b94)

- Grid `COLS=144 × ROWS=108`, `CENTER=(72,54)` — [tileMap.ts](../../../src/world/tileMap.ts).
  Note: `CLAUDE.md` and the in-game leva panel still say 96×72 / center (48,36) — **stale**.
- Castle `CITY_CENTER=(57,33)`, bounds `x44..70, z24..42` — [cityPlan.ts](../../../src/world/cityPlan.ts).
  The grid was expanded but the old core stayed anchored, so the castle sits **NW of
  true center** and the E/S frontier is empty bulge. This is the root of complaint #1.
- Rivers anchored `riverX≈40`, `riverZ≈18` → river runs **1–2 tiles off the W/N walls**.
  Confirmed "too close."
- Biomes = soft blob `REGIONS[]` in tileMap.ts; mountains are `rock`/`snow` regions with
  **noisy** peaks (`+ noiseB*2.2`) → adjacent tiles jump Δ≥2 (fine as walls, unclimbable).
- Walkability `height ≥ 2 = hard wall`, enforced in **three** independent spots:
  1. `pathfinding.ts:21` `isWalkable` (mob/villager A*)
  2. `obstacles.ts:279` `findSpawnNear` standable check
  3. `Character.tsx:18` `blockedAt` (player collision)
- Roads = hardcoded polylines from the 4 gates — [roads.ts](../../../src/world/roads.ts);
  bridges auto-emit where a road crosses water — [bridges.ts](../../../src/world/bridges.ts).
- Ork-camp footprints hardcoded in `obstacles.ts` `RESERVED` boxes; camps spawned via
  `getCamps()` in [waveLogic.ts](../../../src/world/waveLogic.ts), rendered by
  [Mobs.tsx](../../../src/world/Mobs.tsx) (663 lines) / OrkCamp.
- Wildlife: `SPECIES[]` in [animalConfig.ts](../../../src/world/animalConfig.ts) spawn by
  biome via [WildAnimals.tsx](../../../src/world/WildAnimals.tsx) (243 lines) +
  [animalAI.ts](../../../src/world/animalAI.ts).

## Goals (user)

1. Castle at true map center; no river or mountains very close.
2. More mountains, **climbable**, distributed outward toward the edges (not a forced rim).
3. Bigger biomes, set back from the castle; each biome its own creatures + characteristics;
   more lootable/findable items. (creatures+loot → Phase 2)
4. Paths connect everything; ork camps sit in the mountains; local wildlife; rivers raised
   and sensible (no river bisecting a mountain); optional small lake.

## Phase 1 design

### 1. Recenter castle → true center (72,54)
Shift the anchored core by **Δ=(+15,+21)** (57→72, 33→54).
- `cityPlan.ts`: `CITY_CENTER`, `CASTLE_BOUNDS`, all `*_SLOTS` (walls/gates/towers/houses/
  farm). Cleanest: define `CITY_CENTER` then express slots as offsets from it so future
  moves are one-line. At minimum, shift every literal by Δ.
- `obstacles.ts` `RESERVED` camp/village/market/bridge-approach boxes by Δ.
- `roads.ts` `ROUTES` waypoints by Δ.
- `tileMap.ts` river anchors (below).
- Add **castle safe-zone**: `CASTLE_SAFE_R ≈ 18` around center. Inside it force flat grass —
  no river carve, no lake, no mountain, no biome blob. Guarantees the "nothing close" buffer.

### 2. Distributed climbable mountains
- Keep the `REGIONS` blob approach. Add more `rock`/`snow` regions spread across the map,
  several pushed out toward the frontier edges (fill the empty E/S land). Not a continuous
  rim — distributed masses.
- Rewrite mountain height to **staircase-smooth**: `height = 2 + floor(ringDist)` where each
  concentric ring steps up exactly 1, so every adjacent pair differs by ≤1 → climbable via
  switchbacks. Drop the per-tile `noiseB` term from peak height (it created random Δ≥2).
  Optional ±0 cosmetic jitter only if it never breaks the ≤1 neighbor invariant.
- Cap peak height (≈6–8) so A* stays cheap and camera/vision/cull don't need rework.
- Enforce no region center within `CASTLE_SAFE_R + region.r`.

### 3. Climbable walkability — one shared rule
Add to `tileMap.ts`:
```ts
export function standable(x, z): boolean   // land tile, on a bridge, etc.
export function canStep(fromX, fromZ, toX, toZ): boolean
  // standable(to) && |tileTopY-class(to) - class(from)| <= 1   (step-delta rule)
```
Rewire the three spots to the shared helper:
- `pathfinding.ts` — neighbor expansion + corner-cut checks use `canStep(cx,cz,nx,nz)`.
- `Character.tsx` `blockedAt`/`resolveMove` — gate on `canStep(fromTile, toTile)`.
- `obstacles.ts` `findSpawnNear` — `standable` + cap height so spawns don't strand on peaks.
Mobs/villagers call `findPath`, so they inherit climbing for free (no per-consumer change —
verified only these 3 spots gate height).

### 4. Bigger biomes, off the castle
- Bump `REGIONS` radii so each biome reads as a large contiguous sector.
- Forbid any region center within `CASTLE_SAFE_R + r`; relocate current crowders
  (rock E at x88, forest S) outward.
- Re-confirm biome set covers the frontier so there's no bald grass bulge.

### 5. Rivers — mountain-sourced → sea, raised
- Seed each river at a **mountain pass** (a low saddle between two masses, height ~2–3), not
  a peak. Flow downhill to the nearest coast, steered to stay in low ground between masses
  (extend the existing `inMountain` guard into "prefer the valley").
- Never enter the castle safe-zone.
- Render banks one height-step above the water channel so it reads as carved/raised.
- Optional: one small lake in a natural basin (`isLakeAt`), away from castle.

### 6. Roads + camps re-authored
- Re-author `ROUTES` from the recentered gates out to each biome and each camp; switchback up
  slopes (Δ≤1 steps) and bridge rivers (bridges auto-emit).
- Move ork camps onto mountain **shelves** (height ~3–5, not peaks). Update `obstacles.ts`
  `RESERVED`, the camp source in `waveLogic.ts`, and OrkCamp render coords.
- **Reachability test** in [pathfinding.test.ts](../../../src/world/pathfinding.test.ts):
  assert `findPath(castleGate → eachCamp)` and `→ each biome center` returns non-empty.
  Guards against unclimbable / cut-off generation.

## Risks & mitigations
- **Recenter blast radius**: 4 files of coords keyed to (57,33). Mitigate: single Δ /
  center-relative expression + the reachability test.
- **Climbable rule touches all nav**: perf on 144×108 with mobs on slopes — cap peak height,
  keep A* `maxNodes=800`. The 3 gating spots must use the identical shared helper or
  player/mob disagree.
- **Tall peaks vs camera/vision/cull**: cap height; clamp if a peak pokes the camera.
- **Stale docs**: update `CLAUDE.md` grid/center note and the leva center labels as part of
  this work.

## As-built notes (deviations from the design above)
- **Castle recenter** to `(72,54)` (= `CENTER_X/Z`); old core shifted Δ=(+15,+21).
  `CITY_CENTER`/`CASTLE_BOUNDS`/all cityPlan slots, `PLAYER_SPAWN`→`(72,58)`, World.tsx
  entities (Character, Village→`(50,38)`, Shop, Cats, Sparkles, Chests, water loops),
  obstacles `RESERVED`, dog + wild-animal spawns all re-placed.
- **Climbable terrain**: new `standable()` + `canStep()` in tileMap (single shared rule);
  `pathfinding.ts`, `Character.tsx`, `obstacles.findSpawnNear` all rewired to it. Mountain
  height is now `round(peak·(1−dc/r))` (steps down 1 class/tile) — fully climbable; the old
  per-tile `noiseB` peak term was dropped (it made random Δ≥2 walls).
- **Lakes**: procedural inland lakes **disabled** — they randomly chopped biomes/mountains
  into unreachable pockets. Replaced with ONE hand-placed oval lake (`DELIBERATE_LAKE` at
  `(92,80)`) in the open SE grass belt, clear of roads/regions/safe-zone.
- **SW forest** moved from `(26,86)` → `(36,76)`: the original centre sat across the river
  mouth on a sliver of coast the road couldn't bridge. Relocated onto solid ground.
- **Reachability guard**: `mapReachability.test.ts` asserts the castle apron paths to all 5
  biomes + 3 ork camps + 3 named ranges on the REAL map (registers road bridges headlessly).
- **Docs**: `CLAUDE.md` coordinate + navigation sections updated (144×108, centre 72/54,
  climbable `canStep` rule). Leva panel still shows generic vision sliders — no center label
  to fix there.

## Refinement pass (2026-05-31, follow-up request)
- **Bigger biome chunks**: region radii bumped (desert 24, forests 23/25, swamp 21, snow 25).
- **Taller mountains with cliffed cores**: peaks raised to 10–13. `mountainHeight` switched
  from linear to a **quadratic** profile `peak·t²` + noise — gentle climbable apron at the
  foot (camps/roads stay reachable) rising into a steep core where many faces jump ≥2 classes
  (sheer, unclimbable cliffs); noise punches occasional climbable notches so it's not a sealed
  dome. Satisfies "mountains higher, some parts not walkable, more height difference."
- **Drop-off + fall damage**: new player-only `canStepOrDrop()` in tileMap (climb ≤1 class,
  but walk off *any* height). Character lets gravity carry the player down and applies fall
  damage on landing — drop > `FALL_SAFE` (1.1u, above a normal jump's ~1.06 apex) hurts,
  scaled `×16/u`, capped 45. Mobs keep symmetric `canStep` (A* never walks them off cliffs).
- **Reachability test rewritten** to flood-fill the walkable component once and assert each
  target's membership, instead of per-target `findPath` (whose node budget is a gameplay knob,
  not a connectivity truth — a cross-map path needed ~40k nodes). Targets now point at biome
  *feet* since the cores are intentionally cliffed off. 11/11 reachable.

## Phase 2 (separate spec)
Per-biome creatures (snow→polar bear, desert→scorpion, swamp→…), characteristic props, a
loot/item system (fur, ore, herbs), biome chests granting biome items, ground pickups.
