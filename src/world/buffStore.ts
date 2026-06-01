// Three short timed buffs, granted by consumables. This module is the SINGLE
// source of truth for the gameplay multipliers — the damage/attack/move hot
// paths read the getters below rather than tracking buffs themselves. Expiry is
// lazy (compared against the clock on read); the HUD ticks once a second to
// drive the visible countdown and fire notify on expiry.

export type BuffKind = 'resist' | 'power' | 'haste'

interface BuffState {
  /** wall-clock (sec) the buff expires; 0 = inactive */
  until: number
  /** multiplier magnitude for this buff (e.g. resist 0.6, power 1.4) */
  mag: number
}

const buffs: Record<BuffKind, BuffState> = {
  resist: { until: 0, mag: 1 },
  power: { until: 0, mag: 1 },
  haste: { until: 0, mag: 1 },
}

const subs = new Set<() => void>()
function notify(): void {
  subs.forEach((fn) => fn())
}

function now(): number {
  return performance.now() * 0.001
}

function isActive(k: BuffKind): boolean {
  return buffs[k].until > now()
}

/** Grant (or refresh) a buff for `durationMs` with multiplier `mag`. */
export function applyBuff(kind: BuffKind, durationMs: number, mag: number): void {
  buffs[kind].until = now() + durationMs / 1000
  buffs[kind].mag = mag
  notify()
}

/** Incoming-damage multiplier (resist → <1, else 1). */
export function getDamageTakenMult(): number {
  return isActive('resist') ? buffs.resist.mag : 1
}

/** Outgoing-damage multiplier (power → >1, else 1). */
export function getDamageDealtMult(): number {
  return isActive('power') ? buffs.power.mag : 1
}

/** Move-speed multiplier (haste → >1, else 1). */
export function getSpeedMult(): number {
  return isActive('haste') ? buffs.haste.mag : 1
}

export interface ActiveBuff {
  kind: BuffKind
  /** seconds remaining */
  remain: number
}

/** Active buffs with remaining seconds, for the HUD. Pass the current time. */
export function getActiveBuffs(nowSec: number): ActiveBuff[] {
  const out: ActiveBuff[] = []
  for (const k of Object.keys(buffs) as BuffKind[]) {
    const remain = buffs[k].until - nowSec
    if (remain > 0) out.push({ kind: k, remain })
  }
  return out
}

export function subscribeBuffs(fn: () => void): () => void {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}

export function resetBuffs(): void {
  for (const k of Object.keys(buffs) as BuffKind[]) {
    buffs[k].until = 0
    buffs[k].mag = 1
  }
  notify()
}
