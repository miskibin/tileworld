import { describe, it, expect, beforeEach } from 'vitest'
import {
  getStone,
  addStone,
  spendStone,
  subscribeResources,
  resetResources,
} from './resourceStore'

beforeEach(() => resetResources())

describe('resourceStore (stone)', () => {
  it('starts empty', () => {
    expect(getStone()).toBe(0)
  })

  it('addStone accumulates; non-positive amounts are ignored', () => {
    addStone(4)
    addStone(6)
    expect(getStone()).toBe(10)
    addStone(0)
    addStone(-5)
    expect(getStone()).toBe(10)
  })

  it('spendStone deducts when affordable and returns true', () => {
    addStone(30)
    expect(spendStone(20)).toBe(true)
    expect(getStone()).toBe(10)
  })

  it('spendStone is all-or-nothing: short spend changes nothing', () => {
    addStone(5)
    expect(spendStone(20)).toBe(false)
    expect(getStone()).toBe(5)
  })

  it('notifies subscribers immediately and on change', () => {
    const seen: number[] = []
    const unsub = subscribeResources((r) => seen.push(r.stone))
    expect(seen).toEqual([0]) // immediate fire
    addStone(7)
    expect(seen).toEqual([0, 7])
    unsub()
    addStone(1)
    expect(seen).toEqual([0, 7]) // no longer notified
  })

  it('resetResources zeroes the bank', () => {
    addStone(99)
    resetResources()
    expect(getStone()).toBe(0)
  })
})
