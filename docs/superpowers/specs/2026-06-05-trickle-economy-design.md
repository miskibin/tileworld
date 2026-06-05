# Trickle Economy — keeping exploration meaningful past night 3

**Date:** 2026-06-05
**Status:** approved design, ready for implementation plan

## Problem

The run is 8 nights (night 8 = boss). Today a player can do everything meaningful
by ~night 3, after which there is no reason to leave the castle:

- **Wild resources are one-shot.** Chests open once and stay empty; forage plants
  (12 herbs + 10 apples) are collected once and gone. A single early sweep of the
  map permanently stocks the player with food and dumps a one-time gold windfall.
- **Over-supply per trip.** 22 forage food is grabbable in two trips — far more than
  a day needs — so there is never a reason to resupply.
- **The upgrade wall arrives early.** Kill-gold (grunt 8 / scout 6 / berserker 14 /
  shaman 18, ×1.5 bounty) is the dominant income and scales up with later waves. On
  top of that, the nights 1-3 chest+forage windfall buys all the cheap, high-impact
  upgrade nodes at once. The meaningful tree feels finished by night 2.

## Goal

Stretch meaningful progression (upgrade purchases + resource hunts) to roughly
**night 6-7**, so the daytime free-roam window stays a real "where do I go today?"
choice for most of the run.

## Principle

**Every wild resource becomes a flow, not a one-shot:** a small live stock that
**respawns over time**. The map never gets swept clean, so each day there is a
fresh batch to collect; loot and gold income spread across the whole run instead of
landing as one early windfall, which slides the upgrade wall outward on its own.

No new currencies. No new systems. Reuse the existing forage/chest/store machinery.

## Decisions (confirmed)

- **Day length stays 180s** (`PREP_DURATION` unchanged). The trickle changes carry
  the pacing; revisit only if a playtest still finishes early.
- **Ore stays one-shot** (`oreStore` unchanged). The deliberate high-HP single dig
  for stone is left as-is; the rock biome remains a one-time stone run.

## Changes

### 1. Forage — fewer live, respawn, pushed to the edges

`HerbPlants.tsx`, `AppleTrees.tsx`, `ForageField.tsx`, `forageStore.ts`,
`tileMap.ts` (`scatterInRegion`).

- **Live count down:** herbs 12 → **6**, apples 10 → **5**. This is the real
  per-trip cap.
- **Respawn:** a gathered plant regrows after a tunable delay (**default 90s**).
  Visually it collapses to a sprout on pickup and pops back to full when it
  respawns. The live-count reduction is the primary lever; the respawn delay
  controls how fast the field refills for the next visit — tune it **up** if
  players camp-farm a field within one day.
- **Mechanism:** the `ForageStore` records a `collectedAt` time per plant and
  `active()`/visibility derive from `elapsed - collectedAt >= RESPAWN`. The respawn
  clock is driven inside the existing `ForageField` `useFrame` (which already has
  the R3F clock and already honors the `isFrozen()` gate), so hard-pause / modals
  do not advance regrowth. A respawned plant is the same node (no id churn).
- **Placement to the frontier:** `scatterInRegion` changes from a filled disc
  (radius `0.78·r`) to an **annulus `0.55–0.95·r`**, biasing plants to the biome's
  outer rim — which sits near the map edges around the centred castle. Keep the
  golden-angle spiral; just remap the radius. Deterministic (no `Math.random`),
  so the map-reachability test and `findSpawnNear` snapping are unaffected in kind.

### 2. Chests — split treasure vs cache, caches respawn

`World.tsx` (`CHESTS` table), `Chest.tsx`.

- **Tag every chest `kind: 'treasure' | 'cache'`.**
  - **treasure** = unique gear (iron/gold/leather/iron armor, swords, stone_maul,
    mercenary_contract, goat_charm) and the 5 deep-biome landmark chests. These are
    **one-shot** and stay gone — the exploration trophy that does not trivialise the
    economy.
  - **cache** = gold + consumable food (bread, potion, feast, croc_steak,
    elk_jerky, venom, fur). These **refill after ~1 day (default 165s)** and can be
    looted again. Cache gold stays small (current 5-14) so respawn does not flood
    income.
- **Respawn mechanism:** `Chest` tracks an `openedAt`; once `kind === 'cache'` and
  `elapsed - openedAt >= CACHE_RESPAWN`, the chest re-closes and becomes lootable
  again (lid animation reverses; gold + loot re-granted on the next open). Treasure
  chests ignore the timer. The timer advances in the chest's existing `useFrame`,
  gated by `isFrozen()`.
- **Push caches toward the edges:** nudge cache chest positions outward toward the
  coast so the recurring daily loot run hugs the map perimeter. Treasure chests keep
  their hand-placed landmark spots. (Exact coords decided during implementation;
  keep each on valid land — `Chest` already auto-snaps.)

### 3. Upgrade wall — handled indirectly (no cost change yet)

`upgradeStore.ts` — **unchanged in this pass.**

Flattening the chest+forage windfall (changes 1-2) removes the early gold/food
spike that lets the player buy every cheap-meaningful node by night 2. Income then
tracks kill-gold plus a steady cache trickle, so meaningful purchases spread across
more nights.

**Second pass, only if a playtest still finishes too early:** bump
`UPGRADE_COST_SCALE` 1.6 → 1.8. Cheapest-change-first; not part of this plan.

## Out of scope

- New resource currencies (explicitly rejected).
- Ore respawn / rebalance (kept one-shot).
- Day-length change (kept 180s).
- Upgrade cost changes (deferred to a tuning pass).
- Any change to wave counts/HP, shop, or combat numbers.

## Testing

- **`forageStore.test.ts`** (extend): a collected plant is absent from `active()`
  before the respawn delay and present again after; `collect()` of an
  already-collected-but-respawned plant succeeds again; reset clears timers.
- **`scatterInRegion`** (map-reachability test already covers walkability): add a
  check that scatter points fall within the `0.55–0.95·r` annulus of the region.
- **Chest cache respawn:** if a small pure-logic seam is extracted (e.g. an
  `isCacheReady(openedAt, now)` helper), unit-test it. Otherwise this is verified in
  the browser (`npm run dev`): open a cache, confirm it re-closes and re-loots after
  the delay; confirm treasure stays empty.
- **`npm run build`** (tsc) is the correctness gate after each step.
- **Manual:** play nights 1-4, confirm food no longer over-stocks in one trip,
  caches refill day-to-day, treasure stays one-shot, and the upgrade tree is not
  finished by night 3.

## Tunable constants (single source each, for fast iteration)

- `FORAGE_RESPAWN` (default 90s) — forage regrow delay.
- herb live count `6`, apple live count `5` — in each config's `spawns()`.
- annulus inner/outer `0.55 / 0.95` — in `scatterInRegion`.
- `CACHE_RESPAWN` (default 165s) — chest cache refill delay.
