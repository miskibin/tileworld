import { getOrks, getAliveOrks } from './orkStore'

export interface Objective {
  /** total orks on the map (captured once they register) */
  total: number
  /** orks still alive */
  remaining: number
  /** orks defeated so far */
  slain: number
  /** true once every ork has been cleared */
  won: boolean
}

// Orks register one frame after mount (see Mobs.tsx), so the total reads 0 at
// boot. Capture it lazily the first frame any orks exist and keep it fixed.
let total = 0

export function getObjective(): Objective {
  if (total === 0) {
    const registered = getOrks().length
    if (registered > 0) total = registered
  }
  const remaining = getAliveOrks().length
  return {
    total,
    remaining,
    slain: Math.max(0, total - remaining),
    won: total > 0 && remaining === 0,
  }
}
