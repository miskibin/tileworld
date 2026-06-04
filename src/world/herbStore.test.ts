import { describe, it, expect, beforeEach } from 'vitest'
import {
  createHerb,
  resetHerbs,
  getHerbs,
  getActiveHerbs,
  collectHerb,
} from './herbStore'

beforeEach(() => resetHerbs())

describe('herbStore', () => {
  it('createHerb registers an uncollected plant', () => {
    const h = createHerb(72, 84, 0.5)
    expect(getHerbs()).toHaveLength(1)
    expect(getActiveHerbs()).toHaveLength(1)
    expect(h.collected).toBe(false)
  })

  it('collectHerb takes a plant once and drops it from the active set', () => {
    const h = createHerb(72, 84, 0.5)
    expect(collectHerb(h)).toBe(true)
    expect(h.collected).toBe(true)
    expect(getActiveHerbs()).toHaveLength(0)
    expect(getHerbs()).toHaveLength(1) // still tracked, just inactive
  })

  it('a herb cannot be foraged twice', () => {
    const h = createHerb(72, 84, 0.5)
    collectHerb(h)
    expect(collectHerb(h)).toBe(false)
  })

  it('resetHerbs clears the field', () => {
    createHerb(72, 84, 0.5)
    resetHerbs()
    expect(getHerbs()).toHaveLength(0)
  })
})
