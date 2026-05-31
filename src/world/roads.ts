import { COLS, ROWS, isLand } from './tileMap'

// Grid-based road network. Roads are defined as polylines of integer tile
// waypoints; every consecutive pair is axis-aligned (shares x or z), so the
// expanded road is always grid-aligned (no diagonal/odd-angle quads). Where a
// road crosses water (a river/lake tile) we emit a bridge that brackets the
// crossing, so a path is never left without a bridge.

export interface RoadBridge {
  fromX: number
  fromZ: number
  toX: number
  toZ: number
}

// Waypoints in grid coords. Roads emanate from the four castle gates
// (N 57,24 · S 57,42 · W 44,33 · E 70,33), starting one tile outside, and
// branch out to the biome regions.
const ROUTES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  // South gate → southern trunk → swamp (SW) / pine (SE)
  [[57, 43], [57, 49]],
  [[57, 49], [20, 49], [20, 55]],
  [[57, 49], [74, 49], [74, 53]],
  // North gate → northern trunk (crosses the E-W river) → snow (NW) / desert (NE).
  // The branch runs at z12, north of the E-W river, so corners stay on land.
  [[57, 23], [57, 12]],
  [[57, 12], [20, 12]],
  [[57, 12], [78, 12]],
  // West gate → forest (W) — crosses the N-S river
  [[43, 33], [16, 33], [16, 38]],
  // East gate → stone highlands (E)
  [[71, 33], [82, 33], [82, 37]],
  // Spurs off the trunks to the landmarks — more trails, not wider ones.
  // South trunk → market stall (S gate).
  [[57, 45], [62, 45]],
  // West road → western hamlet.
  [[27, 33], [27, 30]],
  // North trunk → north warcamp.
  [[50, 12], [50, 15]],
  // North branch → NE ork camp.
  [[76, 12], [76, 20]],
  // South branch → into SE ork camp.
  [[74, 53], [71, 53]],
  // Southern trunk → into SW ork camp.
  [[20, 52], [24, 52]],
]

interface RoadData {
  /** land road tiles to render as dirt */
  dirt: { x: number; z: number }[]
  /** bridge spans over water crossings */
  bridges: RoadBridge[]
  /** every road tile (dirt + bridge) for scatter exclusion */
  tiles: Set<number>
}

let cached: RoadData | null = null

const keyOf = (x: number, z: number) => z * COLS + x

/** Inclusive tile list between two axis-aligned points. */
function lineTiles(ax: number, az: number, bx: number, bz: number): [number, number][] {
  const out: [number, number][] = []
  const dx = Math.sign(bx - ax)
  const dz = Math.sign(bz - az)
  let x = ax
  let z = az
  out.push([x, z])
  let guard = 0
  while ((x !== bx || z !== bz) && guard++ < 500) {
    x += dx
    z += dz
    out.push([x, z])
  }
  return out
}

function build(): RoadData {
  const tiles = new Set<number>()
  const dirtSet = new Set<number>()
  const bridges: RoadBridge[] = []

  for (const route of ROUTES) {
    for (let i = 0; i < route.length - 1; i++) {
      const [ax, az] = route[i]
      const [bx, bz] = route[i + 1]
      const seg = lineTiles(ax, az, bx, bz)
      // Walk the segment, marking land tiles as dirt and grouping runs of
      // water tiles into bridges that bracket the run with the land tiles
      // on either side.
      let runStart = -1 // index in seg of first water tile of current run
      for (let j = 0; j < seg.length; j++) {
        const [x, z] = seg[j]
        if (x < 0 || z < 0 || x >= COLS || z >= ROWS) continue
        tiles.add(keyOf(x, z))
        if (isLand(x, z)) {
          if (runStart >= 0) {
            // Close the run [runStart, j-1] with land brackets seg[runStart-1] / seg[j].
            const a = seg[Math.max(0, runStart - 1)]
            const b = seg[j]
            bridges.push({ fromX: a[0] + 0.5, fromZ: a[1] + 0.5, toX: b[0] + 0.5, toZ: b[1] + 0.5 })
            runStart = -1
          }
          dirtSet.add(keyOf(x, z))
        } else if (runStart < 0) {
          runStart = j
        }
      }
      // Run that reaches the segment end (no closing land tile) — bracket with
      // the last land tile we had.
      if (runStart >= 0) {
        const a = seg[Math.max(0, runStart - 1)]
        const b = seg[seg.length - 1]
        bridges.push({ fromX: a[0] + 0.5, fromZ: a[1] + 0.5, toX: b[0] + 0.5, toZ: b[1] + 0.5 })
      }
    }
  }

  const dirt: { x: number; z: number }[] = []
  for (const k of dirtSet) dirt.push({ x: k % COLS, z: Math.floor(k / COLS) })
  return { dirt, bridges, tiles }
}

function data(): RoadData {
  if (!cached) cached = build()
  return cached
}

export function getRoadDirt(): { x: number; z: number }[] {
  return data().dirt
}

export function getRoadBridges(): RoadBridge[] {
  return data().bridges
}

/** True if a road tile occupies (cx, cz) — used to keep scatter off roads. */
export function isRoadTile(cx: number, cz: number): boolean {
  return data().tiles.has(keyOf(cx, cz))
}
