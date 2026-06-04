# Trader Village — Design

Date: 2026-06-03

## Goal

Around day 4 the whole map is explored and the player needs **daytime activities that
don't require fighting**. Add a **market settlement of independent merchant NPCs** in the
NE explored coastal area. The player can:

- **Trade** with traders for gold (reusing the existing shop goods), and
- **Recruit** a trader — by spending a rare drop — which **converts that trader into a
  permanent castle warrior** (a guard + a succession life), marked by distinct armor.

Traders are **independent**: they never fight, are invulnerable, are ignored by orks, and
are **not** part of the lives pool (the hero's soul never jumps into a trader on death).

## Decisions (from brainstorming)

| Question | Decision |
|---|---|
| What do traders sell? | Same as the existing shop (`bread/potion/feast` + Arsenal-unlocked weapons). |
| Recruit cost | A rare item dropped by orks / chests (a "Mercenary Contract" 📜). |
| What does a recruited trader become? | A warrior "like other villagers", with **distinct armor**. Walks to the castle, becomes a guard, joins the lives pool. |
| Trader safety pre-recruit | Invulnerable + ignored by orks. Fully passive. |
| Architecture | **A** — separate `traderStore`; converge into `villagerStore` only on recruit. |
| Size | A couple of traders, each given **real buildings** (a small market settlement, not just tents). |

## Architecture — Approach A (separate store, converge on recruit)

Traders live in their **own array** in a new `traderStore`. Because they are never in
`villagers[]`, they are **structurally incapable** of being a succession heir or a guard —
no defensive filtering required anywhere. Conversion to a villager happens **only** at
recruit time.

### Components

**`src/world/traderStore.ts`** (new) — villagerStore-shaped subset.
- `TraderState`: `id, x, y, z, facing, state ('idle'|'wander'|'tend'), stateSince, stateUntil,
  targetX, targetZ, homeX, homeZ, doorX, doorZ, gardenX, gardenZ, seed, paletteIndex,
  path, pathIndex, pathRecomputeAt`.
- No `hp/maxHp/downed/isGuard/attack*` fields — traders never fight or fall.
- `createTrader`, `getTraders`, `subscribeTraders`, `removeTrader`, `resetTraders`,
  `nearestTrader(x, z, maxDist)`.

**`src/world/Trader.tsx`** — `TraderView` + `TraderCrowd`.
- Distinct merchant model (apron, satchel, headwrap, own palette) — built with the
  **model-smith** skill and registered in `scripts/inspect-model.tsx`.
- Reuses the villager wander/tend state machine (shared via a small helper, no guard path).
- Per-frame contract: `isFrozen()` gate → `isCulled` hide → wander/tend → face the player
  when near. Mutates store state directly (hot path, no notify).
- Interaction handled by `TraderCrowd` (single window key listener, reads `nearestTrader`):
  - In range + **E** → `openShop({ title: trader name, items: buildShopItems() })`.
  - In range + holds a contract + **R** → `recruitTrader(trader)`.
  - 3D floating `<Text>` prompts (no DOM HUD).

**`src/world/TraderVillage.tsx`** — places the market in a reachable NE spot.
- A few **buildings** (reuse `House.tsx` recolored + a `Shop`-style market stall), a market
  prop or two, gardens. `createTrader` per stall. Registers AABB house blockers under owner
  `'trader'`; clears them + `resetTraders()` on unmount.
- Position parameterized; default coords chosen on reachable NE grass (verify against
  `mapReachability.test.ts` expectations / `findSpawnNear`).

**`src/world/shopCatalog.ts`** (new) — lift `buildShopItems()` + `buy()` out of `Shop.tsx`
so `Shop` and `Trader` share one catalog source. `Shop.tsx` imports from it (no behavior
change).

### Recruit token

- New `ITEM_DEFS` entry `mercenary_contract` (📜) with a **new `ItemKind: 'token'`**.
  `activateSlot`/`selectSlot` ignore tokens (can't be eaten or equipped); `stackable: true`.
  Rides the existing `spawnPickup` → `Pickups` → `addItem` plumbing.
- `inventoryStore` gains `hasItem(id)` and `consumeItem(id, count = 1): boolean`.
- Dropped rarely on ork kill (`orkStore` kill path) and seeded into some chest `loot` arrays.

### Recruit conversion — `recruitTrader(t: TraderState): boolean`

Lives in a small pure module (e.g. `src/world/recruit.ts`) so it's unit-testable:

1. `if (!consumeItem('mercenary_contract')) return false`.
2. Pick a castle muster anchor inside `CASTLE_BOUNDS` (e.g. near the farm/courtyard).
3. `createVillager({ x: t.x, z: t.z, homeX/homeZ = muster, doorX/doorZ, gardenX/gardenZ,
   facing, seed, paletteIndex, recruited: true })`. Because the home is inside the castle,
   `createVillager` sets `isGuard = true` automatically.
4. `removeTrader(t.id)`.
5. SFX + floating text. Returns true.

The new villager spawns where the trader stood but its home is the castle, so its existing
schedule paths it home — it **walks across the map** and starts defending on arrival.

**`villagerStore`** — add `recruited: boolean` to `VillagerState` (default false in
`createVillager`). **`Villager.tsx`** — recruited villagers get a distinct **tabard/armor
tint** so the player's mercenaries read apart from native townsfolk.

### Wiring & reset

- `World.tsx`: mount `<TraderVillage/>` + `<TraderCrowd/>` inside the offset group.
- Run-reset path: call `resetTraders()` alongside the other store resets.

## HUD

None new. The recruit/trade prompts are 3D `<Text>` (like `Shop`/`Chest`); the contract
shows in the existing 8-slot hotbar. (Matches the minimal-HUD preference.)

## Edge cases

- Traders never fight, never fall; orks ignore them (separate array, no hostile registration).
- Recruiting empties the village over a run — traders **don't respawn** (finite recruit fodder; intended).
- Recruit/trade gated behind `isFrozen()` / shop-open, like `Shop` and `Chest`.
- Bag full when a contract would drop → token stays on the ground (existing pickup behavior).
- A token in the hotbar can't be wasted: `activateSlot` is a no-op for `'token'` kind.

## Tests (pure logic — three.js mocked, per repo convention)

- `traderStore`: create / remove / nearest / reset.
- `inventoryStore`: `consumeItem` decrements + frees the slot; returns false when absent;
  `activateSlot` no-op on a token.
- `recruitTrader`: consumes a contract, creates a castle-homed villager with
  `isGuard === true` and `recruited === true`, removes the trader; fails (no conversion)
  when the player holds no contract.
- Invariant: a created trader never appears in `nearestVillager` / `getStandingVillagerCount`.

## Verification

- `npm test` (pure logic), `npm run build` (tsc gate), `npm run inspect Trader` (model),
  and `npm run dev` to watch trading + recruiting in the browser.
