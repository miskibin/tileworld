# Map Expansion + Radial Frontier Gradient — Design

Date: 2026-06-05

## Goal

Make the world bigger and give the player a reason to push outward: the farther
from the castle, the deadlier the wilderness **and** the better the loot — with
top-tier gear obtainable *only* at the rim. At the same time, tighten overall
difficulty: the game is currently too easy.

Two structural pillars + a balance pass:

1. **Rescale the island bigger** (same shape/arrangement, just larger).
2. **Radial frontier gradient** — a single distance-from-castle scalar drives
   loot quality, gear tier, and day-threat toughness.
3. **Difficulty nerf** — cut player power growth ~30% (gear + leveling +
   hero upgrades) so the new harder rim and its gear actually matter.

## Non-goals

- No new biome *types*. The five existing biomes (snow NW · desert NE · rock E ·
  forest SW · swamp S) stay; they just get bigger and gain a danger/reward ramp.
- Night wave balance is **not** touched. Waves assault the castle (the center),
  so the radial danger gradient deliberately does not apply to them.
- No fast-travel / mounts / day-length changes. The user explicitly did not flag
  traversal time as a constraint; the only hard usability rule is **"no dead
  early game"** (see §1), which the design satisfies structurally.

---

## §1 — Core: `frontierFactor(x, z)` — new module `src/world/frontier.ts`

A single pure function is the backbone. Everything reads it; nothing else
encodes "how far out" a point is.

```
frontierFactor(x, z):
    d = distFromCastle(x, z)                       // hypot to CASTLE_CENTER
    t = clamp((d - CASTLE_SAFE_R) / (RIM_DIST - CASTLE_SAFE_R), 0, 1)
    return smoothstep(t)                            // 0 at safe-zone edge, 1 at rim
```

- `RIM_DIST` is a tunable constant ≈ the outer reach of the biome blobs (the
  largest scaled region edge). Tune so factor hits ~1 around where the farthest
  biome content sits, not literally at the water.
- `smoothstep` gives a gentle near-castle ramp and a steep payoff toward the rim.

**Why this guarantees "no dead early game":** near the castle `factor ≈ 0`, so
every consumer (loot, drops, toughness) collapses to *today's* behavior. The
gradient is purely **additive** — distance *adds* richness/danger, it never
relocates existing near-castle content outward. Early game is byte-for-byte the
current experience.

**Unit test** (`frontier.test.ts`, pure logic):
- `factor === 0` inside the safe zone; `=== 1` at/beyond `RIM_DIST`.
- Strictly monotonic increasing with distance in the ramp band.
- Clamps below 0 / above 1.

---

## §2 — Pillar 1: rescale the island (`MAP_SCALE = 1.4`)

Add `MAP_SCALE = 1.4` to `tileMap.ts`. New grid ≈ **200 × 150** (from 144×108);
area ~2×. Per the perf investigation this is cheap: one-time load/RAM cost,
~flat per-frame FPS (post-processing + shadow pass are map-size-independent;
terrain/scatter are instanced).

### The scaling rule (applied uniformly)

> **Scale positions about the map center, scale radii, and scale mountain `peak`
> heights — all by `MAP_SCALE`. Scale procedural-noise frequencies by
> `1/MAP_SCALE`. Keep the castle footprint and `CASTLE_SAFE_R` ABSOLUTE.**

- A shared helper `scaleAboutCenter(x, z)` (in `tileMap.ts`, exported) keeps the
  transform DRY and is reused by every coordinate table.
- **Castle + safe-zone stay absolute** → the core plays identically; only the
  surrounding wilderness deepens. The biome blobs move farther out *and* grow,
  opening a wider grass frontier between safe-zone and biomes.
- **Mountains:** scaling `peak` together with `r` keeps per-tile height deltas
  roughly constant, so the rock/snow massifs **keep their Δ≥2 cliff faces and
  single climbable ramp**. (Naively growing only `r` would stretch the steep
  core across more tiles, flattening every face into a walkable slope — this
  rule avoids that.) The ramp-feasibility invariant `r/(peak-2) ≳ 1.6` is
  preserved because both scale together.
- **Noise frequency / `1/MAP_SCALE`:** sampling the coast/river/wobble noise at
  the stretched frequency keeps the coastline and rivers the *same shape* at the
  larger size, instead of producing finer, busier detail.

### Coordinate tables to migrate (all via `scaleAboutCenter` + radius/peak scale)

| File | What scales |
|------|-------------|
| `tileMap.ts` | `COLS`/`ROWS` (derived from `MAP_SCALE`), `REGIONS` centers + `r` + `peak`, `riverX`/`riverZ` formulas, `DELIBERATE_LAKE`, noise frequencies, `inMountain` wobble |
| `cityPlan.ts` | gate slots / castle anchor (castle footprint itself stays absolute; only its center placement re-derives from the new center) |
| `roads.ts` | `ROUTES` waypoints (re-anchored outward so gate→biome trunks still reach) |
| `obstacles.ts` | `ORK_CAMPS`, `RESERVED` boxes (hamlet/markets) |
| `landmarks.ts` | `LANDMARKS` (also relocated to far edge — see §5) |
| `World.tsx` | chest positions + any literal grid coords |

### Risk + gate

This coordinate migration is the **bulk of the work and the error-prone part**
(roads were hand-traced to stay on land; rivers/coast are noise-driven). Gates:

- `mapReachability.test.ts` must stay green (flood-fill from castle reaches all
  intended content; no biome walled off).
- Ramp-feasibility / `npm run inspect`-style checks for the mountains.
- A manual `npm run dev` pass to eyeball the rescaled terrain (terrain look is
  not unit-testable).

---

## §3 — Pillar 2a: reward gradient (best gear gated to the rim)

