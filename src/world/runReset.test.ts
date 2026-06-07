import { describe, it, expect } from 'vitest'
import { resetRun } from './runReset'
import { addGold, getGold, resetPlayer } from './playerStore'
import { addStone, getStone } from './resourceStore'
import { beginWave, getWave } from './waveStore'
import { setSettingsOpen, isSettingsOpen } from './settingsStore'
import { setInventoryOpen, isInventoryOpen } from './inventoryStore'
import { setPaused, isPaused } from './pauseStore'

// resetRun() composes every per-store reset. Rather than re-test each store's own
// reset (those have their own suites), this pins that resetRun actually CALLS the
// resets across the different state categories + clears the freeze/modals — the
// thing that breaks if a new store is added and forgotten here.

describe('resetRun', () => {
  it('returns mutated run state to its baseline and clears modals/freeze', () => {
    // Capture the player's clean baseline gold, then dirty everything.
    resetPlayer()
    const baseGold = getGold()

    addGold(999)
    addStone(50)
    beginWave(4)
    setSettingsOpen(true)
    setInventoryOpen(true)
    setPaused(true)

    // sanity: state really is dirty
    expect(getGold()).not.toBe(baseGold)
    expect(getStone()).toBe(50)
    expect(getWave().index).toBe(4)

    resetRun()

    expect(getGold()).toBe(baseGold)
    expect(getStone()).toBe(0)
    expect(getWave().index).toBe(-1)
    expect(isSettingsOpen()).toBe(false)
    expect(isInventoryOpen()).toBe(false)
    expect(isPaused()).toBe(false)
  })

  it('is idempotent — a second call from a clean state is a no-op', () => {
    resetRun()
    const gold = getGold()
    resetRun()
    expect(getGold()).toBe(gold)
    expect(getWave().index).toBe(-1)
  })
})
