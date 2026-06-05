import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  WAVES,
  PREP_DURATION,
  TAX_STIPEND,
  getWave,
  beginWave,
  markSpawned,
  setEnemiesAlive,
  resetWaves,
  subscribeWave,
  payWaveClearStipend,
  setPrepSecondsLeft,
  getPrepProgress,
} from './waveStore'
import { setTaxOffice, resetCity } from './cityStore'
import { resetPlayer, getGold } from './playerStore'

const VARIANTS = new Set(['grunt', 'scout', 'berserker', 'shaman'])

beforeEach(() => {
  resetWaves()
  resetCity()
  resetPlayer()
})

describe('wave progress state', () => {
  it('starts before the first wave', () => {
    const w = getWave()
    expect(w.index).toBe(-1)
    expect(w.total).toBe(WAVES.length)
    expect(w.enemiesAlive).toBe(0)
    expect(w.spawned).toBe(0)
  })

  it('beginWave sets the index and resets per-wave counters', () => {
    markSpawned()
    setEnemiesAlive(4)
    beginWave(2)
    const w = getWave()
    expect(w.index).toBe(2)
    expect(w.spawned).toBe(0)
    expect(w.enemiesAlive).toBe(0)
  })

  it('markSpawned increments the spawn count', () => {
    beginWave(0)
    markSpawned()
    markSpawned()
    expect(getWave().spawned).toBe(2)
  })

  it('resetWaves returns to the pre-game state', () => {
    beginWave(3)
    markSpawned()
    resetWaves()
    expect(getWave().index).toBe(-1)
    expect(getWave().spawned).toBe(0)
  })
})

describe('subscribeWave', () => {
  it('fires immediately and on changes, but skips no-op alive updates', () => {
    const fn = vi.fn()
    const unsub = subscribeWave(fn)
    expect(fn).toHaveBeenCalledTimes(1) // immediate

    setEnemiesAlive(5)
    expect(fn).toHaveBeenCalledTimes(2)
    setEnemiesAlive(5) // same value — no churn
    expect(fn).toHaveBeenCalledTimes(2)
    setEnemiesAlive(3)
    expect(fn).toHaveBeenCalledTimes(3)

    unsub()
    setEnemiesAlive(0)
    expect(fn).toHaveBeenCalledTimes(3) // unsubscribed
  })
})

describe('WAVES table', () => {
  it('has the documented shape: 8 waves ending in a boss', () => {
    expect(WAVES).toHaveLength(8)
    const boss = WAVES[WAVES.length - 1]
    expect(boss.count).toBe(1)
    expect(boss.hpScale).toBe(Math.max(...WAVES.map((w) => w.hpScale)))
  })

  it('escalates difficulty: hp up, spawn interval down', () => {
    for (let i = 1; i < WAVES.length; i++) {
      expect(WAVES[i].hpScale).toBeGreaterThanOrEqual(WAVES[i - 1].hpScale)
      expect(WAVES[i].spawnInterval).toBeLessThanOrEqual(WAVES[i - 1].spawnInterval)
    }
  })

  it('grows the horde up to the boss push', () => {
    const horde = WAVES.slice(0, -1) // every wave before the lone boss
    for (let i = 1; i < horde.length; i++) {
      expect(horde[i].count).toBeGreaterThanOrEqual(horde[i - 1].count)
    }
  })

  it('only references known ork variants', () => {
    for (const w of WAVES) {
      expect(w.count).toBeGreaterThan(0)
      expect(w.variants.length).toBeGreaterThan(0)
      for (const v of w.variants) expect(VARIANTS.has(v)).toBe(true)
    }
  })

  it('keeps a positive prep breather', () => {
    expect(PREP_DURATION).toBeGreaterThan(0)
  })
})

describe('Tax Office wave-clear stipend', () => {
  it('pays nothing when the Tax Office is not owned', () => {
    const before = getGold()
    expect(payWaveClearStipend()).toBe(0)
    expect(getGold()).toBe(before) // untouched
  })

  it('pays the stipend once the Tax Office is built', () => {
    setTaxOffice(true)
    const before = getGold()
    expect(payWaveClearStipend()).toBe(TAX_STIPEND)
    expect(getGold()).toBe(before + TAX_STIPEND)
  })

  it('pays the stipend each time it is called (per wave clear)', () => {
    setTaxOffice(true)
    const before = getGold()
    payWaveClearStipend()
    payWaveClearStipend()
    expect(getGold()).toBe(before + TAX_STIPEND * 2)
  })
})

describe('prep progress (sky-as-countdown)', () => {
  it('is 1 after reset (no prep time set yet)', () => {
    resetWaves()
    expect(getPrepProgress()).toBe(1)
  })

  it('is 0 when the full prep duration remains', () => {
    setPrepSecondsLeft(PREP_DURATION)
    expect(getPrepProgress()).toBe(0)
  })

  it('is 0.5 at the prep midpoint', () => {
    setPrepSecondsLeft(PREP_DURATION / 2)
    expect(getPrepProgress()).toBeCloseTo(0.5, 5)
  })

  it('clamps to [0,1] for out-of-range seconds', () => {
    setPrepSecondsLeft(PREP_DURATION + 50)
    expect(getPrepProgress()).toBe(0)
    setPrepSecondsLeft(-10)
    expect(getPrepProgress()).toBe(1)
  })
})
