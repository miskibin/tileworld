# Map Expansion + Radial Frontier Gradient — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bigger island where the farther from the castle you go, the deadlier and more rewarding it gets (top gear gated to the rim), plus a global ~30% nerf to player power so the harder map matters.

**Architecture:** One pure scalar `frontierFactor(x,z)` (0 at castle → 1 at rim) drives loot tier, drop tier, and day-threat toughness. The map is enlarged by a single `MAP_SCALE` via a resample transform (generation evaluated in old-map space, anchors converted old→new) so the layout keeps its shape and the mountains keep their cliffs. Difficulty is a numeric pass over gear/leveling/hero-upgrade magnitudes.

**Tech Stack:** TypeScript, React 19 + R3F, Vitest (pure-logic tests), Vite (`tsc -b` build gate), `npm run shot` (Playwright screenshot) for terrain verification.

**Execution order rationale:** Phases 1–6 are the gameplay/balance layer — fully testable and independent of map size, high value, low risk. Phase 7 (map rescale) is the risky coordinate work and goes last, gated by the existing `mapReachability.test.ts` + screenshots, so the rest is already proven on the current map.

---

## Phase 1 — Frontier core (pure, TDD)

### Task 1: `frontierFactor` + gear tier helpers

**Files:**
- Create: `src/world/frontier.ts`
- Test: `src/world/frontier.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/world/frontier.test.ts
import { describe, it, expect } from 'vitest'
import { frontierFactor, gearTier, RIM_DIST } from './frontier'
import { CASTLE_CENTER, CASTLE_SAFE_R } from './tileMap'

describe('frontierFactor', () => {
  it('is 0 at the castle centre and across the safe zone', () => {
    expect(frontierFactor(CASTLE_CENTER.x, CASTLE_CENTER.z)).toBe(0)
    expect(frontierFactor(CASTLE_CENTER.x + CASTLE_SAFE_R - 1, CASTLE_CENTER.z)).toBe(0)
  })
  it('is 1 at or beyond the rim distance', () => {
    expect(frontierFactor(CASTLE_CENTER.x + RIM_DIST, CASTLE_CENTER.z)).toBeCloseTo(1, 5)
    expect(frontierFactor(CASTLE_CENTER.x + RIM_DIST + 50, CASTLE_CENTER.z)).toBe(1)
  })
  it('increases monotonically through the ramp band', () => {
    const a = frontierFactor(CASTLE_CENTER.x + CASTLE_SAFE_R + 5, CASTLE_CENTER.z)
    const b = frontierFactor(CASTLE_CENTER.x + CASTLE_SAFE_R + 15, CASTLE_CENTER.z)
    const c = frontierFactor(CASTLE_CENTER.x + CASTLE_SAFE_R + 25, CASTLE_CENTER.z)
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
  })
})

describe('gearTier', () => {
  it('bands factor into 0/1/2', () => {
    expect(gearTier(0)).toBe(0)
    expect(gearTier(0.39)).toBe(0)
    expect(gearTier(0.5)).toBe(1)
    expect(gearTier(0.71)).toBe(2)
    expect(gearTier(1)).toBe(2)
  })
})
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test -- frontier`
Expected: FAIL — `Cannot find module './frontier'`.

- [ ] **Step 3: Implement `frontier.ts`**

```ts
// src/world/frontier.ts
// One pure scalar that grades the map by distance from the castle: 0 across the
// safe core, ramping to 1 at the island rim. Every distance-driven system (loot
// tier, drop tier, day-threat toughness) reads this — nothing else encodes
// "how far out" a point is. Because it is 0 near the castle, every consumer
// collapses to the pre-frontier behaviour there, so the gradient is purely
// ADDITIVE and the early game is unchanged.
import { CASTLE_CENTER, CASTLE_SAFE_R, ROWS } from './tileMap'

// Distance (tiles) from the castle at which the factor reaches 1 — about the
// outer reach of the biome blobs. Derived from ROWS so it tracks MAP_SCALE
// automatically (Phase 7 grows ROWS). 0.68·ROWS ≈ 73 on the 108-row map.
export const RIM_DIST = ROWS * 0.68

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

/** 0 inside the safe zone, smoothly → 1 at RIM_DIST and beyond. */
export function frontierFactor(x: number, z: number): number {
  const d = Math.hypot(x - CASTLE_CENTER.x, z - CASTLE_CENTER.z)
  const t = Math.min(1, Math.max(0, (d - CASTLE_SAFE_R) / (RIM_DIST - CASTLE_SAFE_R)))
  return smoothstep(t)
}

/** Loot quality band: 0 near, 1 mid, 2 rim (best). Thresholds tuned in dev. */
export function gearTier(factor: number): 0 | 1 | 2 {
  if (factor > 0.7) return 2
  if (factor > 0.4) return 1
  return 0
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test -- frontier`
Expected: PASS (5 assertions).

