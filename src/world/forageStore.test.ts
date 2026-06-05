import { describe, it, expect } from 'vitest'
import { makeForageStore } from './forageStore'

// Covers the shared forage logic that both herbStore and appleStore are thin
// instances of — so neither needs its own near-identical test.
describe('forageStore factory', () => {
  it('create registers an uncollected plant in all + active', () => {
    const s = makeForageStore()
    const a = s.create(72, 84, 0.5)
    expect(a.collected).toBe(false)
    expect(s.all()).toHaveLength(1)
    expect(s.active()).toHaveLength(1)
  })

  it('collect takes a plant once and drops it from active (still tracked in all)', () => {
    const s = makeForageStore()
    const a = s.create(1, 2, 0.1)
    expect(s.collect(a)).toBe(true)
    expect(a.collected).toBe(true)
    expect(s.active()).toHaveLength(0)
    expect(s.all()).toHaveLength(1)
  })

  it('a plant cannot be foraged twice', () => {
    const s = makeForageStore()
    const a = s.create(1, 2, 0.1)
    s.collect(a)
    expect(s.collect(a)).toBe(false)
  })

  it('reset clears the field and restarts the id counter', () => {
    const s = makeForageStore()
    s.create(1, 2, 0.1)
    s.reset()
    expect(s.all()).toHaveLength(0)
    expect(s.create(3, 4, 0.2).id).toBe(0)
  })

  it('two instances keep independent state', () => {
    const a = makeForageStore()
    const b = makeForageStore()
    a.collect(a.create(0, 0, 0))
    b.create(0, 0, 0)
    expect(a.active()).toHaveLength(0)
    expect(b.active()).toHaveLength(1)
  })

  it('y falls back to 1 over a null tile (out of bounds / water)', () => {
    const s = makeForageStore()
    expect(s.create(-50, -50, 0).y).toBe(1)
  })
})