There is currently no gear *tier* system — gear is discrete `ITEM_DEFS` entries
with `damageBonus` (weapons) / `defense` (armor). So the gradient controls
**which items appear** as a function of `frontierFactor` at the loot's location.

### New top-tier items (`inventoryStore.ts`)

Add ~2 items above the current best, so the rim has a fresh carrot rather than
just relocating shop gear. Tuned to the *post-nerf* curve from §7 (so they read
as a real reward, not a return to current power):

- A top weapon (e.g. `blade_frost` / `runed_greatsword`) — `damageBonus` above
  the post-nerf Golden Blade.
- A top armor (e.g. `dragon_plate`) — `defense` above the post-nerf Gilded Plate.

(Exact ids/numbers finalized in §7's rebalanced table during planning.)

### Distance-driven loot selection (`frontier.ts` helper + consumers)

A helper picks a gear id from a tiered pool by `frontierFactor`:

- `factor < ~0.4` → low tier (bread, iron sword/armor) — today's near loot.
- `~0.4–0.7` → mid tier (axe, stone maul, iron cuirass).
- `> ~0.7` → top tier (Golden Blade, Gilded Plate, **new §3 items**) + larger
  gold. The rim is the *only* source of top gear.

Consumers:
- **Chests** (`World.tsx` `loot={[...]}`): loot resolved from the tier pool at
  the chest's `frontierFactor` instead of hand-authored fixed arrays. (Beacon
  rim caches from §5 sit in the top band.)
- **Day mob/animal drops:** drop chance + tier scale with `frontierFactor` at
  the kill location (exact drop hooks in `orkStore`/`animalStore`/`pickupStore`
  pinned during planning).

---

## §4 — Pillar 2b: danger gradient (risk = reward)

Day-time threats scale with distance; night waves do not.

- **Wildlife predators + camp orks:** on spawn, multiply HP and contact/attack
  damage by `1 + k · frontierFactor(spawnX, spawnZ)` with **`k = 1.0`** → rim
  threats ~**2× tougher** than near-castle. Applied where these entities read
  their config (animal config / camp ork spawn), sampled once at spawn.
- **Night waves: unchanged.** They march on the castle (center, factor≈0);
  scaling them would wreck the tuned wave curve in `waveStore.ts`.

The hazard biomes (swamp poison/slow) already exist and read as stake — left
as-is; the rim multiplier layers difficulty on top of them.

---

## §5 — Far-edge landmark beacons (in)

Relocate each biome's signature landmark (`LANDMARKS`: FrozenSpire, SunkenPyramid,
StandingStones, GiantDeadTree, RuinedShrine) to its biome's **far edge** (high
`frontierFactor`), and place a **guaranteed rim cache chest** at each. This gives
a legible "treasure lives out here" anchor and a concrete destination per biome,
reusing the existing landmark + chest systems (cheap). Landmark blockers and
scatter reservations already track `LANDMARKS`, so moving the coords is enough.

---

## §7 — Difficulty nerf (~−30% player power growth)

The game is too easy. Cut the magnitude of player power gains by ~30% so the
bigger, harder map and its rim gear matter. Lower numbers, same systems.

- **Gear stats (`inventoryStore.ts` `ITEM_DEFS`):** all `damageBonus` and
  `defense` values × 0.7 (rounded sensibly). New §3 top items are authored
  directly on the post-nerf curve.
- **Leveling (`playerStore.ts`):** `HP_PER_LEVEL` 20 → 14, `DAMAGE_PER_LEVEL`
  8 → 6 (≈−30%). Base HP/damage at level 1 unchanged (the *growth* is nerfed,
  not the start).
- **Hero-power upgrades (`upgradeStore.ts`):** any hero offensive/defensive
  upgrade magnitudes (e.g. crit chance, cleave fraction, hero stat boosts) × 0.7,
  so "upgrades less meaningful" holds across the board. (Structural
  wall/tower/gate upgrades are defensive economy, not player power — left as-is
  unless they read as part of the "too easy" feel during the dev pass.)

This pass is numeric only — no system changes — so it's low-risk and easy to
re-tune. Final numbers verified by a `npm run dev` difficulty pass.

---

## §6 — Testing summary

| Test | Type | Covers |
|------|------|--------|
| `frontier.test.ts` | unit (pure) | factor shape, clamps, monotonicity |
| loot-tier roll test | unit (pure) | determinism + near-vs-far tier distribution |
| `mapReachability.test.ts` | unit (existing) | rescale didn't wall off any content |
| ramp-feasibility / inspect | headless | mountains still climbable post-scale |
| `npm test` | suite | stores/pathfinding/waves unaffected |
| `npm run build` | typecheck | the real correctness gate |
| `npm run dev` | manual | terrain look + difficulty feel (not unit-testable) |

## File-touch summary

- **New:** `src/world/frontier.ts`, `src/world/frontier.test.ts`.
- **Pillar 1 (rescale):** `tileMap.ts`, `cityPlan.ts`, `roads.ts`, `obstacles.ts`,
  `landmarks.ts`, `World.tsx`.
- **Pillar 2 (gradient):** `frontier.ts` consumers in `World.tsx` (chests),
  `orkStore`/`animalStore`/`pickupStore` (drops), animal config + camp ork
  spawn (toughness).
- **§3 / §7 (items + balance):** `inventoryStore.ts`, `playerStore.ts`,
  `upgradeStore.ts`.

## Open tuning knobs (set during implementation, verified in dev)

- `MAP_SCALE` = 1.4 (approved).
- `RIM_DIST`, smoothstep band edges.
- Tier band thresholds (0.4 / 0.7) + pool contents.
- Danger `k` = 1.0 (approved, rim ~2×).
- Exact post-nerf stat numbers (§7) + new top-item stats (§3).
