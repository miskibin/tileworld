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
}

const blockers: HouseBlocker[] = []

export function registerHouseBlocker(b: HouseBlocker): void {
  for (let i = 0; i < blockers.length; i++) {
    const e = blockers[i]
    if (e.minX === b.minX && e.minZ === b.minZ && e.maxX === b.maxX && e.maxZ === b.maxZ) {
      return
    }
  }
  blockers.push(b)
}

export function resetHouseBlockers(): void {
  blockers.length = 0
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