- [ ] **Step 5: Commit**

```bash
git add src/world/frontier.ts src/world/frontier.test.ts
git commit -m "feat: frontierFactor radial scalar + gear tier bands"
```

---

## Phase 2 — Difficulty nerf (§7, numeric)

### Task 2: Nerf gear stats ×0.7 (`inventoryStore.ts`)

**Files:** Modify `src/world/inventoryStore.ts` (the `ITEM_DEFS` weapon/armor entries).

- [ ] **Step 1: Apply the edits** — exact before → after:

| id | field | from | to |
|----|-------|------|----|
| `sword_iron` | damageBonus | 15 | 11 |
| `sword_gold` | damageBonus | 30 | 21 |
| `axe` | damageBonus | 22 | 15 |
| `stone_maul` | damageBonus | 26 | 18 |
| `leather_armor` | defense | 0.15 | 0.11 |
| `iron_armor` | defense | 0.28 | 0.20 |
| `gold_armor` | defense | 0.40 | 0.28 |

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: PASS (no type errors).

- [ ] **Step 3: Commit**

```bash
git add src/world/inventoryStore.ts
git commit -m "balance: -30% gear stats (weapons + armor)"
```

### Task 3: Nerf leveling + hero upgrades ×0.7

**Files:** Modify `src/world/playerStore.ts`, `src/world/upgradeStore.ts`.

- [ ] **Step 1: `playerStore.ts`** — `HP_PER_LEVEL` 20 → 14; `DAMAGE_PER_LEVEL` 8 → 6. (Base HP 125 / base damage 25 unchanged — the growth is nerfed, not the start.)

- [ ] **Step 2: `upgradeStore.ts`** — reduce hero-power magnitudes and update their `desc` strings to match:

| node | call | from | to | desc → |
|------|------|------|----|--------|
| `hero_hp_1` | bumpMaxHp | 25 | 18 | "+18 max HP." |
| `hero_hp_2` | bumpMaxHp | 50 | 35 | "+35 max HP." |
| `hero_dmg_1` | bumpAttackDamage | 5 | 4 | "+4 attack damage." |
| `hero_dmg_2` | bumpAttackDamage | 10 | 7 | "+7 attack damage." |
| `hero_crit` | setCritChance | 0.2 | 0.14 | "14% chance for a swing to deal double damage." |
| `hero_lifesteal` | setLifesteal | 10 | 7 | "Heal 7 HP every time you slay an ork." |
| `hero_swift` | setMoveSpeedMult | 1.18 | 1.13 | "Move 13% faster." |
| `hero_cleave` | setCleave | 0.3 | 0.21 | "Strikes splash 21% damage to orks beside your target." |

(Economy/defense/arsenal nodes unchanged — they are economy/structure, not player power.)

- [ ] **Step 3: Typecheck + tests**

Run: `npm run build && npm test`
Expected: build PASS; tests PASS (playerStore tests may assert level-up deltas — if any reference 20/8, update them to 14/6 in the same commit).

- [ ] **Step 4: Commit**

```bash
git add src/world/playerStore.ts src/world/upgradeStore.ts src/world/playerStore.test.ts
git commit -m "balance: -30% leveling gains + hero upgrade magnitudes"
```

---

## Phase 3 — New top-tier items + loot pools (§3, partly TDD)

### Task 4: Add rim-only top items (`inventoryStore.ts`)

**Files:** Modify `src/world/inventoryStore.ts` (`ITEM_DEFS`).

- [ ] **Step 1: Add two entries** (authored on the post-nerf curve — clearly above nerfed Golden Blade 21 / Gilded Plate 0.28):

```ts
  // ─── Rim-only top tier (frontier gradient, see frontier.ts) ──
  blade_frost: { id: 'blade_frost', name: 'Frostfang Greatsword', icon: '🗡️', kind: 'weapon', damageBonus: 34, stackable: false },
  dragon_plate: { id: 'dragon_plate', name: 'Dragonscale Plate', icon: '🐉', kind: 'armor', defense: 0.42, armorTint: '#3a6a4a', armorMetal: 0.7, stackable: false },
```

