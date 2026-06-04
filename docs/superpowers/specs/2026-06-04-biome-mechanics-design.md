# Biome Mechanics — Design Spec

**Date:** 2026-06-04
**Status:** implemented (slices 0–5) — 2026-06-04. Build + 143 unit tests green; models pass
`npm run inspect`; biome features verified by screenshot. Camp-clear → captive-free path is sound
by construction + `freeCaptive` is unit-tested, but the full clear→free flow wants a manual playtest.

## Problem

The game loses tension after ~8 nights. The day is a 120s defend-breather, not an
exploration window; the map's five wilderness biomes are wallpaper. Goal: give the
day a meaningful **choice** — "where do I go today?" — by making each biome answer a
different player need that feeds the night.

## Core idea

Each biome is defined by a **distinct verb** (not just a different loot table) and
feeds a **different upgrade-tree branch / survival need**. The day becomes a timed
free-roam window long enough for ~one expedition, so the player must choose.

The upgrade tree already has 4 branches (economy / defense / hero / arsenal); most of
the per-biome reward channels (hunting animals, biome chests, trader recruit) already
exist. Genuinely new work is small: **3 new interactions** (mine, rescue, forage), **2
new carrier systems** (stone resource, captive rescue), a **free-roam timed day**, and
**enlarging the two undersized mountain biomes**.

## Biome map

| Biome | Verb (new?) | Yields | Feeds | Guard |
|---|---|---|---|---|
| Forest SW | hunt (exists) + **rescue** (new) | meat/XP + heirs | lives + hero | ork camp |
| Rock E | **mine stone** (new) | `stone` | defense (walls/towers) | golem |
| Snow NW | loot chests (exists) + **rescue** (new) | rare weapons + heirs | arsenal + lives | polar_bear, cold |
| Desert NE | trade + recruit (exists) + **rescue** (new) | militia + XP | hero + trade | scorpion |
| Swamp S | **forage herbs** (new, hazard) | potions/buffs | night survival | bog_croc, poison |

Verbs: hunt / mine / loot / trade / forage / rescue — six distinct activities.

## New systems

### 1. `stone` resource (`resourceStore.ts`)
- Hand-rolled module store matching `playerStore` shape: `stone` counter, `addStone`,
  `spendStone`, `getStone`, `subscribeStone` (notify on discrete change).
- Earned by hitting **ore boulders** in the rock biome (a new mineable prop that takes
  hits like an ork and drops stone on break).
- Spent in `upgradeStore`: defense nodes (`def_walls`, `def_gate`, `def_towers`, …) gain
  a stone cost alongside gold. `canBuy`/`purchase` check both. HUD shows stone count.

### 2. Captive rescue (primary heir source)
- Cages with captive villagers at the 3 ork camps (forest/snow/desert).
- Freeing a captive (camp cleared or cage interacted) creates a castle militia villager
  via the existing `createVillager` path (reuse the `recruitTrader` muster/guard logic),
  joining the succession lives pool. **Main way to grow the heir pool.**
- The existing `eco_district` house-spawn stays (user instruction: keep tree NPC buying).

### 3. Free-roam timed day + bell
- Decouple time-of-day from wave phase (today `DayNight.tsx` pins NIGHT_T during 'wave',
  DAY_T otherwise). Prep becomes a real timed day (~3–5 min) the player roams.
- A **bell/beacon** at the castle lets the player start the night early when ready.
- Timed day = forced choice (can't visit all 5 biomes in one day). Keep siege-at-keep
  night unchanged.

### 4. Swamp forage + hazard
- Herb pickups in the swamp → consumable potions/buffs (reuse the existing buff items:
  fur/venom/goat_charm pattern, shopCatalog buffs).
- Swamp terrain applies a slow (and/or poison tick) — the stake that makes the reward risky.

## Map enlargement (slice 0)

**Not** a grid (`COLS/ROWS`) change — that shifts `CENTER` while camps/villages/roads/
bridges/landmarks use absolute coords, decentering everything. Instead grow the two
undersized mountain blobs in `REGIONS` (snow r18, rock r18; the flat biomes are already
r32–34):
- snow: r 18→26, peak 13→16 (ramp feasibility 26/14 = 1.86 ≥ 1.6 ✓)
- rock: center nudged SE off the trader village, r 18→24, peak 13→15 (24/13 = 1.85 ✓)

Gate: `mapReachability.test.ts` (flood-fill castle → every biome foot + mountain summit)
and `campPlacement.test.ts` (camp footprints stay flat) must stay green; verify with
`npm test` and a screenshot.

## Build order (each slice: `npm run build` + `npm test` + screenshot before next)

0. Map: enlarge snow + rock blobs.
1. `stone` resource + mineable ore boulders + defense stone-cost gating.
2. Captive rescue at ork camps → heirs.
3. Free-roam timed day + bell.
4. Swamp forage + hazard terrain.
5. Polish payoffs (snow chest weapons, biome legibility).

## Testing reality

This stack has no headless gameplay e2e (R3F/WebGL). "E2e" here =
- `npm run build` — tsc typecheck gate across all tsconfigs.
- `npm test` — vitest pure-logic (stores, rescue, gating, map reachability).
- `npm run inspect <Model>` — headless structure check for new models (cage, ore boulder, herb).
- `npm run shot` — Playwright screenshot (headless `screenshot` tool can't composite WebGL).
- Manual browser via dev server for full gameplay feel.
