// The single source of truth for per-run / persistent store wiring.
//
// Before this file there were THREE hand-maintained parallel lists — resetRun()'s
// resetX() roll-call, saveGame's snapshot()/restore() serialize/hydrate roll-call,
// and SaveData's field list — and a store forgotten in any one of them was a SILENT
// bug (state leaking across a restart, or a field that never persisted) with no
// compile error to catch it. Now every store appears exactly ONCE here, as a
// descriptor, and resetRun()/snapshot()/restore() all iterate this array.
//
// A descriptor declares only what its store actually does:
//   - reset     per-run wipe (Play Again / Return to Menu). OMIT for state that
//               must survive a restart — difficulty is persisted but never reset.
//   - serialize present (with hydrate) for state a fresh <World> mount can't
//   - hydrate   reproduce, i.e. what the save checkpoint must carry. `key` doubles
//               as the SaveData JSON field name for these.
// A store may have reset only (transient fx, spatial registries, modals), save
// only (difficulty), or both (player, inventory, …).
//
// Because this module imports every store directly, importing it (as runReset and
// saveGame do) forces all stores to load — there's no lazy-registration ordering
// hazard, the array IS the registry. Adding a per-run store = add ONE descriptor.

import { resetPlayer, serializePlayer, hydratePlayer, type PlayerSave } from './playerStore'
import { resetResources, serializeResources, hydrateResources } from './resourceStore'
import {
  resetInventory,
  setInventoryOpen,
  serializeInventory,
  hydrateInventory,
  type InventorySave,
} from './inventoryStore'
import { resetUpgrades, serializeUpgrades, hydrateUpgrades } from './upgradeStore'
import { resetUnlocks, serializeUnlocks, hydrateUnlocks } from './weaponUnlockStore'
import { resetCity, serializeCity, hydrateCity, type CityState } from './cityStore'
import { resetCastle, serializeCastle, hydrateCastle, type CastleSave } from './castleStore'
import { resetTowers, serializeTowers, hydrateTowers } from './towerStore'
import { resetWaves, serializeWave, hydrateWave } from './waveStore'
import { resetVillagers, serializeGuards, hydrateGuards, type GuardSave } from './villagerStore'
import { resetShopDiscount, closeShop, getShopDiscount, setShopDiscount } from './shopStore'
import { getDifficulty, setDifficulty, type Difficulty } from './difficultyStore'

import { resetOrks } from './orkStore'
import { resetOre } from './oreStore'
import { resetHerbs } from './herbStore'
import { resetApples } from './appleStore'
import { resetDummies } from './dummyStore'
import { resetTraders } from './traderStore'
import { resetGraves } from './successionStore'
import { resetAnimals } from './animalStore'
import { resetBears } from './bearStore'
import { resetDogs } from './dogStore'
import { resetBuffs } from './buffStore'
import { resetBolts } from './projectileStore'
import { resetOrbs } from './orbStore'
import { resetPickups } from './pickupStore'
import { resetItemToasts } from './itemToastStore'
import { resetFovKick } from './fxStore'
import { resetDust } from './dustStore'
import { resetImpacts } from './impactStore'
import { resetHitStop } from './hitStopStore'
import { resetGrade } from './gradeStore'
import { resetBlock } from './blockStore'
import { resetCombat } from './combatStore'
import { resetHeroVoice } from './voiceStore'
import { resetBridges } from './bridges'
import { resetHouseBlockers } from './houseBlockers'
import { resetPerf } from './perfStore'
import { clearNotice } from './noticeStore'
import { closeTree } from './townHallStore'
import { closeSettings } from './settingsStore'
import { setPaused } from './pauseStore'

/** A store's wiring into the run lifecycle. `serialize`/`hydrate` come as a pair
 *  (a persisted store) or not at all (reset-only). `reset` is omitted only for
 *  state that deliberately survives a restart (difficulty). The registry erases
 *  the per-store payload type to `unknown`; `store()` keeps it checked at the
 *  definition site. */
export interface StoreDescriptor {
  /** Unique id; also the SaveData JSON field name for persisted stores. */
  key: string
  reset?: () => void
  serialize?: () => unknown
  hydrate?: (data: unknown) => void
}

interface TypedDescriptor<T> {
  key: string
  reset?: () => void
  serialize?: () => T
  hydrate?: (data: T) => void
}

/** Type-checks serialize/hydrate against a shared payload type T at the call site,
 *  then erases T so descriptors of different shapes share one array. */
function store<T>(d: TypedDescriptor<T>): StoreDescriptor {
  return d as unknown as StoreDescriptor
}

// ── The registry ─────────────────────────────────────────────────────────────
// Persisted stores come first, in the order snapshot()/restore() walk them (kept
// identical to the pre-refactor restore order — resets are order-independent, but
// preserving it makes the save payload's key order stable and the diff reviewable).

