import { describe, it, expect, beforeEach } from 'vitest'
import { spawnOrbs, stepOrbs, getOrbs, resetOrbs } from './orbStore'
import { resetPlayer, getGold, getPlayer } from './playerStore'

// The risky part of the reward-orb feature is that gold/XP is no longer granted
// on the kill — it's deferred to when each orb reaches the hero. These tests pin
// the invariant that the *full* value always lands (nothing lost to a stuck orb)
// and that orbs hold still during hit-stop (dt ≤ 0).

beforeEach(() => {
  resetPlayer()
  resetOrbs()
})

describe('spawnOrbs', () => {
  it('splits the total value across orbs with no loss', () => {
    spawnOrbs('gold', 10, 1, 10, 4, 10)
    const total = getOrbs().reduce((s, o) => s + o.value, 0)
    expect(getOrbs()).toHaveLength(4)
    expect(total).toBe(10)
  })

  it('ignores empty bursts', () => {
    spawnOrbs('gold', 0, 0, 0, 0, 10)
    spawnOrbs('gold', 0, 0, 0, 4, 0)
    expect(getOrbs()).toHaveLength(0)
  })
})

describe('stepOrbs', () => {
  it('grants the full gold value once every orb is collected', () => {
    const before = getGold()
    const p = getPlayer()
    spawnOrbs('gold', p.x + 5, p.y, p.z + 5, 4, 13)
    // Step well past the life cap so all orbs are collected (by contact or cap).
    for (let i = 0; i < 200; i++) stepOrbs(0.05)
    expect(getOrbs()).toHaveLength(0)
    expect(getGold() - before).toBe(13)
  })

  it('holds orbs frozen during hit-stop (dt ≤ 0)', () => {
    spawnOrbs('gold', 5, 1, 5, 3, 9)
    const snapshot = getOrbs().map((o) => ({ x: o.x, y: o.y, z: o.z, age: o.age }))
    stepOrbs(0)
    stepOrbs(-0.02)
    getOrbs().forEach((o, i) => {
      expect(o.x).toBe(snapshot[i].x)
      expect(o.y).toBe(snapshot[i].y)
      expect(o.z).toBe(snapshot[i].z)
      expect(o.age).toBe(snapshot[i].age)
    })
  })
})
