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
import type { PlayerSave } from './playerStore'
import { STORE_REGISTRY } from './storeRegistry'

export const SAVE_VERSION = 1
export const STORAGE_KEY = 'tileworld.save'

/** The checkpoint payload — everything a fresh <World> mount cannot reproduce,
 *  keyed by each persisted store's registry `key`. Built by snapshot() from the
 *  registry rather than hand-listed, so a new persisted store can't be forgotten
 *  here. JSON-roundtripped, so values read back as `unknown`. */
export type SaveData = Record<string, unknown>

/** A small label for the StartScreen Continue button. */
export interface SaveMeta {
  night: number
  level: number
}

// ─── Pure composition (no storage) ───────────────────────────────────────────

/** Collect the live state of every persistent store into one JSON-safe payload. */
export function snapshot(): SaveData {
  const data: SaveData = {}
  for (const store of STORE_REGISTRY) {
    if (store.serialize) data[store.key] = store.serialize()
  }
  return data
}

/** Apply a payload to the live stores. The caller must guarantee a clean, fully
 *  mounted world first — either the menu (loadGame restores in place) or a fresh
 *  post-bumpRun remount (RunLoad). restore() does NOT reset stores itself, so it
 *  must never run on top of a live run's leftover state. */
export function restore(d: SaveData): void {
  for (const store of STORE_REGISTRY) {
    if (store.hydrate) store.hydrate(d[store.key])
  }
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
  // A current-version blob can still be partial (older build, interrupted write).
  // Validate the two fields we read so a bad save degrades to "no save" here rather
  // than throwing during the StartScreen's Continue-button render and bricking the menu.
  const player = d.player as PlayerSave | undefined
  if (!player || typeof player.level !== 'number' || typeof d.waveIndex !== 'number') return null
  return { night: nightFor(d.waveIndex), level: player.level }
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
