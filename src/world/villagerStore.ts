export type VillagerStateName = 'idle' | 'wander' | 'tend' | 'rest' | 'home'

export interface VillagerState {
  id: number
  /** current world (grid) position */
  x: number
  y: number
  z: number
  facing: number
  /** state-machine current state */
  state: VillagerStateName
  /** sim time (seconds) when current state was entered */
  stateSince: number
  /** sim time when current state should auto-transition */
  stateUntil: number
  /** target world position (used by wander / tend / rest) */
  targetX: number
  targetZ: number
  /** home positions to anchor schedule */
  homeX: number
  homeZ: number
  gardenX: number
  gardenZ: number
  doorX: number
  doorZ: number
  seed: number
  paletteIndex: number
  // pathfinding
  path: { x: number; z: number }[]
  pathIndex: number
  pathRecomputeAt: number
  /** sim time until which the door of this villager's house should stay open */
  doorOpenUntil: number
  // guard combat (deal-damage-only; villagers never take damage)
  /** sim time the current swing started; 0 = not swinging */
  attackingSince: number
  /** sim time until which no new swing may start */
  attackReadyAt: number
  /** whether the current swing already landed its hit */
  attackHitDealt: boolean
}

const villagers: VillagerState[] = []
let nextId = 0
const subs = new Set<(list: VillagerState[]) => void>()

/** Notified whenever a villager is added/removed so views re-render. */
export function subscribeVillagers(fn: (list: VillagerState[]) => void): () => void {
  subs.add(fn)
  fn(villagers)
  return () => {
    subs.delete(fn)
  }
}

function notifyVillagers(): void {
  subs.forEach((fn) => fn(villagers))
}

export function createVillager(
  init: Omit<
    VillagerState,
    | 'id'
    | 'state'
    | 'stateSince'
    | 'stateUntil'
    | 'targetX'
    | 'targetZ'
    | 'path'
    | 'pathIndex'
    | 'pathRecomputeAt'
    | 'doorOpenUntil'
    | 'attackingSince'
    | 'attackReadyAt'
    | 'attackHitDealt'
  >,
): VillagerState {
  const v: VillagerState = {
    id: nextId++,
    state: 'idle',
    stateSince: 0,
    stateUntil: 0,
    targetX: init.x,
    targetZ: init.z,
    path: [],
    pathIndex: 0,
    pathRecomputeAt: 0,
    doorOpenUntil: 0,
    attackingSince: 0,
    attackReadyAt: 0,
    attackHitDealt: false,
    ...init,
  }
  villagers.push(v)
  notifyVillagers()
  return v
}

export function resetVillagers(): void {
  villagers.length = 0
  nextId = 0
  notifyVillagers()
}

export function getVillagers(): VillagerState[] {
  return villagers
}

/** Remove a villager (e.g. when one takes up the fallen hero's blade). */
export function removeVillager(id: number): void {
  const i = villagers.findIndex((v) => v.id === id)
  if (i === -1) return
  villagers.splice(i, 1)
  notifyVillagers()
}

/** Nearest living villager to a grid point — the heir who inherits the blade.
 *  Null when the town is empty (the bloodline ends). */
export function nearestVillager(x: number, z: number): VillagerState | null {
  let best: VillagerState | null = null
  let bestD = Infinity
  for (const v of villagers) {
    const d = (v.x - x) ** 2 + (v.z - z) ** 2
    if (d < bestD) {
      bestD = d
      best = v
    }
  }
  return best
}
