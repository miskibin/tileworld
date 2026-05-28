export type VillagerStateName = 'idle' | 'wander' | 'tend' | 'rest'

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
}

const villagers: VillagerState[] = []
let nextId = 0

export function createVillager(
  init: Omit<VillagerState, 'id' | 'state' | 'stateSince' | 'stateUntil' | 'targetX' | 'targetZ'>,
): VillagerState {
  const v: VillagerState = {
    id: nextId++,
    state: 'idle',
    stateSince: 0,
    stateUntil: 0,
    targetX: init.x,
    targetZ: init.z,
    ...init,
  }
  villagers.push(v)
  return v
}

export function resetVillagers(): void {
  villagers.length = 0
  nextId = 0
}

export function getVillagers(): VillagerState[] {
  return villagers
}