- [ ] **Step 2: Typecheck** — `npm run build` → PASS.
- [ ] **Step 3: Commit** — `git commit -am "feat: rim-only top-tier gear (Frostfang, Dragonscale)"`

### Task 5: Distance-driven loot resolver (`frontier.ts`, TDD)

**Files:** Modify `src/world/frontier.ts`; add tests to `src/world/frontier.test.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// append to src/world/frontier.test.ts
import { rollGear } from './frontier'
describe('rollGear', () => {
  it('returns a low-tier id near the castle', () => {
    const id = rollGear(0.0, 0.5)
    expect(['sword_iron', 'leather_armor', 'bread']).toContain(id)
  })
  it('returns a top-tier id at the rim', () => {
    const id = rollGear(1.0, 0.5)
    expect(['blade_frost', 'dragon_plate', 'sword_gold', 'gold_armor']).toContain(id)
  })
  it('is deterministic for the same (factor, roll)', () => {
    expect(rollGear(1.0, 0.42)).toBe(rollGear(1.0, 0.42))
  })
})
```

- [ ] **Step 2: Run, verify fail** — `npm test -- frontier` → FAIL (`rollGear` undefined).

- [ ] **Step 3: Implement `rollGear`** (append to `frontier.ts`):

```ts
// Tiered loot pools indexed by gearTier(). Items are existing ITEM_DEFS ids
// plus the Phase-4 rim items. Top tier is the ONLY source of the best gear.
const GEAR_POOLS: Record<0 | 1 | 2, string[]> = {
  0: ['sword_iron', 'leather_armor', 'bread'],
  1: ['axe', 'stone_maul', 'iron_armor', 'potion'],
  2: ['blade_frost', 'dragon_plate', 'sword_gold', 'gold_armor'],
}

/** Pick a loot id for a point's frontier `factor`. `roll` ∈ [0,1) selects within
 *  the tier's pool (pass a deterministic per-source value so loot is stable). */
export function rollGear(factor: number, roll: number): string {
  const pool = GEAR_POOLS[gearTier(factor)]
  return pool[Math.min(pool.length - 1, Math.floor(roll * pool.length))]
}
```

- [ ] **Step 4: Run, verify pass** — `npm test -- frontier` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat: distance-driven loot resolver (rollGear)"`

---

## Phase 4 — Wire reward consumers (§3)

### Task 6: Chests roll loot by distance (`Chest.tsx` / `World.tsx`)

**Files:** Modify `src/world/World.tsx` (the chest placements). Read first to locate the chest array/JSX.

- [ ] **Step 1:** Add a helper in `frontier.ts` that resolves a full chest payload from position (deterministic per tile so a chest is stable across reloads):

```ts
// append to frontier.ts
/** Deterministic [0,1) hash of a tile — stable loot per chest across reloads. */
function tileHash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453
  return s - Math.floor(s)
}

/** Loot ids + gold for a chest at (x,z): count + quality climb with distance. */
export function chestLootFor(x: number, z: number): { loot: string[]; gold: number } {
  const f = frontierFactor(x, z)
  const h = tileHash(x, z)
  const items = 1 + Math.round(f) // 1 near, 2 at rim
  const loot: string[] = []
  for (let i = 0; i < items; i++) loot.push(rollGear(f, (h + i * 0.37) % 1))
  const gold = Math.round(15 + f * 60 + h * 20) // ~15–95 by distance
  return { loot, gold }
}
```

- [ ] **Step 2:** In `World.tsx`, replace each `<Chest>`'s hard-coded `loot`/`gold` props with values from `chestLootFor(x, z)` for that chest's tile (compute once per chest; keep any narrative chests if intentionally fixed — otherwise convert all).
- [ ] **Step 3:** Typecheck + tests — `npm run build && npm test` → PASS.
- [ ] **Step 4:** Commit — `git commit -am "feat: chest loot scales with frontier distance"`

### Task 7: Day mob/animal drops scale with distance

**Files:** Modify the kill→drop path. Read `src/world/orkStore.ts`, `src/world/animalStore.ts`, `src/world/pickupStore.ts`, and `src/world/Character.tsx` (swing/kill) to locate where a slain day-creature emits loot.

- [ ] **Step 1:** At the day-creature death site (NOT night wave orks — gate on whether the ork belongs to a wave vs a camp; camp/day orks + wild animals only), roll a drop:

