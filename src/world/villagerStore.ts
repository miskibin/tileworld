import { isInsideCastle } from './cityPlan'

export type VillagerStateName = 'idle' | 'wander' | 'tend' | 'rest' | 'home'

/** HP a militia/villager can soak before being downed. */
export const VILLAGER_MAX_HP = 70

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
  // ── Defender combat (orks can now down villagers; revived each prep) ──
  hp: number
  maxHp: number
  /** downed by orks — lies still until revived at the next prep phase */
  downed: boolean
  /** castle-dwelling villagers double as militia — orks single these out */
  isGuard: boolean
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
    | 'hp'
    | 'maxHp'
    | 'downed'
    | 'isGuard'
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
    hp: VILLAGER_MAX_HP,
    maxHp: VILLAGER_MAX_HP,
    downed: false,
    isGuard: isInsideCastle(init.homeX, init.homeZ),
    ...init,
  }
  villagers.push(v)
  notifyVillagers()
  return v
}

/** Apply damage to a villager. Returns true if this hit downs them. */
export function damageVillager(v: VillagerState, amount: number): boolean {
  if (v.downed) return false
  v.hp = Math.max(0, v.hp - amount)
  if (v.hp <= 0) {
    v.downed = true
    notifyVillagers() // discrete: an heir is (temporarily) lost — refresh counts
    return true
  }
  return false
}

/** Stand every downed villager back up at full HP (called each prep phase). */
export function reviveVillagers(): void {
  let changed = false
  for (const v of villagers) {
    if (v.downed) changed = true
    v.downed = false
    v.hp = v.maxHp
  }
  if (changed) notifyVillagers() // discrete: heirs are back on their feet
}

/** Living militia (castle guards) orks can target. Allocation-free-ish scan. */
export function getDefenderVillagers(): VillagerState[] {
  return villagers.filter((v) => v.isGuard && !v.downed)
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

/** Count of villagers able to take up the blade right now (downed ones can't,
 *  though they revive at the next prep). This is the run's live pool of lives. */
export function getStandingVillagerCount(): number {
  let n = 0
  for (const v of villagers) if (!v.downed) n++
  return n
}

/** Nearest standing villager to a grid point — the heir who inherits the blade.
 *  Downed townsfolk can't carry it on; null when none remain (bloodline ends). */
export function nearestVillager(x: number, z: number): VillagerState | null {
  let best: VillagerState | null = null
  let bestD = Infinity
  for (const v of villagers) {
    if (v.downed) continue
    const d = (v.x - x) ** 2 + (v.z - z) ** 2
    if (d < bestD) {
      bestD = d
      best = v
    }
  }
  return best
}
