// Recruiting a trader: spend a Mercenary Contract to turn an independent merchant
// into a castle militia villager. This is the ONE place a trader crosses over into
// villagerStore — it's removed from traderStore and a villager is created with a
// home anchored inside the castle walls, so createVillager flags it as a guard and
// it joins the succession lives pool. Pure store mutations (no audio/FX) so it can
// be unit-tested; the interaction layer plays the SFX/floater on success.

import { CASTLE_BOUNDS } from './cityPlan'
import { createVillager, type VillagerState } from './villagerStore'
import { removeTrader, type TraderState } from './traderStore'
import { consumeItem } from './inventoryStore'

/** Item id spent to recruit one trader. */
export const RECRUIT_ITEM = 'mercenary_contract'

// A muster point just inside the north wall, clear of the central keep. Recruited
// guards path here from wherever they stood and then defend like any castle
// villager. Small per-trader jitter so successive recruits don't stack exactly.
export function musterAnchor(seed: number): { x: number; z: number } {
  const jx = (Math.sin(seed * 53.17) * 0.5 + 0.5) * 10 // 0..10
  return { x: CASTLE_BOUNDS.minX + 7 + jx, z: CASTLE_BOUNDS.minZ + 5 } // ~66..76, z=50
}

/** Spend a contract to convert `t` into a castle militia villager. Returns the
 *  new villager, or null when the player holds no contract (nothing changes). */
export function recruitTrader(t: TraderState): VillagerState | null {
  if (!consumeItem(RECRUIT_ITEM)) return null
  const home = musterAnchor(t.seed)
  const v = createVillager({
    x: t.x,
    y: t.y,
    z: t.z,
    facing: t.facing,
    homeX: home.x,
    homeZ: home.z,
    gardenX: home.x,
    gardenZ: home.z + 1,
    doorX: home.x,
    doorZ: home.z,
    seed: t.seed,
    paletteIndex: t.paletteIndex,
  })
  v.recruited = true
  removeTrader(t.id)
  return v
}
