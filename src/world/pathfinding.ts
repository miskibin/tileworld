import { COLS, ROWS, standable, canStep } from './tileMap'
import { houseBlocksAt } from './houseBlockers'
import { isObstacleTile } from './obstacles'

export interface PathPoint {
  x: number
  z: number
}

/** Can a walker occupy tile (cx,cz) at all — terrain standable + no prop/house.
 *  The *climb* feasibility between two tiles is a separate canStep() check in
 *  the neighbour loop, so a tile can be standable yet unreachable from a
 *  too-tall neighbour (a cliff face). */
function isWalkable(cx: number, cz: number): boolean {
  if (cx < 0 || cz < 0 || cx >= COLS || cz >= ROWS) return false
  // House footprints block pathing even if the tile beneath is land.
  if (houseBlocksAt(cx + 0.5, cz + 0.5)) return false
  // Tiles holding a collidable prop (tree/boulder/…) are impassable, so paths
  // route around them instead of wedging the walker against the trunk.
  if (isObstacleTile(cx, cz)) return false
  // Land (any climbable height) or a bridge deck — shared rule with movement.
  return standable(cx, cz)
}

const NEIGHBORS: ReadonlyArray<readonly [number, number]> = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
]

/**
 * A* path on the tile grid. Returns world-space points at tile centers
 * (x.5, z.5). Empty array if no path or already at goal cell.
 */
export function findPath(
  start: PathPoint,
  goal: PathPoint,
  maxNodes = 800,
): PathPoint[] {
  const sx = Math.floor(start.x)
  const sz = Math.floor(start.z)
  const gx = Math.floor(goal.x)
  const gz = Math.floor(goal.z)
  if (sx === gx && sz === gz) return []
  if (!isWalkable(sx, sz) || !isWalkable(gx, gz)) return []

  const key = (x: number, z: number) => z * COLS + x
  const h = (x: number, z: number) => Math.hypot(x - gx, z - gz)

  interface Node {
    f: number
    g: number
    x: number
    z: number
  }

  const open = new Map<number, Node>()
  const closed = new Set<number>()
  const cameFrom = new Map<number, number>()

  const startKey = key(sx, sz)
  open.set(startKey, { f: h(sx, sz), g: 0, x: sx, z: sz })

  let visited = 0
  while (open.size > 0 && visited < maxNodes) {
    visited++

    // Find lowest f-score in open set (linear — fine for our grid size).
    let bestKey = -1
    let bestF = Infinity
    let bestNode: Node | null = null
    for (const [k, v] of open) {
      if (v.f < bestF) {
        bestF = v.f
        bestKey = k
        bestNode = v
      }
    }
    if (!bestNode) break

    open.delete(bestKey)
    closed.add(bestKey)

    const { x: cx, z: cz, g } = bestNode
    if (cx === gx && cz === gz) {
      // Reconstruct
      const path: PathPoint[] = []
      let k = bestKey
      while (k !== startKey) {
        path.push({ x: (k % COLS) + 0.5, z: Math.floor(k / COLS) + 0.5 })
        const prev = cameFrom.get(k)
        if (prev === undefined) break
        k = prev
      }
      path.reverse()
      return path
    }

    for (const [dx, dz] of NEIGHBORS) {
      const nx = cx + dx
      const nz = cz + dz
      if (nx < 0 || nz < 0 || nx >= COLS || nz >= ROWS) continue
      const nk = key(nx, nz)
      if (closed.has(nk)) continue
      if (!isWalkable(nx, nz)) continue
      // Climb gate: the height step into the neighbour must be ≤ 1 class — a
      // Δ ≥ 2 face is a cliff the walker routes around.
      if (!canStep(cx, cz, nx, nz)) continue
      // Prevent corner-cutting through a diagonal gap (and around a cliff
      // corner): both orthogonal cells must be walkable AND a legal step.
      if (dx !== 0 && dz !== 0) {
        if (!isWalkable(cx + dx, cz) || !isWalkable(cx, cz + dz)) continue
        if (!canStep(cx, cz, cx + dx, cz) || !canStep(cx, cz, cx, cz + dz)) continue
      }
      const step = dx && dz ? Math.SQRT2 : 1
      const ng = g + step
      const existing = open.get(nk)
      if (!existing || ng < existing.g) {
        cameFrom.set(nk, bestKey)
        open.set(nk, { f: ng + h(nx, nz), g: ng, x: nx, z: nz })
      }
    }
  }
  return []
}
