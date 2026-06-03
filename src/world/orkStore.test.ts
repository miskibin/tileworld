import { describe, it, expect, beforeEach, vi } from 'vitest'

// createOrk samples terrain height for spawn-y; a flat stub keeps these tests
// off the real procedural map (faster, deterministic, no map build).
vi.mock('./tileMap', () => ({
  tileAt: () => ({ height: 0 }),
  tileTopY: () => 1,
}))

import {
  createOrk,
  resetOrks,
  getOrks,
  getAliveOrks,
  reapOrk,
  damageOrk,
  healOrk,
  nearestEnemyOrk,
  nearestWoundedAlly,
  orkCollidesAt,
  type OrkState,
} from './orkStore'

beforeEach(() => {
  resetOrks()
})

const spawn = (x: number, z: number, faction: 'red' | 'blue' = 'red'): OrkState =>
  createOrk(x, z, 0, 'grunt', faction, 0)

describe('createOrk / roster', () => {
  it('adds to the roster with config hp and a unique id', () => {
    const a = spawn(0, 0)
    const b = spawn(1, 1)
    expect(getOrks()).toHaveLength(2)
    expect(a.hp).toBe(254) // grunt base hp
    expect(a.maxHp).toBe(254)
    expect(a.id).not.toBe(b.id)
  })

  it('resetOrks clears the roster and id counter', () => {
    spawn(0, 0)
    resetOrks()
    expect(getOrks()).toHaveLength(0)
    expect(spawn(0, 0).id).toBe(0)
  })
})

describe('damageOrk', () => {
  it('reduces hp and reports survival', () => {
    const o = spawn(0, 0)
    expect(damageOrk(o, 20, 1)).toBe(false)
    expect(o.hp).toBe(234)
    expect(o.hurtFlashUntil).toBe(1.25)
  })

  it('returns true and clamps at 0 on a lethal hit', () => {
    const o = spawn(0, 0)
    expect(damageOrk(o, 999, 1)).toBe(true)
    expect(o.hp).toBe(0)
  })

  it('an already-dead ork takes no damage', () => {
    const o = spawn(0, 0)
    damageOrk(o, 999, 1)
    expect(damageOrk(o, 10, 2)).toBe(false)
    expect(o.hp).toBe(0)
  })
})

describe('getAliveOrks / reapOrk', () => {
  it('alive filter excludes the dead', () => {
    const a = spawn(0, 0)
    spawn(1, 1)
    damageOrk(a, 999, 1)
    expect(getAliveOrks()).toHaveLength(1)
  })

  it('reapOrk removes by id; unknown id is a no-op', () => {
    const a = spawn(0, 0)
    reapOrk(9999)
    expect(getOrks()).toHaveLength(1)
    reapOrk(a.id)
    expect(getOrks()).toHaveLength(0)
  })
})

describe('nearestEnemyOrk', () => {
  it('returns the closest hostile-faction ork in range', () => {
    const self = spawn(0, 0, 'red')
    spawn(1, 0, 'red') // ally — ignored
    const near = spawn(3, 0, 'blue')
    spawn(8, 0, 'blue') // farther enemy
    expect(nearestEnemyOrk(self, 6)).toBe(near)
  })

  it('returns null when the only enemy is out of range', () => {
    const self = spawn(0, 0, 'red')
    spawn(10, 0, 'blue')
    expect(nearestEnemyOrk(self, 5)).toBeNull()
  })

  it('ignores dead enemies', () => {
    const self = spawn(0, 0, 'red')
    const enemy = spawn(2, 0, 'blue')
    damageOrk(enemy, 999, 1)
    expect(nearestEnemyOrk(self, 6)).toBeNull()
  })
})

describe('nearestWoundedAlly', () => {
  it('finds a same-faction wounded ork in range', () => {
    const self = spawn(0, 0, 'red')
    const ally = spawn(2, 0, 'red')
    damageOrk(ally, 30, 1) // now wounded
    expect(nearestWoundedAlly(self, 6)).toBe(ally)
  })

  it('skips full-hp allies', () => {
    const self = spawn(0, 0, 'red')
    spawn(2, 0, 'red') // full hp
    expect(nearestWoundedAlly(self, 6)).toBeNull()
  })
})

describe('healOrk', () => {
  it('clamps to maxHp', () => {
    const o = spawn(0, 0)
    damageOrk(o, 50, 1) // hp 70
    healOrk(o, 999)
    expect(o.hp).toBe(o.maxHp)
  })

  it('does not revive a dead ork', () => {
    const o = spawn(0, 0)
    damageOrk(o, 999, 1)
    healOrk(o, 50)
    expect(o.hp).toBe(0)
  })
})

describe('orkCollidesAt', () => {
  it('detects overlap inside the combined radius and clears outside', () => {
    spawn(5, 5)
    expect(orkCollidesAt(5, 5, 0.3)).toBe(true)
    expect(orkCollidesAt(20, 20, 0.3)).toBe(false)
  })
})
