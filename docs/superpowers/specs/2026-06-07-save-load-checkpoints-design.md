# Save / Load — checkpoint between nights

**Date:** 2026-06-07
**Status:** Design approved, pending implementation plan

## Goal

Let the player quit and resume a run. A single auto-saved checkpoint is written at
the dawn of each prep "day"; a **Continue** button on the StartScreen restores it.

## Scope decisions (locked)

| Decision | Choice |
|----------|--------|
| What is captured | A checkpoint at the start of each prep day (not a mid-combat snapshot). |
| Save trigger | Auto on every transition into the `prep` phase (incl. the first dawn). No save button. |
| Slots | Single slot + a StartScreen **Continue** button. New Game overwrites it. |
| Save lifecycle | Cleared on **victory**; **kept on defeat** (Continue replays the last night). |
| HP on load | Always restored to **full** (rested dawn). HP is therefore *not* a saved field. |

## Why "checkpoint between nights" is the right granularity

The game is built from ~40 hand-rolled module-level stores. At dawn the world is in
its calmest, most reconstructable state: no orks alive, no projectiles in flight, no
buff timers running, the player at the keep. Almost everything that matters is plain
progression/economy/defense data plus the bloodline roster. A full mid-combat snapshot
would have to serialize every live ork position/HP, projectile, FX pool and timer
across all stores — large surface, fragile, and not what the player asked for.

## Architecture

### Mechanism: per-store `serialize` / `hydrate`, composed in `saveGame.ts`

Mirrors the existing `runReset.ts` pattern (one composer calling each store's
`resetX()`). Each persistent store gains:

- `serializeX(): XSave` — returns a plain JSON-safe snapshot of its saveable fields.
- `hydrateX(data: XSave): void` — applies a snapshot in place, then notifies subscribers.

A new `src/world/saveGame.ts` is the single compositor and the localStorage gateway.
Rejected alternatives: a central module reaching into every `getX()`/setter (breaks the
per-store encapsulation that defines this codebase); replaying purchased upgrade ids on
load (`apply()` spends gold and spawns villagers at mount-time slots — fragile).

### Saved state — the run data with no other source of truth on remount

| Store | Saved fields |
|-------|-------------|
| `playerStore` | level, xp, xpToNext, maxHp, attackDamage, gold, critChance, lifesteal, moveSpeedMult, cleave, bountyMult |
| `resourceStore` | stone |
| `inventoryStore` | bag (slots), equippedId, weaponBonus, equippedArmorId, armorDamageMult |
| `upgradeStore` | purchased node ids (drives tree UI gating) |
| `cityStore` | housesBuilt, wallsBuilt, gateBuilt, towersBuilt, farmBuilt, keepArchers, villagerArmorTier, ballistaBuilt, shrineBuilt, taxOffice |
| `castleStore` | reinforced, maxHp |
| `towerStore` | mastery (flag only; per-tower HP revives each prep) |
| `weaponUnlockStore` | unlocked weapon ids |
| `shopStore` | discount (Merchant Guild) |
| `waveStore` | index (the night number / which wave is next) |
| `difficultyStore` | difficulty preset |
| `villagerStore` | **guard-villager roster** — for each `isGuard` villager: homeX/homeZ, gardenX/gardenZ, doorX/doorZ, facing, seed, paletteIndex, recruited |

HP is **not** saved (full on load). Player position is **not** saved (restored to the
keep spawn).

### NOT saved — regenerates on remount or is transient

Map/props (procedural, deterministic), wilderness villagers (re-seeded by `Village.tsx`
on mount), orks, ore/herb/apple gatherables, wild animals/bears/dogs, projectiles,
impacts/dust/orbs/pickups, buffs, screen-grade pulses, graves/soul-wisp.

**Known limitation (out of scope):** opened treasure chests are not tracked, so a
one-shot chest becomes re-lootable after a reload. Acceptable for this checkpoint
model; noted so it is a deliberate omission, not an oversight.

### The villager-roster ordering trap (the one non-obvious risk)

The castle militia / bloodline lives pool is **entirely player-accumulated** — it grows
only via Economy-district purchases, camp rescues, trader recruits and succession
births. Nothing re-creates it on a fresh `<World>` mount. So it must be saved and
re-created on load.

`VillagerCrowd` (in `Village.tsx`) calls `resetVillagers()` on **unmount**. `bumpRun()`
unmounts the old `<World>` (firing that reset) before mounting the fresh one. Therefore
guard villagers must be re-created **after** the remount, not before it — otherwise the
old tree's unmount cleanup wipes them.

### Load flow

