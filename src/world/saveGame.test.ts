import { describe, it, expect, beforeEach } from 'vitest'
import {
  snapshot,
  restore,
  writeSave,
  hasSave,
  getSaveMeta,
  clearSave,
  loadGame,
  SAVE_VERSION,
  STORAGE_KEY,
} from './saveGame'
import { getPhase } from './gameStore'
import { resetRun } from './runReset'
import { addGold, getGold, getPlayer } from './playerStore'
import { addStone, getStone } from './resourceStore'
import { addItem, hasItem, activateBagItem, getInventory } from './inventoryStore'
import { UPGRADE_NODES, purchase, isPurchased } from './upgradeStore'
import { getCity } from './cityStore'
import { reinforceCastle, getCastle } from './castleStore'
import { setTowerMastery, getTowers } from './towerStore'
import { unlockWeapon, isWeaponUnlocked } from './weaponUnlockStore'
import { setShopDiscount, getShopDiscount } from './shopStore'
import { beginWave, getWave } from './waveStore'
import { setDifficulty, getDifficulty } from './difficultyStore'
import { createVillager, getVillagers } from './villagerStore'
import { CITY_CENTER } from './cityPlan'

// In-memory localStorage stand-in (vitest runs in the `node` env — no DOM storage).
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

const guardCount = () => getVillagers().filter((v) => v.isGuard).length

beforeEach(() => {
  ;(globalThis as unknown as { localStorage: Storage }).localStorage = memStorage()
  resetRun()
})

describe('snapshot / restore round-trip', () => {
  it('restores progression, economy, defenses, inventory, wave and difficulty', () => {
    addGold(500)
    addStone(40)
    addItem('potion', 3)
    addItem('iron_armor')
    // equip the armor so equippedArmorId / armorDamageMult are exercised
    const armorSlot = getInventory().bag.findIndex((s) => s.itemId === 'iron_armor')
    activateBagItem(armorSlot)

    const eco = UPGRADE_NODES.find((n) => n.id === 'eco_district_1')!
    purchase(eco) // builds a house + a castle guard villager, spends gold
    reinforceCastle()
    setTowerMastery(true)
    unlockWeapon('axe')
    setShopDiscount(0.8)
    beginWave(2)
    setDifficulty('hard')

    const goldNow = getGold()
    const snap = snapshot()

    // Wipe everything (as a load would), then restore from the snapshot.
    setDifficulty('easy')
    resetRun()
    expect(getGold()).not.toBe(goldNow)
    expect(getCity().housesBuilt).toBe(0)

    restore(snap)

    expect(getGold()).toBe(goldNow)
    expect(getStone()).toBe(40)
    expect(hasItem('potion')).toBe(true)
    expect(getInventory().equippedArmorId).toBe('iron_armor')
    expect(getInventory().armorDamageMult).toBeCloseTo(1 - 0.2)
    expect(getCity().housesBuilt).toBe(1)
    expect(isPurchased('eco_district_1')).toBe(true)
    expect(getCastle().reinforced).toBe(true)
    expect(getTowers().mastery).toBe(true)
    expect(isWeaponUnlocked('axe')).toBe(true)
    expect(getShopDiscount()).toBe(0.8)
    expect(getWave().index).toBe(2)
    expect(getDifficulty()).toBe('hard')
  })

  it('restores the castle guard roster, including the recruited flag', () => {
    const g = createVillager({
      x: CITY_CENTER.x, y: 1, z: CITY_CENTER.z, facing: 0,
      homeX: CITY_CENTER.x, homeZ: CITY_CENTER.z,
      gardenX: CITY_CENTER.x, gardenZ: CITY_CENTER.z,
      doorX: CITY_CENTER.x, doorZ: CITY_CENTER.z,
      seed: 0.5, paletteIndex: 1,
    })
    g.recruited = true
    expect(g.isGuard).toBe(true) // sanity: CITY_CENTER is inside the castle

    const snap = snapshot()
    expect(snap.guards.length).toBe(1)

    resetRun()
    expect(guardCount()).toBe(0)

    restore(snap)
    expect(guardCount()).toBe(1)
    const restored = getVillagers().find((v) => v.isGuard)!
    expect(restored.recruited).toBe(true)
    expect(restored.paletteIndex).toBe(1)
  })

  it('does not re-create wilderness (non-guard) villagers', () => {
    createVillager({
      x: 5, y: 1, z: 5, facing: 0, homeX: 5, homeZ: 5,
      gardenX: 5, gardenZ: 5, doorX: 5, doorZ: 5, seed: 0.1, paletteIndex: 0,
    })
    const snap = snapshot()
    expect(snap.guards.length).toBe(0) // the far-out villager is not a guard
  })
})

describe('localStorage layer', () => {
  it('writeSave makes hasSave true and exposes meta', () => {
    addGold(120)
    beginWave(3) // night index 3 → "Night 5"
    writeSave()

    expect(hasSave()).toBe(true)
    const meta = getSaveMeta()
    expect(meta).not.toBeNull()
    expect(meta!.night).toBe(5) // index 3 + 2
    expect(meta!.level).toBe(getPlayer().level)
  })

  it('clearSave removes the save', () => {
    writeSave()
    expect(hasSave()).toBe(true)
    clearSave()
    expect(hasSave()).toBe(false)
    expect(getSaveMeta()).toBeNull()
  })

  it('treats corrupt JSON as no save', () => {
    localStorage.setItem(STORAGE_KEY, 'this is not json {')
    expect(hasSave()).toBe(false)
    expect(getSaveMeta()).toBeNull()
    expect(loadGame()).toBe(false)
  })

  it('treats a version mismatch as no save', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SAVE_VERSION + 99, data: {} }))
    expect(hasSave()).toBe(false)
  })

  it('degrades to no meta (never throws) on a current-version save missing player data', () => {
    // A partial / old-build blob can pass the version check yet lack player. The
    // StartScreen renders the Continue button from getSaveMeta, so this must return
    // null rather than throw and brick the menu.
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SAVE_VERSION, data: { waveIndex: 3 } }))
    expect(() => getSaveMeta()).not.toThrow()
    expect(getSaveMeta()).toBeNull()
  })

  it('degrades to no meta on a save missing the wave index', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SAVE_VERSION, data: { player: { level: 2 } } }))
    expect(getSaveMeta()).toBeNull()
  })

  it('reports no save when the slot is empty', () => {
    expect(hasSave()).toBe(false)
    expect(getSaveMeta()).toBeNull()
    expect(loadGame()).toBe(false)
  })

  it('loadGame restores the stored run and enters prep', () => {
    addGold(77)
    beginWave(1)
    const savedGold = getGold()
    writeSave()

    // Wipe the live run, then load it back.
    resetRun()
    expect(getGold()).not.toBe(savedGold)
    expect(getWave().index).toBe(-1)

    expect(loadGame()).toBe(true)
    expect(getGold()).toBe(savedGold)
    expect(getWave().index).toBe(1)
    expect(getPhase()).toBe('prep')
  })
})
