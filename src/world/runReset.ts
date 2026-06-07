// resetRun() — the single "wipe the run clean" entry point. Composes every
// per-store reset so "Play Again" / "Return to Menu" can restart IN MEMORY
// (no location.reload()). Pair it with bumpRun() (runStore) to remount <World>.
//
// What it does NOT touch: settings that should survive a restart — difficulty,
// quality, audio. Those live in their own stores and are deliberately excluded.
//
// Order: this only resets module-level state; the actual entity teardown/re-seed
// happens when bumpRun() remounts the scene. Callers do: resetRun() → set phase
// → bumpRun().

import { resetPlayer } from './playerStore'
import { resetOrks } from './orkStore'
import { resetWaves } from './waveStore'
import { resetCastle } from './castleStore'
import { resetVillagers } from './villagerStore'
import { resetInventory, setInventoryOpen } from './inventoryStore'
import { resetUpgrades } from './upgradeStore'
import { resetCity } from './cityStore'
import { resetResources } from './resourceStore'
import { resetBuffs } from './buffStore'
import { resetFovKick } from './fxStore'
import { resetTowers } from './towerStore'
import { resetOre } from './oreStore'
import { resetHerbs } from './herbStore'
import { resetApples } from './appleStore'
import { resetDummies } from './dummyStore'
import { resetTraders } from './traderStore'
import { resetGraves } from './successionStore'
import { resetBolts } from './projectileStore'
import { resetOrbs } from './orbStore'
import { resetAnimals } from './animalStore'
import { resetBears } from './bearStore'
import { resetDogs } from './dogStore'
import { resetDust } from './dustStore'
import { resetImpacts } from './impactStore'
import { resetHitStop } from './hitStopStore'
import { resetGrade } from './gradeStore'
import { resetHeroVoice } from './voiceStore'
import { resetUnlocks } from './weaponUnlockStore'
import { resetObjectiveTotal } from './objectiveStore'
import { resetBlock } from './blockStore'
import { resetCombat } from './combatStore'
import { resetBridges } from './bridges'
import { resetHouseBlockers } from './houseBlockers'
import { resetPickups } from './pickupStore'
import { resetItemToasts } from './itemToastStore'
import { resetShopDiscount, closeShop } from './shopStore'
import { closeTree } from './townHallStore'
import { closeSettings } from './settingsStore'
import { setPaused } from './pauseStore'
import { resetPerf } from './perfStore'
import { clearNotice } from './noticeStore'

/**
 * Reset all per-run simulation state to its starting values and close any open
 * modal/freeze so the world boots live after the remount. Idempotent — safe to
 * call from an already-clean state.
 */
export function resetRun(): void {
  // --- core run state ---
  resetPlayer()
  resetOrks()
  resetWaves()
  resetCastle()
  resetVillagers()
  resetInventory()
  resetUpgrades()
  resetCity()
  resetResources()
  resetUnlocks()
  resetObjectiveTotal()

  // --- gatherables / props / mobs ---
  resetTowers()
  resetOre()
  resetHerbs()
  resetApples()
  resetDummies()
  resetTraders()
  resetGraves()
  resetAnimals()
  resetBears()
  resetDogs()

  // --- transient combat / fx ---
  resetBuffs()
  resetBolts()
  resetOrbs()
  resetPickups()
  resetItemToasts()
  resetFovKick()
  resetDust()
  resetImpacts()
  resetHitStop()
  resetGrade()
  resetBlock()
  resetCombat()
  resetHeroVoice()
  resetShopDiscount()

  // --- spatial registries (re-populated by components on remount) ---
  resetBridges()
  resetHouseBlockers()

  // --- clear any open modal + unfreeze so the fresh world runs ---
  closeShop()
  closeTree()
  setInventoryOpen(false)
  closeSettings()
  setPaused(false)

  // --- adaptive perf governor: re-arm one downgrade for the fresh run ---
  resetPerf()
  clearNotice()
}