```ts
import { frontierFactor, rollGear } from './frontier'
// on a day-creature kill at (x,z):
const f = frontierFactor(x, z)
if (Math.random() < 0.10 + 0.35 * f) {        // 10% near → 45% at rim
  const id = rollGear(f, Math.random())
  // spawn a ground pickup of `id` at (x,z) via the existing pickup/orb system
}
```

(Use the existing ground-pickup spawn used elsewhere — `pickupStore`/`Pickups.tsx`. If night-wave orks already drop nothing, leave them; only add to day creatures so night balance is untouched.)

- [ ] **Step 2:** Typecheck + tests — `npm run build && npm test` → PASS.
- [ ] **Step 3:** Commit — `git commit -am "feat: day mob/animal drops scale with frontier distance"`

---

## Phase 5 — Danger gradient (§4)

### Task 8: Day-threat toughness scales with distance

**Files:** Modify wild-animal spawn (`animalStore.ts`/`WildAnimals.tsx` where `createAnimal` sets hp) and camp-ork spawn (`OrkCamp.tsx` / `orkStore.ts` where camp guard orks get hp). Read to find the hp/damage assignment.

- [ ] **Step 1:** At spawn, sample once and scale hp + damage by `1 + k·factor`, `k = 1.0` (rim ≈ 2×):

```ts
import { frontierFactor } from './frontier'
const tough = 1 + 1.0 * frontierFactor(spawnX, spawnZ)
hp = Math.round(baseHp * tough)
// and where the creature deals damage, multiply its base contact/attack damage by `tough`
// (store `tough` on the creature state if damage is applied elsewhere).
```

- [ ] **Step 2:** Confirm night wave orks are unaffected (their spawn path in `waveStore`/wave spawner must NOT call this — verify by reading the wave spawn site).
- [ ] **Step 3:** Typecheck + tests — `npm run build && npm test` → PASS.
- [ ] **Step 4:** Commit — `git commit -am "feat: day threats scale toughness with frontier distance"`

---

## Phase 6 — Far-edge landmark beacons (§5)

### Task 9: Relocate landmarks to biome far edge + rim cache chest

**Files:** Modify `src/world/landmarks.ts` (coords), `src/world/World.tsx` (landmark + a guaranteed cache chest at each).

- [ ] **Step 1:** For each landmark, set its coord to its biome's outer rim — `regionByBiome(biome)` centre pushed along the away-from-castle direction by ~0.8·r:

```ts
// derivation (compute the new LANDMARKS coords once, hard-code the results):
// dir = normalize(regionCentre - CASTLE_CENTER); pos = regionCentre + dir * 0.8 * r
```

Update `LANDMARKS` entries to the computed far-edge tiles (snap to integers; keep `r` footprints).

- [ ] **Step 2:** In `World.tsx`, ensure each relocated landmark has a `<Chest>` beside it; that chest uses `chestLootFor(x,z)` (Task 6) → top-tier since it's at the rim.
- [ ] **Step 3:** Tests — `npm run build && npm test` (reachability must still find the landmark tiles) → PASS.
- [ ] **Step 4:** Verify placement — `npm run dev` running, then `node scripts/shot-world.mjs out-beacon.png <x> <z>` for one beacon; eyeball it sits on land at the biome edge.
- [ ] **Step 5:** Commit — `git commit -am "feat: landmark beacons + rim cache chests at biome far edges"`

---

## Phase 7 — Map rescale (§2, the risky bulk)

**Approach — resample, not hand-rescale.** Introduce `MAP_SCALE` and two transforms in `tileMap.ts`:

```ts
export const MAP_SCALE = 1.4
const BASE_COLS = 144, BASE_ROWS = 108           // pre-scale dims
export const COLS = Math.round(BASE_COLS * MAP_SCALE)   // 202
export const ROWS = Math.round(BASE_ROWS * MAP_SCALE)   // 151
export const CENTER_X = COLS / 2, CENTER_Z = ROWS / 2
const BASE_CX = BASE_COLS / 2, BASE_CZ = BASE_ROWS / 2

/** new grid coord → old/base-map coord (generation samples here). */
export function toBase(x: number, z: number): [number, number] {
  return [BASE_CX + (x - CENTER_X) / MAP_SCALE, BASE_CZ + (z - CENTER_Z) / MAP_SCALE]
}
/** old/base anchor coord → new grid coord (place hand-authored entities here). */
export function fromBase(x: number, z: number): [number, number] {
  return [CENTER_X + (x - BASE_CX) * MAP_SCALE, CENTER_Z + (z - BASE_CZ) * MAP_SCALE]
}
```

