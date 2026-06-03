import { describe, it, expect } from 'vitest'
import { ORK_CAMPS } from './obstacles'
import { tileAt, standable } from './tileMap'

// OrkCamp renders its tents / fire / banner at a single group Y (the camp
// centre's ground height). If the camp footprint isn't FLAT, those props float
// above or sink into the terrain (the "floating tents" bug). Guard it: every
// tile under each camp's prop spread must be standable AND the same height
// class as the camp centre, so the camp sits flush on flat ground.
//
// FOOTPRINT 2 (a 5×5 block) covers the tent/fire/banner offsets (within ~2.6
// local units of the centre) and sits inside the 7×7 clearing obstacles.ts
// reserves around each camp.
const FOOTPRINT = 2

describe('ork camp placement (no floating tents)', () => {
  for (const camp of ORK_CAMPS) {
    it(`camp at (${camp.x},${camp.z}) sits on flat, standable ground`, () => {
      const center = tileAt(camp.x, camp.z)
      expect(center, 'camp centre must be land').not.toBeNull()
      const h = center!.height

      for (let dz = -FOOTPRINT; dz <= FOOTPRINT; dz++) {
        for (let dx = -FOOTPRINT; dx <= FOOTPRINT; dx++) {
          const x = camp.x + dx
          const z = camp.z + dz
          expect(standable(x, z), `tile (${x},${z}) under camp must be standable`).toBe(true)
          const t = tileAt(x, z)
          expect(
            t!.height,
            `tile (${x},${z}) height must equal camp centre height ${h} (else tents float/sink)`,
          ).toBe(h)
        }
      }
    })
  }
})
