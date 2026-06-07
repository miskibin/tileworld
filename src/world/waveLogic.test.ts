import { describe, it, expect } from 'vitest'
import { stepWaveDirector, effectiveCount, type WaveTimers } from './waveLogic'
import { WAVES, PREP_DURATION, type WaveProgress } from './waveStore'
import { modsFor } from './difficultyStore'
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
      { type: 'spawn', variant: 'grunt', hp: 254, spawnIndex: 0, waveIndex: 0 }, // grunt 254 × wave-0 hpScale 1.0
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
    // Wave 3 hpScale 1.45, grunt base hp 254 -> round(368).
    const r = step('wave', wave({ index: 2, spawned: 0 }), timers(), 0, 0)
    expect(r.actions[0]).toMatchObject({ variant: 'grunt', hp: 368 })
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
    // boss: berserker base hp 306 * hpScale 14 = 4284
    expect(r.actions).toContainEqual({ type: 'spawn', variant: 'berserker', hp: 4284, spawnIndex: 0, waveIndex: last })
  })
})

describe('difficulty mods', () => {
  const easy = modsFor('easy')
  const hard = modsFor('hard')

  it('defaults to Normal (no scaling) when mods are omitted', () => {
    // The existing baseline tests already assert Normal numbers; this just pins
    // that the default path equals the explicit normal preset.
    const r = stepWaveDirector({
      phase: 'wave', wave: wave({ index: 0, spawned: 0 }), timers: timers(), now: 0, alive: 0,
      mods: modsFor('normal'),
    })
    expect(r.actions[0]).toMatchObject({ variant: 'grunt', hp: 254 })
  })

  it('scales the prep day length by prepMul', () => {
    const r = stepWaveDirector({
      phase: 'prep', wave: wave({ index: -1 }), timers: timers(), now: 100, alive: 0, mods: easy,
    })
    expect(r.timers.prepEndsAt).toBe(100 + PREP_DURATION * easy.prepMul)
  })

  it('scales ork hp by hpMul (hard = tougher)', () => {
    // grunt 254 × wave-0 hpScale 1.0 × hard hpMul 1.2 = round(304.8) = 305
    const r = stepWaveDirector({
      phase: 'wave', wave: wave({ index: 0, spawned: 0 }), timers: timers(), now: 0, alive: 0, mods: hard,
    })
    expect(r.actions[0]).toMatchObject({ variant: 'grunt', hp: 305 })
  })

  it('scales head-count by countMul and clears against the scaled quota', () => {
    // Wave 4 (index 3) base count 15; hard ×1.25 = round(18.75) = 19.
    const idx = 3
    const scaled = effectiveCount(idx, hard)
    expect(scaled).toBe(19)
    // Still spawning at 18/19 → quota not met, no clear even with 0 alive.
    const notDone = stepWaveDirector({
      phase: 'wave', wave: wave({ index: idx, spawned: scaled - 1 }), timers: timers({ spawnIndex: scaled - 1 }),
      now: 99, alive: 0, mods: hard,
    })
    expect(notDone.actions.find((a) => a.type === 'setPhase')).toBeUndefined()
    // At 19/19 with 0 alive → clears to prep.
    const done = stepWaveDirector({
      phase: 'wave', wave: wave({ index: idx, spawned: scaled }), timers: timers({ spawnIndex: scaled }),
      now: 99, alive: 0, mods: hard,
    })
    expect(done.actions).toContainEqual({ type: 'setPhase', phase: 'prep' })
  })

  it('never scales a wave below one ork', () => {
    expect(effectiveCount(WAVES.length - 1, easy)).toBeGreaterThanOrEqual(1)
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
