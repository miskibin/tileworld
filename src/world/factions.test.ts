import { describe, it, expect } from 'vitest'
import { orksHostile, preysOn, threatensPrey } from './factions'

// Faction predicates drive every targeting decision in the AI (rival camps
// brawl; predators hunt prey; prey flee threats). Lock the truth tables.

describe('orksHostile', () => {
  it('opposing warbands are hostile', () => {
    expect(orksHostile('red', 'blue')).toBe(true)
    expect(orksHostile('blue', 'red')).toBe(true)
  })

  it('same warband is not hostile', () => {
    expect(orksHostile('red', 'red')).toBe(false)
    expect(orksHostile('blue', 'blue')).toBe(false)
  })
})

describe('preysOn', () => {
  it('predators hunt prey', () => {
    expect(preysOn('predator', 'prey')).toBe(true)
  })

  it('predators do not hunt predators, boars, or nothing', () => {
    expect(preysOn('predator', 'predator')).toBe(false)
    expect(preysOn('predator', 'boar')).toBe(false)
  })

  it('prey and boars are not hunters', () => {
    expect(preysOn('prey', 'prey')).toBe(false)
    expect(preysOn('boar', 'prey')).toBe(false)
  })
})

describe('threatensPrey', () => {
  it('predators and boars threaten prey', () => {
    expect(threatensPrey('predator')).toBe(true)
    expect(threatensPrey('boar')).toBe(true)
  })

  it('prey does not threaten prey', () => {
    expect(threatensPrey('prey')).toBe(false)
  })
})
