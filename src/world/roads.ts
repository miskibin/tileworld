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

// Waypoints in grid coords. Roads emanate from the four castle gates of the
// re-centred castle (cityPlan GATE_SLOTS: N 72,45 · S 72,63 · W 59,54 ·
// E 85,54), starting one tile outside, and radiate toward the FIVE big biomes
// and the ork camps re-derived for the new layout (see ORK_CAMPS in
// obstacles.ts): SNOW NW · DESERT NE · ROCK E · FOREST SW · SWAMP S.
// Every consecutive pair is axis-aligned; routes were traced to stay on land
// (scripts/probe-road.mjs), bridging any river crossing.
const ROUTES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  // ── North gate (72,44 outside) → northern trunk between snow & desert ──
  [[72, 44], [72, 26]],
  // North trunk → north ork camp (snow/desert frontier).
  [[72, 26], [74, 26]],
  // North trunk → NW snow foot.
  [[72, 30], [60, 30]],
  // North trunk → NE desert / east camp.
  [[72, 30], [90, 30], [90, 42]],

  // ── South gate (72,64 outside) → southern trunk toward the swamp ──
  [[72, 64], [72, 84]],
  // South trunk → SW forest + forest ork camp (crosses no water on this line).
  [[72, 72], [44, 72], [44, 64]],

  // ── West gate (58,54 outside) → SW forest (heads into the wood) ──
  [[58, 54], [42, 54], [42, 66], [36, 66]],

  // ── East gate (86,54 outside) → desert/rock foot + east ork camp ──
  // Steps north off the cliffy gate apron onto flat desert before heading east.
  [[86, 54], [86, 46], [92, 46], [92, 44]],

  // ── Spurs to landmarks (more trails, not wider ones) ──
  // South gate → market stall just outside the wall.
  [[72, 66], [68, 66], [68, 71]],
  // North trunk → NW frontier hamlet.
  [[72, 32], [66, 32]],
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
