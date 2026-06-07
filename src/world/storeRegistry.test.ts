import { describe, it, expect, beforeEach } from 'vitest'
import { STORE_REGISTRY } from './storeRegistry'
import { snapshot, restore } from './saveGame'
import { resetRun } from './runReset'
import { addGold, getGold } from './playerStore'
import { addStone } from './resourceStore'
import { addItem, activateBagItem, getInventory } from './inventoryStore'
import { UPGRADE_NODES, purchase } from './upgradeStore'
import { reinforceCastle } from './castleStore'
import { setTowerMastery } from './towerStore'
import { unlockWeapon } from './weaponUnlockStore'
import { setShopDiscount } from './shopStore'
import { beginWave } from './waveStore'
import { setDifficulty } from './difficultyStore'
import { createVillager } from './villagerStore'
import { CITY_CENTER } from './cityPlan'

// The registry is the single source of truth that resetRun()/snapshot()/restore()
// all iterate. These tests pin its structural invariants and prove that EVERY
// persisted descriptor round-trips — the generic guard the old hand-listed
// snapshot/restore couldn't give (a forgotten field used to fail silently).

function memStorage(): Storage {
  const m = new Map<string, string>()
  return {
    get length() {
      return m.size
    },
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
  } as Storage
}

beforeEach(() => {
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = memStorage()
  resetRun()
})

describe('STORE_REGISTRY structure', () => {
  it('has unique keys', () => {
    const keys = STORE_REGISTRY.map((s) => s.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('pairs serialize with hydrate (never one without the other)', () => {
    for (const s of STORE_REGISTRY) {
      expect(!!s.serialize).toBe(!!s.hydrate)
    }
  })

  it('every descriptor does at least one of reset / serialize', () => {
    for (const s of STORE_REGISTRY) {
      expect(s.reset || s.serialize).toBeTruthy()
    }
  })

  it('keeps settings out of the per-run reset set: difficulty persists but never resets', () => {
    const difficulty = STORE_REGISTRY.find((s) => s.key === 'difficulty')
    expect(difficulty).toBeDefined()
    expect(difficulty!.serialize).toBeDefined() // it IS saved
    expect(difficulty!.hydrate).toBeDefined()
    expect(difficulty!.reset).toBeUndefined() // …but a restart leaves it alone
  })
})

describe('every registered store round-trips through snapshot/restore', () => {
  it('snapshot → resetRun → restore reproduces the snapshot for all persisted stores', () => {
    // Dirty state across the persisted stores so the round-trip isn't comparing
    // defaults to defaults.
    addGold(500)
    addStone(40)
    addItem('potion', 3)
    addItem('iron_armor')
    activateBagItem(getInventory().bag.findIndex((s) => s.itemId === 'iron_armor'))
    purchase(UPGRADE_NODES.find((n) => n.id === 'eco_district_1')!)
    reinforceCastle()
    setTowerMastery(true)
    unlockWeapon('axe')
    setShopDiscount(0.8)
    beginWave(2)
    setDifficulty('hard')
    createVillager({
      x: CITY_CENTER.x, y: 1, z: CITY_CENTER.z, facing: 0,
      homeX: CITY_CENTER.x, homeZ: CITY_CENTER.z,
      gardenX: CITY_CENTER.x, gardenZ: CITY_CENTER.z,
      doorX: CITY_CENTER.x, doorZ: CITY_CENTER.z,
      seed: 0.5, paletteIndex: 1,
    })

    const snap = snapshot()

    // Completeness: every persisted descriptor contributed a field to the payload.
    for (const s of STORE_REGISTRY) {
      if (s.serialize) expect(snap).toHaveProperty(s.key)
    }
    // …and no payload field comes from a store that can't read it back.
    const hydrateKeys = new Set(STORE_REGISTRY.filter((s) => s.hydrate).map((s) => s.key))
    for (const key of Object.keys(snap)) expect(hydrateKeys.has(key)).toBe(true)

    // Wipe everything (difficulty isn't reset, so push it off-target manually),
    // then restore and re-snapshot. A store missing serialize/hydrate or a
    // key mismatch would surface as a diff here.
    setDifficulty('easy')
    resetRun()
    expect(getGold()).not.toBe((snap.player as { gold: number }).gold)

    restore(snap)
    expect(snapshot()).toEqual(snap)
  })
})
