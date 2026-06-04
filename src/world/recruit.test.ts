import { describe, it, expect, beforeEach, vi } from 'vitest'

// cityPlan imports tileMap (CENTER_X/Z + tile sampling); stub it so the recruit
// path never touches the real procedural map. CASTLE_BOUNDS is literal in cityPlan
// so isInsideCastle works regardless of these stubs.
vi.mock('./tileMap', () => ({
  tileAt: () => ({ height: 0 }),
  tileTopY: () => 1,
  CENTER_X: 72,
  CENTER_Z: 54,
}))
// inventoryStore side-effects.
vi.mock('../audio/sfx', () => ({
  playConsume: () => {},
  playEquip: () => {},
  playAbilityCast: () => {},
}))
vi.mock('./playerStore', () => ({ healPlayer: () => {} }))
vi.mock('./buffStore', () => ({ applyBuff: () => {} }))

import { recruitTrader } from './recruit'
import { createTrader, getTraders, resetTraders, type TraderState } from './traderStore'
import {
  getVillagers,
  getStandingVillagerCount,
  resetVillagers,
} from './villagerStore'
import { addItem, hasItem, resetInventory } from './inventoryStore'

const spawnTrader = (): TraderState =>
  createTrader({
    x: 10,
    y: 1,
    z: 10,
    facing: 0,
    homeX: 10,
    homeZ: 10,
    doorX: 10,
    doorZ: 10,
    gardenX: 11,
    gardenZ: 10,
    seed: 0.5,
    paletteIndex: 0,
    name: 'Merchant',
  })

beforeEach(() => {
  resetTraders()
  resetVillagers()
  resetInventory()
})

describe('recruitTrader', () => {
  it('does nothing and returns null when the player holds no contract', () => {
    const t = spawnTrader()
    expect(recruitTrader(t)).toBeNull()
    expect(getTraders()).toHaveLength(1) // still a trader
    expect(getVillagers()).toHaveLength(0) // no villager created
  })

  it('spends a contract and converts the trader into a castle guard villager', () => {
    addItem('mercenary_contract', 1)
    const t = spawnTrader()

    const v = recruitTrader(t)

    expect(v).not.toBeNull()
    expect(v!.recruited).toBe(true)
    expect(v!.isGuard).toBe(true) // home anchored inside CASTLE_BOUNDS
    expect(hasItem('mercenary_contract')).toBe(false) // contract spent
    expect(getTraders()).toHaveLength(0) // trader removed
    expect(getVillagers()).toHaveLength(1) // now a villager
    expect(getStandingVillagerCount()).toBe(1) // counts as a life
  })

  it('a non-recruited trader is never part of the villager lives pool', () => {
    spawnTrader()
    expect(getVillagers()).toHaveLength(0)
    expect(getStandingVillagerCount()).toBe(0)
  })
})
