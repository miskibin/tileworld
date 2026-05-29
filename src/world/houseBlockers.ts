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

export function getHouseBlockers(): HouseBlocker[] {
  return blockers
}
