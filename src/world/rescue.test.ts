import { describe, it, expect, beforeEach, vi } from 'vitest'

// cityPlan (via recruit → musterAnchor) imports tileMap; stub it so the rescue
// path never touches the real procedural map. CASTLE_BOUNDS is literal in cityPlan
// so isInsideCastle (→ isGuard) works regardless of these stubs.
vi.mock('./tileMap', () => ({
  tileAt: () => ({ height: 0 }),
  tileTopY: () => 1,
  CENTER_X: 72,
  CENTER_Z: 54,
}))

import { freeCaptive } from './rescue'
import {
  getVillagers,
  getStandingVillagerCount,
  resetVillagers,
} from './villagerStore'

beforeEach(() => resetVillagers())

describe('freeCaptive', () => {
  it('spawns a castle-guard militia villager at the cage and adds a life', () => {
    const v = freeCaptive(42, 64, 0.3, 1)
    expect(v.recruited).toBe(true)
    expect(v.isGuard).toBe(true) // home anchored inside CASTLE_BOUNDS
    expect(getVillagers()).toHaveLength(1)
    expect(getStandingVillagerCount()).toBe(1) // counts as an heir/life
  })

  it('spawns the captive at the cage position (it walks home from there)', () => {
    const v = freeCaptive(92, 44, 0.7, 0)
    expect(v.x).toBe(92)
    expect(v.z).toBe(44)
  })

  it('each rescue adds another life to the pool', () => {
    freeCaptive(74, 26, 0.1, 0)
    freeCaptive(74, 27, 0.5, 1)
    expect(getStandingVillagerCount()).toBe(2)
  })
})
