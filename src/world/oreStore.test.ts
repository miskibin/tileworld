import { describe, it, expect, beforeEach } from 'vitest'
import {
  createOre,
  resetOre,
  getOre,
  getAliveOre,
  damageOre,
  oreCollidesAt,
} from './oreStore'

beforeEach(() => resetOre())

describe('oreStore', () => {
  it('createOre registers a full-HP node', () => {
    const o = createOre(110.5, 66.5, 0.5)
    expect(getOre()).toHaveLength(1)
    expect(getAliveOre()).toHaveLength(1)
    expect(o.hp).toBe(o.maxHp)
    expect(o.stoneReward).toBeGreaterThan(0)
  })

  it('damageOre returns false until the node shatters, true on the lethal hit', () => {
    const o = createOre(110.5, 66.5, 0.5)
    const half = Math.ceil(o.maxHp / 2)
    expect(damageOre(o, half, 1)).toBe(false) // still standing
    expect(o.hurtFlashUntil).toBeGreaterThan(1) // flash stamped
    expect(damageOre(o, o.maxHp, 2)).toBe(true) // shattered
    expect(o.hp).toBe(0)
  })

  it('a shattered node drops out of the alive set and stops colliding', () => {
    const o = createOre(110.5, 66.5, 0.5)
    expect(oreCollidesAt(110.5, 66.5, 0.2)).toBe(true)
    damageOre(o, o.maxHp, 1)
    expect(getAliveOre()).toHaveLength(0)
    expect(oreCollidesAt(110.5, 66.5, 0.2)).toBe(false)
  })

  it('oreCollidesAt only blocks within collisionRadius + query radius', () => {
    createOre(110.5, 66.5, 0.5)
    expect(oreCollidesAt(110.5, 66.5, 0.2)).toBe(true) // on top
    expect(oreCollidesAt(115, 66.5, 0.2)).toBe(false) // far away
  })

  it('damageOre on an already-dead node is a no-op returning false', () => {
    const o = createOre(110.5, 66.5, 0.5)
    damageOre(o, o.maxHp, 1)
    expect(damageOre(o, 999, 2)).toBe(false)
  })

  it('resetOre clears the field', () => {
    createOre(110.5, 66.5, 0.5)
    resetOre()
    expect(getOre()).toHaveLength(0)
  })
})
