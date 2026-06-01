# Phase 2 — Biome Creatures, Loot & Buffs

Status: **approved design, ready to plan.** Builds on the Phase 1 map overhaul
(`2026-05-31-map-overhaul-design.md`). Single implementation plan.

## Goal

Give each wild biome its own signature creature, and make exploring/hunting pay
out **usable** loot. Six new creatures drop themed gear/consumables that flow
into the existing 5-slot hotbar; consumables can grant short timed buffs. No new
inventory UI, no crafting subsystem.

## Decisions (locked with the user)

- **6 creatures** — one per wild biome (snow / desert / swamp / forest / rock ×2).
- **Loot = new `ITEM_DEFS`** in the existing item system (no separate materials store).
- **Obtained via kill-drops + biome chests** (reuse the existing `Chest`).
- **Lives in the existing 5-slot hotbar** — no new inventory panel.
- **Consumables may apply timed buffs** (resist / power / haste) via a small new
  `buffStore`.

## Existing grain this rides on

- Creatures already follow `animalConfig.ts` (per-species stats) + `animalStore.ts`
  (module array, `createAnimal`/`getAliveAnimals`/`damageAnimal`/`reapAnimal`) +
  `animalAI.ts` (behavior branches) + a hand-built `*View.tsx` model. `WildAnimals.tsx`
  owns the spawn + respawn loop.
- `animalAI.ts` already has the three behavior classes every new creature needs:
  `predator` (A* chase + melee), `prey` (flee), `boar` (neutral tank that charges
  when provoked). **No AI logic changes** — new creatures only add config + a model.
- Kill bounty (gold/xp) is paid in exactly one place: the animal loop inside
  `Character.tsx`'s attack hit-resolution. The drop roll hooks the same spot.
- Items are `ITEM_DEFS` (id/name/icon/kind: 'consumable'|'weapon'/heal?/damageBonus?/
  stackable) on a 5-slot hotbar (`inventoryStore.ts`). `addItem` returns false when full.
- Transient pooled effects (`Impacts`/`impactStore`) are the template for ground
  pickups: a module pool stepped/rendered every frame, no `notify`.

## 1. Six creatures

New `AnimalSpecies` values, each reusing an existing behavior class:

| Biome | Species id | Behavior | Notes |
|---|---|---|---|
| snow | `polar_bear` | predator | high HP, slow, big hit |
| desert | `scorpion` | predator | fast, low HP, venomous |
| swamp | `bog_croc` | boar | charges when approached |
| forest | `elk` | prey | large grazer, flees |
| rock | `goat` | prey | nimble, flees |
| rock | `golem` | boar | very slow/tanky, drops weapon |

- Add stat blocks to `ANIMAL_CONFIG` (hp/speed/aggro/leash/fear/melee/damage/cooldowns/
  scale/collisionRadius/blocks/bountyGold/bountyXp), mirroring wolf/deer/boar entries.
- Build one `*View.tsx` per creature (box-mesh quadruped/creature, Wolf/Bear conventions:
  hip-pivot legs, head group, HP billboard, cull + dead-fade). Each verified via
  **model-smith** + `npm run inspect <Name>` (0 FAIL required) and registered in
  `scripts/inspect-model.tsx`.
- `WildAnimals.tsx`: add `ANIMAL_SPAWNS` entries placing each creature in its biome
  REGION (snapped via `findSpawnNear`), reusing the existing respawn slots.
- `AnimalView` switch in `WildAnimals.tsx` extended with the 6 new species → view map.

## 2. Loot items + drops

Add a `dropItemId?: string` and `dropChance?: number` (0..1, default 1) to `AnimalConfig`.
New `ITEM_DEFS` entries (icons are emoji, matching the existing set):

| Item id | Name | Kind | Effect | Source |
|---|---|---|---|---|
| `fur` | Thick Fur | consumable | buff: resist | polar_bear |
| `venom` | Venom Vial | consumable | buff: power | scorpion |
| `goat_charm` | Goat Charm | consumable | buff: haste | goat |
| `croc_steak` | Croc Steak | consumable | heal 70 | bog_croc |
| `elk_jerky` | Elk Jerky | consumable | heal 35 | elk |
| `stone_maul` | Stone Maul | weapon | +26 damage | golem |

- `ItemDef` gains an optional `buff?: { kind: BuffKind; durationMs: number; mag: number }`.
  Consumables with `buff` apply it on use (in addition to any `heal`).
- On kill, `Character.tsx` rolls `dropChance` for the slain creature's `dropItemId` and
  spawns a ground pickup at the corpse (see §4).