```
loadGame():
  1. read + parse the save blob (version-checked)        // saveGame.ts
  2. resetRun()                                           // clean slate (also wipes villagers)
  3. hydrate all DATA stores from the blob               // player/resource/inventory/upgrade/
                                                          //   city/castle/tower/weaponUnlock/shop/wave/difficulty
  4. stage the guard roster                              // saveGame: stagePendingGuards(list)
  5. setPhase('prep')
  6. bumpRun()                                            // remounts <World>; old VillagerCrowd unmount → resetVillagers()
  -- on the fresh mount --
  7. <RunLoad> consumes the staged roster and re-creates // createVillager() per saved guard
     guard villagers (runs after the old unmount)
```

`<RunLoad>` is a tiny null-rendering component mounted inside `<World>` (inside the
runId key). Its mount effect calls `consumePendingGuards()` once and re-creates each
saved guard via the existing `createVillager`. On a normal New Game / Play Again there
is no staged roster, so it is a no-op.

Hydration order: `resetRun()` first (everything to defaults), then `hydrate*` overrides
the saved fields. Data stores are only reset via `resetRun()` (not by any component
mount/unmount), so the hydrated values survive the remount untouched.

### Autosave

A persistent `<AutoSave>` component mounted in `Hud.tsx` (**outside** the runId key, so
the remount never tears it down). It subscribes to the game phase and calls
`writeSave()` on every transition into `prep`, including the first dawn (menu→prep via
StartScreen) — so Continue is available the moment a new run begins. Writing on load's
own setPhase('prep') is harmless (idempotent re-write of the just-loaded state).

On `victory` it calls `clearSave()`; on `defeat` it does nothing (the last dawn
checkpoint persists for a retry).

### Persistence + robustness

- Single localStorage key `tileworld.save`; one versioned JSON blob `{ version, data }`.
- `hasSave()` / `getSaveMeta()` return whether a valid save exists and a small label
  payload (night number, player level) for the Continue button.
- All localStorage access is wrapped in try/catch (private mode / disabled storage),
  mirroring `difficultyStore`. Any parse failure or version mismatch is treated as
  "no save" — the Continue button simply doesn't show, and gameplay is unaffected.

### UI

- **StartScreen:** a **Continue** button rendered only when `hasSave()` is true, labelled
  e.g. `Continue — Night 3 · Lv 5` from `getSaveMeta()`. Clicking it calls `loadGame()`
  (the world resumes at the saved dawn). The existing **Play** button is unchanged and
  starts a fresh run; its first dawn autosaves over any existing checkpoint. No confirm
  dialog (consistent with the project's minimal-HUD preference).
- **PauseMenu:** unchanged. "Return to Menu" already keeps the localStorage save intact,
  so Continue works after backing out to the menu.

## Files

New:
- `src/world/saveGame.ts` — compositor + localStorage gateway: `writeSave`, `loadGame`,
  `hasSave`, `getSaveMeta`, `clearSave`, `stagePendingGuards`/`consumePendingGuards`,
  version constant + storage key.
- `src/world/RunLoad.tsx` — post-remount guard-roster hydrator (null render).
- `src/hud/AutoSave.tsx` — phase-subscribed autosave/clear (null render).
- `src/world/saveGame.test.ts` — round-trip + corrupt/missing-save tests.

Modified (add `serializeX`/`hydrateX`):
- `playerStore.ts`, `resourceStore.ts`, `inventoryStore.ts`, `upgradeStore.ts`,
  `cityStore.ts`, `castleStore.ts`, `towerStore.ts`, `weaponUnlockStore.ts`,
  `shopStore.ts`, `waveStore.ts`, `villagerStore.ts` (guard serialize + recreate helper),
  `difficultyStore.ts` (already self-persists; add serialize/hydrate for the blob).
- `src/world/World.tsx` — mount `<RunLoad>`.
- `src/hud/Hud.tsx` — mount `<AutoSave>`.
- `src/hud/StartScreen.tsx` — Continue button.

## Testing

- `saveGame.test.ts` (pure, vitest, mocked localStorage):
  - serialize → JSON.stringify → JSON.parse → hydrate reproduces each store's state.
  - guard-roster round-trip recreates the same guard count + fields.
  - missing key → `hasSave()` false, `loadGame()` no-ops safely.
  - corrupt JSON / wrong version → treated as no-save, no throw.
- `npm run build` (tsc -b) is the correctness gate for the store + component wiring.
- Manual `npm run dev`: start a run, survive to a later night, return to menu, Continue,
  verify night number, gold, upgrades, equipped gear, walls/towers, and militia count
  all restore.

## Out of scope

Multiple/named slots, manual save button, mid-combat snapshots, opened-chest tracking,
cloud sync.
