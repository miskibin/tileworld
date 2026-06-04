// Independent merchant NPCs that populate the trader village. They never fight,
// never fall, and orks ignore them — so unlike villagers they live in their OWN
// array here, which makes them STRUCTURALLY incapable of being a succession heir
// or a guard (no defensive filtering needed anywhere). A trader only becomes a
// villager at recruit time (see recruit.ts), at which point it's removed from
// this store and added to villagerStore. Hand-rolled external store, same shape
// as the rest of src/world/*Store.ts.

export type TraderStateName = 'idle' | 'wander' | 'tend'

export interface TraderState {
  id: number
  /** current world (grid) position */
  x: number
  y: number
  z: number
  facing: number
  /** state-machine current state */
  state: TraderStateName
  /** sim time (seconds) when current state was entered */
  stateSince: number
  /** sim time when current state should auto-transition */
  stateUntil: number
  /** target world position (used by wander / tend) */
  targetX: number
  targetZ: number
  /** anchor points for the daily loiter-around-the-stall schedule */
  homeX: number
  homeZ: number
  gardenX: number
  gardenZ: number
  doorX: number
  doorZ: number
  seed: number
  paletteIndex: number
  /** shop title shown when the player trades with this merchant */
  name: string
  // pathfinding
  path: { x: number; z: number }[]
  pathIndex: number
  pathRecomputeAt: number
}

const traders: TraderState[] = []
let nextId = 0
const subs = new Set<(list: TraderState[]) => void>()

/** Notified whenever a trader is added/removed so views re-render. */
export function subscribeTraders(fn: (list: TraderState[]) => void): () => void {
  subs.add(fn)
  fn(traders)
  return () => {
    subs.delete(fn)
  }
}

function notifyTraders(): void {
  subs.forEach((fn) => fn(traders))
}

export function createTrader(
  init: Omit<
    TraderState,
    | 'id'
    | 'state'
    | 'stateSince'
    | 'stateUntil'
    | 'targetX'
    | 'targetZ'
    | 'path'
    | 'pathIndex'
    | 'pathRecomputeAt'
  >,
): TraderState {
  const t: TraderState = {
    id: nextId++,
    state: 'idle',
    stateSince: 0,
    stateUntil: 0,
    targetX: init.x,
    targetZ: init.z,
    path: [],
    pathIndex: 0,
    pathRecomputeAt: 0,
    ...init,
  }
  traders.push(t)
  notifyTraders()
  return t
}

export function getTraders(): TraderState[] {
  return traders
}

/** Remove a trader (e.g. when recruited into the militia). */
export function removeTrader(id: number): void {
  const i = traders.findIndex((t) => t.id === id)
  if (i === -1) return
  traders.splice(i, 1)
  notifyTraders()
}

export function resetTraders(): void {
  traders.length = 0
  nextId = 0
  notifyTraders()
}

/** Nearest trader to a grid point within `maxDist`, or null. Used by the
 *  interaction layer to pick which merchant the player is talking to. */
export function nearestTrader(x: number, z: number, maxDist: number): TraderState | null {
  let best: TraderState | null = null
  let bestD = maxDist * maxDist
  for (const t of traders) {
    const d = (t.x - x) ** 2 + (t.z - z) ** 2
    if (d < bestD) {
      bestD = d
      best = t
    }
  }
  return best
}
