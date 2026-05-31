import { describe, it, expect, beforeEach, vi } from 'vitest'

// Flat terrain stub: the bolt's height clamp calls tileAt/tileTopY, and createOrk
// (used to build a real ork target) samples spawn height. Neither matters here.
vi.mock('./tileMap', () => ({
  tileAt: () => ({ height: 0 }),
  tileTopY: () => 0,
}))

import { spawnBolt, getBolts, resetBolts, stepProjectiles } from './projectileStore'
import { resetPlayer, getPlayer } from './playerStore'
import { createOrk, resetOrks } from './orkStore'

beforeEach(() => {
  resetBolts()
  resetPlayer()
  resetOrks()
})

describe('stepProjectiles — homing', () => {
  it('advances a bolt toward its target without removing it', () => {
    const p = getPlayer() // (48, y, 36)
    spawnBolt(40, p.y + 1, 36, { kind: 'player' }, 10)
    stepProjectiles(0.1, 1)
    const bolts = getBolts()
    expect(bolts).toHaveLength(1)
    expect(bolts[0].x).toBeGreaterThan(40) // moved toward player at x=48
  })
})

describe('stepProjectiles — impact', () => {
  it('damages the player on arrival and consumes the bolt', () => {
    const p = getPlayer()
    spawnBolt(p.x, p.y + 1, p.z, { kind: 'player' }, 15) // already at target
    stepProjectiles(0.1, 1)
    expect(getPlayer().hp).toBe(p.maxHp - 15)
    expect(getBolts()).toHaveLength(0)
  })

  it('damages an ork target on arrival', () => {
    const ork = createOrk(10, 20, 0, 'grunt', 'red', 0)
    const before = ork.hp
    spawnBolt(ork.x, ork.y + 1, ork.z, { kind: 'ork', ref: ork }, 25)
    stepProjectiles(0.1, 1)
    expect(ork.hp).toBe(before - 25)
    expect(getBolts()).toHaveLength(0)
  })
})

describe('stepProjectiles — fizzle', () => {
  it('expires a bolt past its ttl without dealing damage', () => {
    const p = getPlayer()
    spawnBolt(0, 5, 0, { kind: 'player' }, 99)
    stepProjectiles(4, 1) // ttl starts at 3
    expect(getBolts()).toHaveLength(0)
    expect(getPlayer().hp).toBe(p.maxHp) // never reached the player
  })

  it('drops a bolt whose ork target is already dead', () => {
    const ork = createOrk(10, 20, 0, 'grunt', 'red', 0)
    ork.hp = 0
    spawnBolt(ork.x, ork.y + 1, ork.z, { kind: 'ork', ref: ork }, 25)
    stepProjectiles(0.1, 1)
    expect(getBolts()).toHaveLength(0)
  })
})
