import { describe, it, expect, beforeEach } from 'vitest'
import {
  applyBuff,
  resetBuffs,
  getDamageTakenMult,
  getDamageDealtMult,
  getSpeedMult,
  getActiveBuffs,
} from './buffStore'

// buffStore reads the clock via performance.now(); vitest's jsdom provides it.
beforeEach(() => resetBuffs())

describe('buffStore', () => {
  it('multipliers are neutral with no buffs', () => {
    expect(getDamageTakenMult()).toBe(1)
    expect(getDamageDealtMult()).toBe(1)
    expect(getSpeedMult()).toBe(1)
    expect(getActiveBuffs(performance.now() * 0.001)).toEqual([])
  })

  it('resist lowers damage taken while active', () => {
    applyBuff('resist', 1000, 0.6)
    expect(getDamageTakenMult()).toBe(0.6)
    expect(getDamageDealtMult()).toBe(1) // unrelated buffs stay neutral
  })

  it('power raises damage dealt; haste raises speed', () => {
    applyBuff('power', 1000, 1.4)
    applyBuff('haste', 1000, 1.3)
    expect(getDamageDealtMult()).toBe(1.4)
    expect(getSpeedMult()).toBe(1.3)
  })

  it('a buff expires after its duration', () => {
    // duration 0 → already expired on the next read.
    applyBuff('resist', 0, 0.6)
    expect(getDamageTakenMult()).toBe(1)
  })

  it('re-applying refreshes the multiplier and keeps it active', () => {
    applyBuff('power', 0, 1.4) // expired
    applyBuff('power', 1000, 1.5) // fresh, new mag
    expect(getDamageDealtMult()).toBe(1.5)
  })

  it('getActiveBuffs lists active buffs with remaining seconds', () => {
    applyBuff('haste', 2000, 1.3)
    const now = performance.now() * 0.001
    const active = getActiveBuffs(now)
    expect(active.map((b) => b.kind)).toEqual(['haste'])
    expect(active[0].remain).toBeGreaterThan(0)
    expect(active[0].remain).toBeLessThanOrEqual(2)
  })
})