- **Biome chests**: **6 new `<Chest>` placements** in `World.tsx`, one per *creature drop*
  (snow→`fur`, desert→`venom`, swamp→`croc_steak`, forest→`elk_jerky`, rock→`goat_charm`,
  rock-highlands→`stone_maul`), so every biome item is obtainable by exploration even before
  the player fights its creature. Reuses the existing `Chest` as-is. Placed in each biome
  REGION, snapped clear of cliffs by `Chest`'s own `findSpawnNear`.

## 3. Buffs — `buffStore.ts`

A small module store, three timed effects. Single source of truth for the multipliers.

```ts
type BuffKind = 'resist' | 'power' | 'haste'
// state: per-kind expiry timestamp (sec).
applyBuff(kind, durationMs, mag)   // set expiry = now + dur; store mag
getDamageTakenMult(): number       // resist active → 0.6, else 1
getDamageDealtMult(): number       // power  active → 1.4, else 1
getSpeedMult(): number             // haste  active → 1.3, else 1
getActiveBuffs(now): {kind, remain}[]  // for the HUD pip
subscribeBuffs(fn)                 // notify on apply/expire (HUD only)
resetBuffs()
```

Hooks (each reads the relevant getter — no duplicated logic):
- `playerStore.damagePlayer` → multiply incoming `amount` by `getDamageTakenMult()`.
- `Character.tsx` swing damage → multiply `dmg` by `getDamageDealtMult()`.
- `Character.tsx` `SPEED` → multiply step by `getSpeedMult()`.
- `inventoryStore.activateSlot` consumable branch → if `def.buff`, call `applyBuff`.

Expiry is lazy (compared against `performance.now()` on read); a once-per-second tick
in the HUD pip drives the visual countdown + fires `notify` on expiry.

## 4. Ground pickups — `pickupStore.ts` + `Pickups.tsx`

Pooled, no-notify, like Impacts:
- `spawnPickup(itemId, x, y, z)` pushes a token onto a module array.
- `Pickups.tsx` `useFrame`: bob/spin tokens, and when the player is within ~0.9 tiles,
  call `addItem(itemId)`; on success remove the token + `spawnFloat('+Item')` + play a
  pickup sfx. **If `addItem` returns false (hotbar full), the token stays** — no silent
  loss. Frozen-gate first, like every loop.
- Mounted once in `World.tsx` inside the offset group.
- Token visual: a small floating emoji-less box tinted per item (cheap; no `<Text>` so it
  inspects clean and stays in capture mode).

## 5. HUD — buff pips (the only new UI)

A compact `BuffBar` in `Hud.tsx`: one pip per active buff (icon + shrinking duration bar),
rendered **only while ≥1 buff is active** — no idle chrome (honors the minimal-HUD
preference). Subscribes to `buffStore`; drives the countdown with `requestAnimationFrame`
like `PlayerHud`, not React state per frame.

## Files

**New:** `buffStore.ts`, `pickupStore.ts`, `Pickups.tsx`, six creature views
(`PolarBear.tsx`, `Scorpion.tsx`, `BogCroc.tsx`, `Elk.tsx`, `Goat.tsx`, `Golem.tsx`),
`BuffBar.tsx` (or a section inside Hud).

**Edited:** `animalConfig.ts` (6 species + drop fields; `AnimalSpecies` union is exported
from here and imported by `animalStore`, so adding a species is a one-file change),
`WildAnimals.tsx` (spawns + view switch), `Character.tsx`
(drop roll + damage/speed buff hooks), `playerStore.ts` (resist hook), `inventoryStore.ts`
(`buff` on ItemDef + apply on consume + 6 new defs), `World.tsx` (Pickups + biome chests),
`Hud.tsx` (BuffBar), `scripts/inspect-model.tsx` (register 6 models).

## Testing & verification

- **model-smith**: `npm run inspect <Name>` per creature → 0 FAIL before declaring each done.
- **`npm run build`** (`tsc -b`) clean.
- **Unit test** `buffStore.test.ts`: multiplier values while active vs. expired; expiry
  boundary; overlapping re-apply refreshes duration.
- **`npm run shot`** for a visual of the new creatures in-world (capture mode).
- Existing `mapReachability` / `pathfinding` tests stay green (no terrain change).

## Out of scope (explicitly)

Crafting, a materials inventory, harvest/mining nodes, taming, breeding, creature factions
beyond the existing predator/prey/boar relationships, and per-creature unique attacks beyond
what the three AI branches provide.
