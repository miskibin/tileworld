// Save / load — a single auto-written checkpoint at the dawn of each prep day.
// Mirrors runReset.ts: one module composes every store's serialize/hydrate. The
// localStorage layer is the only side-effecting part and is fully try/catch-wrapped
// so a disabled/absent store (private mode, node tests) degrades to "no save".
//
// Loading is only ever offered on the StartScreen (phase 'menu'), where the world
// is already mounted, clean and seeded — a fresh boot, or a Return-to-Menu that
// already did resetRun + bumpRun. So loadGame() just restores the stores in place
// and switches to prep; the live subscriptions propagate the restored state to the
// already-mounted scene. No remount is needed, which sidesteps the unmount-reset
// ordering entirely. See docs/superpowers/specs/2026-06-07-save-load-checkpoints-design.md.

import { setPhase } from './gameStore'
import { serializePlayer, hydratePlayer, type PlayerSave } from './playerStore'
import { serializeResources, hydrateResources } from './resourceStore'
import { serializeInventory, hydrateInventory, type InventorySave } from './inventoryStore'
import { serializeUpgrades, hydrateUpgrades } from './upgradeStore'
import { serializeUnlocks, hydrateUnlocks } from './weaponUnlockStore'
import { serializeCity, hydrateCity } from './cityStore'
import type { CityState } from './cityStore'
import { serializeCastle, hydrateCastle, type CastleSave } from './castleStore'
import { serializeTowers, hydrateTowers } from './towerStore'
import { serializeWave, hydrateWave } from './waveStore'
import { serializeGuards, hydrateGuards, type GuardSave } from './villagerStore'
import { getShopDiscount, setShopDiscount } from './shopStore'
import { getDifficulty, setDifficulty, type Difficulty } from './difficultyStore'

export const SAVE_VERSION = 1
export const STORAGE_KEY = 'tileworld.save'

/** The full checkpoint payload — everything a fresh <World> mount cannot reproduce. */
export interface SaveData {
  player: PlayerSave
  resource: { stone: number }
  inventory: InventorySave
  upgrades: string[]
  unlocks: string[]
  city: CityState
  castle: CastleSave
  towerMastery: boolean
  shopDiscount: number
  waveIndex: number
  difficulty: Difficulty
  guards: GuardSave[]
}

/** A small label for the StartScreen Continue button. */
export interface SaveMeta {
  night: number
  level: number
}

// ─── Pure composition (no storage) ───────────────────────────────────────────

/** Collect the live state of every persistent store into one JSON-safe payload. */
export function snapshot(): SaveData {
  return {
    player: serializePlayer(),
    resource: serializeResources(),
    inventory: serializeInventory(),
    upgrades: serializeUpgrades(),
    unlocks: serializeUnlocks(),
    city: serializeCity(),
    castle: serializeCastle(),
    towerMastery: serializeTowers().mastery,
    shopDiscount: getShopDiscount(),
    waveIndex: serializeWave().index,
    difficulty: getDifficulty(),
    guards: serializeGuards(),
  }
}

/** Apply a payload to the live stores. The caller must guarantee a clean, fully
 *  mounted world first — either the menu (loadGame restores in place) or a fresh
 *  post-bumpRun remount (RunLoad). restore() does NOT reset stores itself, so it
 *  must never run on top of a live run's leftover state. */
export function restore(d: SaveData): void {
  hydratePlayer(d.player)
  hydrateResources(d.resource)
  hydrateInventory(d.inventory)
  hydrateUpgrades(d.upgrades)
  hydrateUnlocks(d.unlocks)
  hydrateCity(d.city)
  hydrateCastle(d.castle)
  hydrateTowers({ mastery: d.towerMastery })
  setShopDiscount(d.shopDiscount)
  hydrateWave({ index: d.waveIndex })
  setDifficulty(d.difficulty)
  hydrateGuards(d.guards)
}

/** Upcoming night number for the saved wave index (index -1 = night 1). */
function nightFor(waveIndex: number): number {
  return waveIndex + 2
}

// ─── localStorage gateway (all failures → "no save") ─────────────────────────

/** Read + validate the stored blob. Returns the payload, or null if absent,
 *  unparseable, or a version we don't understand. Never throws. */
function readValidSave(): SaveData | null {
  try {
    if (typeof localStorage === 'undefined') return null
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { version?: number; data?: SaveData }
    if (parsed.version !== SAVE_VERSION || !parsed.data) return null
    return parsed.data
  } catch {
    return null
  }
}

/** Write a checkpoint of the current run. No-op on storage failure. */
export function writeSave(): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: SAVE_VERSION, data: snapshot() }))
  } catch {
    /* storage full / disabled — silently skip; gameplay is unaffected */
  }
}

/** True when a valid, current-version save exists. */
export function hasSave(): boolean {
  return readValidSave() !== null
}

/** Label payload for the Continue button, or null when there's no valid save. */
export function getSaveMeta(): SaveMeta | null {
  const d = readValidSave()
  if (!d) return null
  return { night: nightFor(d.waveIndex), level: d.player.level }
}

/** Delete the save slot (called on victory). No-op on failure. */
export function clearSave(): void {
  try {
    if (typeof localStorage === 'undefined') return
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* nothing to do */
  }
}

/**
 * Resume the saved run. Returns false (and does nothing) when there's no valid
 * save. On success: restore every store from the checkpoint, then switch to prep.
 * Safe to call only from the menu, where the world is already mounted and clean —
 * the restore's notifications update the live scene; restoring before setPhase means
 * the prep autosave that follows captures the restored state, not defaults.
 */
export function loadGame(): boolean {
  const d = readValidSave()
  if (!d) return false
  restore(d)
  setPhase('prep')
  return true
}
