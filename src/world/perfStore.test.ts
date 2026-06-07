import { describe, it, expect, beforeEach } from 'vitest'
import {
  decideDowngrade,
  lowerTier,
  median,
  FPS_FLOOR,
  hasSuggestedDowngrade,
  markSuggested,
  resetPerf,
} from './perfStore'

describe('lowerTier', () => {
  it('steps down one tier', () => {
    expect(lowerTier('high')).toBe('medium')
    expect(lowerTier('medium')).toBe('low')
  })
  it('returns null at the floor', () => {
    expect(lowerTier('low')).toBeNull()
  })
})

describe('median', () => {
  it('odd length picks the middle', () => {
    expect(median([3, 1, 2])).toBe(2)
  })
  it('even length averages the two middles', () => {
    expect(median([4, 1, 3, 2])).toBe(2.5)
  })
  it('empty is Infinity (never triggers a downgrade)', () => {
    expect(median([])).toBe(Infinity)
  })
})

describe('decideDowngrade (suggestion)', () => {
  const base = { current: 'high' as const, manual: false, alreadySuggested: false }

  it('suggests a tier when median fps is below the floor', () => {
    expect(decideDowngrade({ ...base, medianFps: FPS_FLOOR - 10 })).toBe('medium')
  })

  it('does nothing at or above the floor', () => {
    expect(decideDowngrade({ ...base, medianFps: FPS_FLOOR })).toBeNull()
    expect(decideDowngrade({ ...base, medianFps: 120 })).toBeNull()
  })

  it('respects a manual override', () => {
    expect(decideDowngrade({ ...base, medianFps: 10, manual: true })).toBeNull()
  })

  it('never suggests twice (alreadySuggested)', () => {
    expect(decideDowngrade({ ...base, medianFps: 10, alreadySuggested: true })).toBeNull()
  })

  it('cannot suggest below the lowest tier', () => {
    expect(decideDowngrade({ ...base, current: 'low', medianFps: 5 })).toBeNull()
  })
})

describe('once-per-run latch', () => {
  beforeEach(() => resetPerf())
  it('latches and clears', () => {
    expect(hasSuggestedDowngrade()).toBe(false)
    markSuggested()
    expect(hasSuggestedDowngrade()).toBe(true)
    resetPerf()
    expect(hasSuggestedDowngrade()).toBe(false)
  })
})