Generation evaluates existing noise/coast/river/region logic in **base space** (so the map keeps its exact shape, just bigger). Height is sampled **quantized to the base grid** so Δ≥2 cliffs and the climbable ramp survive the stretch (continuous sampling would flatten them). Hand-authored anchors convert base→new via `fromBase`.

### Task 10: Wire the transforms into generation

**Files:** Modify `src/world/tileMap.ts`.

- [ ] **Step 1:** Add `MAP_SCALE`, `BASE_*`, `toBase`, `fromBase` (above). Keep `CASTLE_CENTER = { x: CENTER_X, z: CENTER_Z }` and `CASTLE_SAFE_R = 18` (absolute — note: 18 is now in NEW tiles, so the safe core stays the same absolute size).
- [ ] **Step 2:** In `buildTiles()`, for each new tile `(x,z)`: `const [bx, bz] = toBase(x,z)`. Compute biome from the existing region/coast logic at `(bx,bz)` (continuous → smooth edges). Compute height from the existing height logic at the **base-tile** `(Math.round(bx), Math.round(bz))` so each base tile becomes a flat MAP_SCALE-wide plateau (preserves cliffs/ramp). Leave `REGIONS`, `riverX/riverZ`, noise constants UNCHANGED — they now operate in base space.
- [ ] **Step 3:** Update `regionByBiome`/`scatterInRegion` consumers: region centres are base-space; convert to new space with `fromBase` where used for entity placement (these helpers should return NEW-space coords — apply `fromBase` to the centre and `* MAP_SCALE` to `r`).
- [ ] **Step 4:** Build — `npm run build` → PASS.

### Task 11: Convert hand-authored anchor tables to new space

**Files:** `roads.ts` (ROUTES), `obstacles.ts` (ORK_CAMPS, RESERVED), `landmarks.ts`, `cityPlan.ts` (gates/castle), `World.tsx` literals.

- [ ] **Step 1:** Castle stays centred and absolute size — verify `cityPlan` derives from `CENTER_X/Z` (re-centre only; do NOT scale the castle footprint). Gate slots: re-derive from the (unchanged-size) castle around the new centre.
- [ ] **Step 2:** `ORK_CAMPS`, `LANDMARKS`, road `ROUTES`, `RESERVED` boxes, `DELIBERATE_LAKE`, chest coords: wrap each base coordinate in `fromBase(...)` (snap to integers). These tables were authored in the 144×108 space, so `fromBase` lands them on the same terrain feature in the bigger map.
- [ ] **Step 3:** Build — `npm run build` → PASS.

### Task 12: Reachability + visual gate

- [ ] **Step 1:** Run the map reachability + ramp tests — `npm test`. Expected: PASS. If `mapReachability.test.ts` references old COLS/ROWS literals, update them to import the constants. If a camp/landmark is unreachable, nudge that anchor's base coord and re-run (do NOT relax the test).
- [ ] **Step 2:** Visual check with the dev server up:

```bash
node scripts/shot-world.mjs shot-center.png <CENTER_X> <CENTER_Z>
node scripts/shot-world.mjs shot-snow.png <snow new x> <snow new z>
node scripts/shot-world.mjs shot-rock.png <rock new x> <rock new z>
```

Eyeball: island shape intact, mountains still have cliffs + a ramp, biomes bigger, roads reach gates, no water-locked content.

- [ ] **Step 3:** Re-tune `RIM_DIST` if needed (it auto-scales via ROWS, but confirm factor≈1 lands near the rim content).
- [ ] **Step 4:** Commit — `git commit -am "feat: enlarge island 1.4x via MAP_SCALE resample (biomes bigger, cliffs preserved)"`

---

## Self-review notes (spec coverage)

- §1 frontierFactor → Task 1. §2 rescale → Tasks 10–12. §3 best gear + new items → Tasks 4,5,6,7. §4 danger → Task 8. §5 beacons → Task 9. §6 tests → Tasks 1,5 + reachability Task 12. §7 nerf → Tasks 2,3.
- `frontierFactor`, `gearTier`, `rollGear`, `chestLootFor`, `toBase`, `fromBase` names are used consistently across tasks.
- Night-wave balance untouched: enforced in Tasks 7 + 8 (day creatures only) and verified in Task 8 Step 2.

## Final gates
- `npm run build` (tsc -b) — the real correctness gate, after every phase.
- `npm test` — pure logic + reachability.
- `npm run dev` / `npm run shot` — terrain look + difficulty feel (not unit-testable).
