import { describe, it, expect } from 'vitest'
import { stepWaveDirector, type WaveTimers } from './waveLogic'
import { WAVES, PREP_DURATION, type WaveProgress } from './waveStore'
import type { GamePhase } from './gameStore'

// Pure reducer — no stores, no clock. Drive it with explicit phase/wave/timers
// and assert the emitted action stream + next timers.

const timers = (t: Partial<WaveTimers> = {}): WaveTimers => ({
  prepEndsAt: 0,
  nextSpawnAt: 0,
  spawnIndex: 0,
  ...t,
})

const wave = (w: Partial<WaveProgress> = {}): WaveProgress => ({
  index: 0,
  total: WAVES.length,
  enemiesAlive: 0,
  spawned: 0,
  prepSecondsLeft: 0,
  ...w,
})

const step = (phase: GamePhase, w: WaveProgress, t: WaveTimers, now: number, alive: number) =>
  stepWaveDirector({ phase, wave: w, timers: t, now, alive })

describe('prep phase', () => {
  it('arms the prep countdown on first tick without acting', () => {
    const r = step('prep', wave({ index: -1 }), timers(), 100, 0)
    expect(r.actions).toEqual([])
    expect(r.timers.prepEndsAt).toBe(100 + PREP_DURATION)
  })

  it('waits while the countdown is running', () => {
    const r = step('prep', wave({ index: -1 }), timers({ prepEndsAt: 112 }), 111, 0)
    expect(r.actions).toEqual([])
    expect(r.timers.prepEndsAt).toBe(112)
  })

  it('begins the next wave and switches to wave when the timer elapses', () => {
    const r = step('prep', wave({ index: -1 }), timers({ prepEndsAt: 112 }), 112, 0)
    expect(r.actions).toEqual([
      { type: 'beginWave', index: 0 },
      { type: 'setPhase', phase: 'wave' },
    ])
    expect(r.timers).toEqual({ prepEndsAt: 0, nextSpawnAt: 112, spawnIndex: 0 })
  })
})

describe('wave phase — spawning', () => {
  it('spawns one ork when the interval is up', () => {
    const r = step('wave', wave({ index: 0, spawned: 0 }), timers(), 0, 0)
    expect(r.actions).toEqual([
      { type: 'spawn', variant: 'grunt', hp: 242, spawnIndex: 0, waveIndex: 0 }, // grunt 220 × wave-0 hpScale 1.1
    ])
    expect(r.timers.spawnIndex).toBe(1)
    expect(r.timers.nextSpawnAt).toBe(WAVES[0].spawnInterval)
  })

  it('holds fire until the spawn interval has passed', () => {
    const t = timers({ nextSpawnAt: 1.6, spawnIndex: 1 })
    expect(step('wave', wave({ index: 0, spawned: 1 }), t, 1.0, 1).actions).toEqual([])
    expect(step('wave', wave({ index: 0, spawned: 1 }), t, 1.6, 1).actions).toHaveLength(1)
  })

  it('rotates through the wave variant pool by spawn index', () => {
    // Wave 2 pool is [grunt, scout, grunt, berserker]; index 1 -> scout.
    const r = step('wave', wave({ index: 1, spawned: 1 }), timers({ spawnIndex: 1 }), 5, 1)
    expect(r.actions[0]).toMatchObject({ type: 'spawn', variant: 'scout' })
  })

  it('scales ork hp by the wave hpScale', () => {
    // Wave 3 hpScale 1.15, grunt base hp 220 -> round(253).
    const r = step('wave', wave({ index: 2, spawned: 0 }), timers(), 0, 0)
    expect(r.actions[0]).toMatchObject({ variant: 'grunt', hp: 253 })
  })

  it('stops spawning once the quota is met', () => {
    const full = WAVES[0].count
    const r = step('wave', wave({ index: 0, spawned: full }), timers(), 99, 3)
    expect(r.actions.find((a) => a.type === 'spawn')).toBeUndefined()
  })
})

describe('wave phase — clearing', () => {
  it('does not advance while enemies remain', () => {
    const full = WAVES[0].count
    const r = step('wave', wave({ index: 0, spawned: full }), timers({ spawnIndex: full }), 99, 2)
    expect(r.actions).toEqual([])
  })

  it('returns to prep after a non-final wave is cleared', () => {
    const full = WAVES[0].count
    const r = step('wave', wave({ index: 0, spawned: full }), timers({ spawnIndex: full }), 99, 0)
    expect(r.actions).toEqual([{ type: 'setPhase', phase: 'prep' }])
  })

  it('declares victory after the final wave is cleared', () => {
    const last = WAVES.length - 1
    const r = step('wave', wave({ index: last, spawned: WAVES[last].count }), timers({ spawnIndex: 1 }), 99, 0)
    expect(r.actions).toEqual([{ type: 'setPhase', phase: 'victory' }])
  })
})

describe('boss wave', () => {
  it('spawns the lone high-hp berserker', () => {
    const last = WAVES.length - 1
    const r = step('wave', wave({ index: last, spawned: 0 }), timers(), 0, 0)
    // boss: berserker base hp 270 * hpScale 14 = 3780
    expect(r.actions).toContainEqual({ type: 'spawn', variant: 'berserker', hp: 3780, spawnIndex: 0, waveIndex: last })
  })
})

describe('inert states', () => {
  it('does nothing for an out-of-range wave index', () => {
    expect(step('wave', wave({ index: 99, spawned: 0 }), timers(), 0, 0).actions).toEqual([])
  })

  it('does nothing in menu / victory / defeat', () => {
    for (const phase of ['menu', 'victory', 'defeat'] as GamePhase[]) {
      expect(step(phase, wave(), timers(), 5, 0).actions).toEqual([])
    }
  })

  it('never mutates the input timers', () => {
    const t = timers()
    step('wave', wave({ index: 0, spawned: 0 }), t, 0, 0)
    expect(t).toEqual({ prepEndsAt: 0, nextSpawnAt: 0, spawnIndex: 0 })
  })
})
