import { describe, it, expect, beforeEach } from 'vitest'
import {
  createTrader,
  getTraders,
  removeTrader,
  resetTraders,
  nearestTrader,
  subscribeTraders,
  type TraderState,
} from './traderStore'

const spawn = (x: number, z: number): TraderState =>
  createTrader({
    x,
    y: 1,
    z,
    facing: 0,
    homeX: x,
    homeZ: z,
    doorX: x,
    doorZ: z,
    gardenX: x + 1,
    gardenZ: z,
    seed: 0.5,
    paletteIndex: 0,
    name: 'Merchant',
  })

beforeEach(() => {
  resetTraders()
})

describe('createTrader / roster', () => {
  it('adds to the roster with a unique id and seeded defaults', () => {
    const a = spawn(2, 2)
    const b = spawn(3, 3)
    expect(getTraders()).toHaveLength(2)
    expect(a.id).not.toBe(b.id)
    // starts idle at its spawn target, no path yet
    expect(a.state).toBe('idle')
    expect(a.path).toEqual([])
    expect(a.targetX).toBe(2)
  })

  it('resetTraders clears the roster and id counter', () => {
    spawn(0, 0)
    resetTraders()
    expect(getTraders()).toHaveLength(0)
    expect(spawn(0, 0).id).toBe(0)
  })
})

describe('removeTrader', () => {
  it('removes by id; unknown id is a no-op', () => {
    const a = spawn(0, 0)
    removeTrader(9999)
    expect(getTraders()).toHaveLength(1)
    removeTrader(a.id)
    expect(getTraders()).toHaveLength(0)
  })
})

describe('nearestTrader', () => {
  it('returns the closest trader within maxDist', () => {
    spawn(0, 0)
    const near = spawn(5, 0)
    spawn(20, 0)
    expect(nearestTrader(6, 0, 3)).toBe(near)
  })

  it('returns null when none are within maxDist', () => {
    spawn(0, 0)
    expect(nearestTrader(50, 50, 2)).toBeNull()
  })
})

describe('subscribeTraders', () => {
  it('fires immediately with the current list and on add/remove', () => {
    const seen: number[] = []
    const unsub = subscribeTraders((list) => seen.push(list.length))
    expect(seen).toEqual([0]) // seeded once
    const a = spawn(0, 0)
    removeTrader(a.id)
    expect(seen).toEqual([0, 1, 0])
    unsub()
  })
})
