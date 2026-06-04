import { musterAnchor } from './recruit'
import { createVillager, type VillagerState } from './villagerStore'
import { tileTopY } from './tileMap'

// Freeing a caged captive at a cleared ork camp: spawn a castle-bound militia
// villager where the cage stood. It paths home to the castle muster and joins the
// succession lives pool exactly like a recruited trader — but rescue costs no
// Mercenary Contract, only the work of clearing the camp's guards. This is the
// MAIN way to grow the heir pool (the upgrade-tree houses still add townsfolk).
// Pure store mutation (no audio/FX) so it's unit-testable; the CampCage view
// plays the SFX/floater on success.

/** Free one captive at (x,z). Returns the new militia villager (a castle guard,
 *  so it counts in the standing-villager lives pool). */
export function freeCaptive(x: number, z: number, seed: number, paletteIndex: number): VillagerState {
  const home = musterAnchor(seed)
  const v = createVillager({
    x,
    y: tileTopY(Math.floor(x), Math.floor(z)),
    z,
    facing: 0,
    homeX: home.x,
    homeZ: home.z,
    gardenX: home.x,
    gardenZ: home.z + 1,
    doorX: home.x,
    doorZ: home.z,
    seed,
    paletteIndex,
  })
  v.recruited = true // rescued militia share the recruited tabard
  return v
}
