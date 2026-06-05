import { describe, it, expect } from 'vitest'
import { frontierFactor, gearTier, rollGear, chestLootFor, RIM_DIST } from './frontier'
import { CASTLE_CENTER, CASTLE_SAFE_R } from './tileMap'

describe('frontierFactor', () => {
  it('is 0 at the castle centre and across the safe zone', () => {
    expect(frontierFactor(CASTLE_CENTER.x, CASTLE_CENTER.z)).toBe(0)
    expect(frontierFactor(CASTLE_CENTER.x + CASTLE_SAFE_R - 1, CASTLE_CENTER.z)).toBe(0)
  })
  it('is 1 at or beyond the rim distance', () => {
    expect(frontierFactor(CASTLE_CENTER.x + RIM_DIST, CASTLE_CENTER.z)).toBeCloseTo(1, 5)
    expect(frontierFactor(CASTLE_CENTER.x + RIM_DIST + 50, CASTLE_CENTER.z)).toBe(1)
  })
  it('increases monotonically through the ramp band', () => {
    const a = frontierFactor(CASTLE_CENTER.x + CASTLE_SAFE_R + 5, CASTLE_CENTER.z)
    const b = frontierFactor(CASTLE_CENTER.x + CASTLE_SAFE_R + 15, CASTLE_CENTER.z)
    const c = frontierFactor(CASTLE_CENTER.x + CASTLE_SAFE_R + 25, CASTLE_CENTER.z)
    expect(a).toBeGreaterThan(0)
    expect(b).toBeGreaterThan(a)
    expect(c).toBeGreaterThan(b)
  })
})

describe('gearTier', () => {
  it('bands factor into 0/1/2', () => {
    expect(gearTier(0)).toBe(0)
    expect(gearTier(0.39)).toBe(0)
    expect(gearTier(0.5)).toBe(1)
    expect(gearTier(0.71)).toBe(2)
    expect(gearTier(1)).toBe(2)
  })
})

describe('rollGear', () => {
  it('returns a low-tier id near the castle', () => {
    const id = rollGear(0.0, 0.5)
    expect(['sword_iron', 'leather_armor', 'bread']).toContain(id)
  })
  it('returns a top-tier id at the rim', () => {
    const id = rollGear(1.0, 0.5)
    expect(['blade_frost', 'dragon_plate', 'sword_gold', 'gold_armor']).toContain(id)
  })
  it('is deterministic for the same (factor, roll)', () => {
    expect(rollGear(1.0, 0.42)).toBe(rollGear(1.0, 0.42))
  })
})

describe('chestLootFor', () => {
  it('gives fewer, lower items near the castle than at the rim', () => {
    const near = chestLootFor(CASTLE_CENTER.x + CASTLE_SAFE_R + 2, CASTLE_CENTER.z)
    const rim = chestLootFor(CASTLE_CENTER.x + RIM_DIST, CASTLE_CENTER.z)
    expect(rim.loot.length).toBeGreaterThanOrEqual(near.loot.length)
    expect(rim.gold).toBeGreaterThan(near.gold)
  })
  it('is deterministic per tile', () => {
    const a = chestLootFor(80, 40)
    const b = chestLootFor(80, 40)
    expect(a).toEqual(b)
  })
})
