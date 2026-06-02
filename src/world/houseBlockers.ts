/**
 * Axis-aligned rectangular footprints (in grid coords inside the offset group)
 * that pathfinding and movement treat as solid walls. Used so villagers and
 * orks route around houses instead of clipping through them.
 */
export interface HouseBlocker {
  minX: number
  minZ: number
  maxX: number
  maxZ: number
  /** which component registered this (so resets are scoped, not global) */
  owner?: string
}

const blockers: HouseBlocker[] = []

export function registerHouseBlocker(b: HouseBlocker, owner = ''): void {
  for (let i = 0; i < blockers.length; i++) {
    const e = blockers[i]
    if (e.minX === b.minX && e.minZ === b.minZ && e.maxX === b.maxX && e.maxZ === b.maxZ && e.owner === owner) {
      return
    }
  }
  blockers.push({ ...b, owner })
}

/**
 * Clear blockers. With no owner, clears everything; with an owner, clears only
 * that owner's entries — so two independent components (City, VillagerCrowd)
 * don't wipe each other's footprints on unmount.
 */
export function resetHouseBlockers(owner?: string): void {
  if (owner === undefined) {
    blockers.length = 0
    return
  }
  for (let i = blockers.length - 1; i >= 0; i--) {
    if (blockers[i].owner === owner) blockers.splice(i, 1)
  }
}

export function houseBlocksAt(x: number, z: number): boolean {
  for (let i = 0; i < blockers.length; i++) {
    const b = blockers[i]
    if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) return true
  }
  return false
}

/**
 * True if a registered blocker (wall / house / tower / keep) sits between the
 * two points. Samples the segment interior (endpoints skipped, so an attacker or
 * target standing flush against a structure doesn't self-block). Used to stop
 * melee landing through a city wall — combatants must come around to a gate.
 */
export function wallBetween(ax: number, az: number, bx: number, bz: number): boolean {
  const dx = bx - ax
  const dz = bz - az
  const len = Math.hypot(dx, dz)
  if (len < 0.001) return false
  const steps = Math.max(2, Math.ceil(len / 0.25))
  for (let i = 1; i < steps; i++) {
    const t = i / steps
    if (houseBlocksAt(ax + dx * t, az + dz * t)) return true
  }
  return false
}

export function getHouseBlockers(): HouseBlocker[] {
  return blockers
}
