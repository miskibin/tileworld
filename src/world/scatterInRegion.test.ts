import { describe, it, expect } from 'vitest'
import { scatterInRegion, regionByBiome } from './tileMap'

// scatterInRegion places foragables (herbs/apples). They should ring the biome's
// OUTER rim (an annulus), not fill the disc — that pushes gather targets toward
// the map edges so the daily forage run is a real trip out, not a stroll through
// the centre.
describe('scatterInRegion', () => {
  const INNER = 0.55
  const OUTER = 0.95

  it('scatters every point inside the outer-rim annulus of the region', () => {
    const reg = regionByBiome('forest')!
    const pts = scatterInRegion('forest', 5)
    expect(pts).toHaveLength(5)
    for (const p of pts) {
      const d = Math.hypot(p.x - reg.x, p.z - reg.z)
      expect(d).toBeGreaterThanOrEqual(reg.r * INNER - 1e-6)
      expect(d).toBeLessThanOrEqual(reg.r * OUTER + 1e-6)
    }
  })

  it('is deterministic across calls (stable field within a run)', () => {
    const a = scatterInRegion('swamp', 6)
    const b = scatterInRegion('swamp', 6)
    expect(a).toEqual(b)
  })

  it('returns an empty list for a biome with no region', () => {
    expect(scatterInRegion('grass', 5)).toEqual([])
  })
})