export const STORE_REGISTRY: StoreDescriptor[] = [
  // ── persisted + per-run ──
  store<PlayerSave>({
    key: 'player',
    reset: resetPlayer,
    serialize: serializePlayer,
    hydrate: hydratePlayer,
  }),
  store<{ stone: number }>({
    key: 'resource',
    reset: resetResources,
    serialize: serializeResources,
    hydrate: hydrateResources,
  }),
  store<InventorySave>({
    key: 'inventory',
    // close the bag modal on restart alongside wiping its contents
    reset: () => {
      resetInventory()
      setInventoryOpen(false)
    },
    serialize: serializeInventory,
    hydrate: hydrateInventory,
  }),
  store<string[]>({
    key: 'upgrades',
    reset: resetUpgrades,
    serialize: serializeUpgrades,
    hydrate: hydrateUpgrades,
  }),
  store<string[]>({
    key: 'unlocks',
    reset: resetUnlocks,
    serialize: serializeUnlocks,
    hydrate: hydrateUnlocks,
  }),
  store<CityState>({ key: 'city', reset: resetCity, serialize: serializeCity, hydrate: hydrateCity }),
  store<CastleSave>({
    key: 'castle',
    reset: resetCastle,
    serialize: serializeCastle,
    hydrate: hydrateCastle,
  }),
  store<boolean>({
    key: 'towerMastery',
    reset: resetTowers,
    serialize: () => serializeTowers().mastery,
    hydrate: (v) => hydrateTowers({ mastery: v }),
  }),
  store<number>({
    key: 'shopDiscount',
    // the discount is a global module flag; restart drops it back to full price
    // and closes the shop modal
    reset: () => {
      resetShopDiscount()
      closeShop()
    },
    serialize: getShopDiscount,
    hydrate: setShopDiscount,
  }),
  store<number>({
    key: 'waveIndex',
    reset: resetWaves,
    serialize: () => serializeWave().index,
    hydrate: (v) => hydrateWave({ index: v }),
  }),
  store<Difficulty>({
    key: 'difficulty',
    // NO reset: difficulty is a setting that survives Play Again / Return to Menu.
    serialize: getDifficulty,
    hydrate: setDifficulty,
  }),
  store<GuardSave[]>({
    key: 'guards',
    reset: resetVillagers,
    serialize: serializeGuards,
    hydrate: hydrateGuards,
  }),

  // ── reset-only: simulation mobs / props / gatherables ──
  store<void>({ key: 'orks', reset: resetOrks }),
  store<void>({ key: 'ore', reset: resetOre }),
  store<void>({ key: 'herbs', reset: resetHerbs }),
  store<void>({ key: 'apples', reset: resetApples }),
  store<void>({ key: 'dummies', reset: resetDummies }),
  store<void>({ key: 'traders', reset: resetTraders }),
  store<void>({ key: 'graves', reset: resetGraves }),
  store<void>({ key: 'animals', reset: resetAnimals }),
  store<void>({ key: 'bears', reset: resetBears }),
  store<void>({ key: 'dogs', reset: resetDogs }),

  // ── reset-only: transient combat / fx ──
  store<void>({ key: 'buffs', reset: resetBuffs }),
  store<void>({ key: 'bolts', reset: resetBolts }),
  store<void>({ key: 'orbs', reset: resetOrbs }),
  store<void>({ key: 'pickups', reset: resetPickups }),
  store<void>({ key: 'itemToasts', reset: resetItemToasts }),
  store<void>({ key: 'fovKick', reset: resetFovKick }),
  store<void>({ key: 'dust', reset: resetDust }),
  store<void>({ key: 'impacts', reset: resetImpacts }),
  store<void>({ key: 'hitStop', reset: resetHitStop }),
  store<void>({ key: 'grade', reset: resetGrade }),
  store<void>({ key: 'block', reset: resetBlock }),
  store<void>({ key: 'combat', reset: resetCombat }),
  store<void>({ key: 'heroVoice', reset: resetHeroVoice }),

  // ── reset-only: spatial registries (re-populated by components on remount) ──
  store<void>({ key: 'bridges', reset: resetBridges }),
  store<void>({ key: 'houseBlockers', reset: () => resetHouseBlockers() }),

  // ── reset-only: open modal + freeze clear (so the fresh world runs live) ──
  store<void>({ key: 'townHall', reset: closeTree }),
  store<void>({ key: 'settingsPanel', reset: closeSettings }),
  store<void>({ key: 'pause', reset: () => setPaused(false) }),
  store<void>({ key: 'notice', reset: clearNotice }),

  // ── reset-only: adaptive perf governor (re-arm one downgrade for the run) ──
  store<void>({ key: 'perf', reset: resetPerf }),
]
