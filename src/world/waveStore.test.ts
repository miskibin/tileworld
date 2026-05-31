import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  WAVES,
  PREP_DURATION,
  getWave,
  beginWave,
  markSpawned,
  setEnemiesAlive,
  resetWaves,
  subscribeWave,
} from './waveStore'

const VARIANTS = new Set(['grunt', 'scout', 'berserker', 'shaman'])

beforeEach(() => {
  resetWaves()
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
