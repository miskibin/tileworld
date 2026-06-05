import { bridgeAt } from './bridges'

export type Biome =
  | 'grass'
  | 'sand'
  | 'forest'
  | 'rock'
  | 'snow'
  | 'desert'
  | 'plains'
  | 'swamp'

export interface Tile {
  biome: Biome
  height: number
}

// ─── Map size + the 1.4× expansion transform ────────────────────────────────
// The island is RESAMPLED from an original 144×108 "base" map: every new tile
// reads the base map's generation at toBase(x,z), so the layout keeps its exact
// shape — just bigger (biomes ~1.4× larger, longer trek to the rim). Anchors
// authored in base coords convert to the bigger grid via fromBase (wilderness,
// scaled about centre) or shiftToCentre (the castle, kept ABSOLUTE size).
export const MAP_SCALE = 1.4
const BASE_COLS = 144
const BASE_ROWS = 108
export const COLS = 202 // ≈ 144 × 1.4
export const ROWS = 152 // ≈ 108 × 1.4

export const CENTER_X = COLS / 2
export const CENTER_Z = ROWS / 2
const BASE_CENTER_X = BASE_COLS / 2 // 72
const BASE_CENTER_Z = BASE_ROWS / 2 // 54
// Per-axis scale (COLS/ROWS were rounded to keep CENTER integral).
const SCALE_X = COLS / BASE_COLS
const SCALE_Z = ROWS / BASE_ROWS

/** New grid coord → base/original-map coord. Generation samples the base map
 *  here, so the bigger map is the original stretched (same shape). */
function toBase(x: number, z: number): [number, number] {
  return [BASE_CENTER_X + (x - CENTER_X) / SCALE_X, BASE_CENTER_Z + (z - CENTER_Z) / SCALE_Z]
}
/** Base/original WILDERNESS anchor coord → new grid coord (scaled about centre,
 *  so camps/landmarks/ore track the stretched terrain). */
export function fromBase(x: number, z: number): [number, number] {
  return [CENTER_X + (x - BASE_CENTER_X) * SCALE_X, CENTER_Z + (z - BASE_CENTER_Z) * SCALE_Z]
}
/** Base/original CASTLE-attached coord → new grid coord by pure translation (no
 *  scale), so the keep/walls/gates keep their ABSOLUTE size and just re-centre on
 *  the bigger map's middle. The flat grass safe-zone disc is uniform there, so
 *  the absolute castle sits cleanly regardless of exact terrain alignment. */
export function shiftToCentre(x: number, z: number): [number, number] {
  return [x + (CENTER_X - BASE_CENTER_X), z + (CENTER_Z - BASE_CENTER_Z)]
}

// World-Y per height class. One class = half a tile-unit tall, so a terrace
// step reads as ~1m instead of the old ~2m (height was used as world Y 1:1).
// `height` itself stays an integer. With climbable terrain (see canStep), a
// single class step (Δheight = 1) is walkable; only a Δ ≥ 2 face is a cliff.
export const GROUND_STEP = 0.5

// The castle sits at the true map centre now (recentered from the old anchored
// core). A flat grass safe-zone disc is forced around it — no river, lake,
// mountain or biome blob inside — so the player always boots onto open ground
// with nothing menacing crowding the keep.
export const CASTLE_CENTER = { x: CENTER_X, z: CENTER_Z } as const
// New-space grass safe-zone radius (the base 18 disc, stretched). Read by the
// frontier gradient + gameplay "near castle" checks.
export const CASTLE_SAFE_R = Math.round(18 * SCALE_X)
// BASE-space castle constants — used ONLY by terrain generation, which runs in
// base coords (see toBase). The resample maps the base safe-zone disc onto the
// new centre, where the absolute, re-centred castle building sits.
const BASE_CASTLE_CENTER = { x: BASE_CENTER_X, z: BASE_CENTER_Z } as const
const BASE_CASTLE_SAFE_R = 18

// Procedural map: single island with noisy coast + interior biomes driven by
// temperature × moisture × elevation noise channels, plus carved rivers and
// inland lakes. Kept deterministic, no external dep.
function noiseA(x: number, z: number): number {
  return (
    Math.sin(x * 0.13 + 1.7) * Math.cos(z * 0.11 - 2.3) +
    Math.sin(x * 0.31 + z * 0.29 + 4.5) * 0.5
  )
}
function noiseB(x: number, z: number): number {
  return (
    Math.sin(x * 0.21 - 3.1) * Math.cos(z * 0.19 + 0.7) +
    Math.sin((x + z) * 0.07 + 5.2) * 0.4
  )
}

/** Distance (tiles) from the castle centre — drives the flat safe-zone. Runs in
 *  BASE space (generation only), so it uses the base castle centre. */
function distFromCastle(x: number, z: number): number {
  return Math.hypot(x - BASE_CASTLE_CENTER.x, z - BASE_CASTLE_CENTER.z)
}

// Hand-placed grassy hills (climbable terraces) dotted across the open frontier
// grass. Each hill is multi-tiered: concentric rings step up by one class from
// the foot to a tall core, so it reads as a rounded stepped hill — and because
// each ring differs from its neighbour by exactly one class, the whole hill is
// climbable (see canStep). Tile tops stay discrete so neighbouring boxes stay
// flush (no grid seams).
//
// Trimmed to EMPTY for the five-big-biome layout: the SNOW/DESERT/ROCK/FOREST/
// SWAMP blobs (r 32–38) now crowd the frontier so tightly there is no clear
// grass pocket outside the castle safe-zone wide enough for a hill — any plateau
// would poke out of a biome. Re-add entries here if the layout opens up.
const PLATEAUS: ReadonlyArray<{ x: number; z: number; r: number; peak: number }> = []
/** Plateau height class at (x,z): 0 = none, else 2..peak stepped by distance
 *  to the hill centre (concentric terraces, foot=2, core=peak). One class per
 *  ~one tile of distance keeps every neighbour within Δ1 → climbable. */
function plateauHeightAt(x: number, z: number): number {
  for (const p of PLATEAUS) {
    const d = Math.hypot(x - p.x, z - p.z)
    if (d >= p.r) continue
    // map distance (r → 0) onto height class (2 → peak), stepped by one class
    // per tile so the slope is always climbable.
    const tiers = p.peak - 1
    const cls = 2 + Math.floor((1 - d / p.r) * tiers)
    return Math.min(p.peak, Math.max(2, cls))
  }
  return 0
}

// Superellipse (rounded rectangle) island so the grid corners fill with land
// too, giving frontier all the way out to the edges around the centred castle.
// Island shape lives in BASE space (generation samples it via toBase); the
// resample stretches it to the bigger grid, keeping the same coastline shape.
const islandRx = BASE_COLS / 2 - 1
const islandRz = BASE_ROWS / 2 - 1
const ISLAND_EXP = 2.6 // 2 = ellipse; higher = squarer (more corner land)

function isLandShape(x: number, z: number): boolean {
  const dx = Math.abs(x - BASE_CENTER_X) / islandRx
  const dz = Math.abs(z - BASE_CENTER_Z) / islandRz
  const r = Math.pow(dx, ISLAND_EXP) + Math.pow(dz, ISLAND_EXP)
  const coast = noiseA(x, z) * 0.08
  return r + coast < 1.0
}

function distFromCoast(x: number, z: number): number {
  // Approximate distance (in tile units) from coast or interior water.
  let min = 10
  const dirs: Array<[number, number]> = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1],
  ]
  for (const [dx, dz] of dirs) {
    for (let d = 1; d <= 10; d++) {
      if (!isLandShape(x + dx * d, z + dz * d)) {
        if (d < min) min = d
        break
      }
    }
  }
  return min
}

/** Center X of the meandering N-S river at row z. Runs down the western third
 *  of the map (≈x40), well clear of the centred castle's safe-zone. */
function riverX(z: number): number {
  return 40 + Math.sin(z * 0.18) * 5 + Math.sin(z * 0.07 + 1.4) * 3
}

/** Center Z of the E-W river at column x — runs across the north (≈z20). */
function riverZ(x: number): number {
  return 20 + Math.sin(x * 0.13 + 0.7) * 4
}

function isRiverAt(x: number, z: number): boolean {
  // Never carve a channel through the castle safe-zone…
  if (distFromCastle(x, z) < BASE_CASTLE_SAFE_R) return false
  // …nor through a mountain mass — the river stops at the mountain foot instead
  // of slicing a gorge straight through the peak.
  if (inMountain(x, z)) return false
  {
    const cx = riverX(z)
    // Narrower channel — the resample widens it ~MAP_SCALE×, so a slim base river
    // reads as a tidy stream rather than a moat on the enlarged map.
    const w = 0.75 + Math.sin(z * 0.5) * 0.2
    if (Math.abs(x - cx) < w) return true
  }
  if (x > 46 && x < BASE_COLS - 10) {
    const cz = riverZ(x)
    if (Math.abs(z - cz) < 0.7) return true
  }
  return false
}

// One hand-placed lake in the open grass belt SE of the castle, clear of every
// road, biome region and the castle safe-zone — a small oval pool, not a
// connectivity hazard.
const DELIBERATE_LAKE = { x: 92, z: 80, rx: 5, rz: 3 } as const
function isDeliberateLake(x: number, z: number): boolean {
  const dx = (x - DELIBERATE_LAKE.x) / DELIBERATE_LAKE.rx
  const dz = (z - DELIBERATE_LAKE.z) / DELIBERATE_LAKE.rz
  return dx * dx + dz * dz < 1
}

export function getRiverX(z: number): number {
  return riverX(z)
}
export function getRiverZ(x: number): number {
  return riverZ(x)
}

// FIVE large, distinct biome regions — one per quadrant around the centred
// castle, each well beyond the flat-grass safe-zone:
//   SNOW   NW — a TALL icy massif (mountain, big white peak)
//   DESERT NE — vast flat dunes (height 1, big footprint)
//   ROCK   E  — a TALL jagged range (mountain, big snow-capped peak)
//   FOREST SW — dense low wood (height 1, big footprint)
//   SWAMP  S  — murky marsh (height 1, big footprint)
// Each region is a soft blob (radius + noise wobble) so the edges read
// organically; where two blobs overlap, regionAt picks the DEEPER one. The
// mountains (snow/rock) carry a `peak` height class and a steep quadratic core
// (real Δ≥2 cliffs) with ONE carved climbable ramp to the summit (see
// mountainHeight / rampClass). The grass interior (safe-zone) holds the castle,
// and a grass frontier ring fills the gaps between the five blobs.
interface Region {
  x: number
  z: number
  r: number
  biome: Biome
  /** centre height class for mountain biomes (rock/snow) */
  peak?: number
  /** azimuth (radians) of the guaranteed climbable ramp up the mountain; if
   *  omitted the ramp faces the castle (the approach side). See rampClass. */
  rampAng?: number
}
// Mountain (peak,r) pairs satisfy the ramp-feasibility rule r/(peak-2) ≥ ~1.6
// so the strict one-class staircase ramp always reaches the summit:
//   SNOW : peak 9,  r 26 → stepLen 26/7  = 3.71 ✓ (low, flat snowfields)
//   ROCK : peak 15, r 22 → stepLen 22/13 = 1.69 ✓
// The snow/rock massifs were bumped up from the first pass's tiny r18 blobs (they
// read as too small next to the r32–34 flat biomes) to proper r22–26 ranges with
// taller peaks. Centres are unchanged so the summit (= region centre) stays on the
// guaranteed ramp; rock is held to r22 so its eastern reach clears the NE trader
// village footprint (box 90–102 × 28–38). They stay ASYMMETRIC: the rampClass
// corridor carves the one guaranteed climbable path while the quadratic core
// fractures into Δ≥2 cliff faces on every other side. The flat biomes keep their
// big radii (32–34) so they fill their quadrant. Some organic edge overlap between
// neighbours is intentional.
const REGIONS: Region[] = [
  // NW — snow massif: a LOW, gentle peak over broad flat snowfields (peak
  // dropped 16→9 so most of the blob stays near height-1 flat, with a small
  // summit). r/(peak-2) = 26/7 = 3.7 → ramp stays climbable.
  { x: 26, z: 24, r: 26, biome: 'snow', peak: 9 },
  // NE — vast flat dunes.
  { x: 112, z: 28, r: 34, biome: 'desert' },
  // E — jagged rock range (snow-capped summit), held to r22 to clear the NE village.
  { x: 122, z: 58, r: 22, biome: 'rock', peak: 15 },
  // SW — dense low wood.
  { x: 32, z: 80, r: 34, biome: 'forest' },
  // S — murky marsh.
  { x: 72, z: 92, r: 32, biome: 'swamp' },
]

/** The biome blob for `biome` (its centre + radius), or undefined if none. Lets
 *  spawn placement anchor to the live REGIONS table instead of re-hard-coding a
 *  centre that silently desyncs when a biome is moved or resized. */
export function regionByBiome(biome: Biome): { x: number; z: number; r: number } | undefined {
  const r = REGIONS.find((reg) => reg.biome === biome)
  if (!r) return undefined
  // REGIONS live in base space; return the NEW-space centre + radius so spawn
  // placement (foragables, ore, etc.) lands on the resampled, enlarged biome.
  const [x, z] = fromBase(r.x, r.z)
  return { x, z, r: r.r * SCALE_X }
}

/** `n` deterministic scatter points spread across a biome blob — a golden-angle
 *  (sunflower) spiral mapped onto the OUTER-RIM ANNULUS (0.55·r .. 0.95·r), so
 *  forage targets ring the biome frontier near the map edges instead of filling
 *  the centre — the daily gather run is then a real trip out, not a stroll. The
 *  sqrt-of-area radius keeps points evenly spread across the ring (no inner
 *  crowding) and stays off the frayed coast. Callers snap each onto a standable,
 *  prop-free tile via findSpawnNear. Meaningful only for FLAT biomes
 *  (forest/swamp); a mountain core is cliff, so ore stays a hand-placed apron
 *  list (see OreNodes). Deterministic across reloads (no Math.random) so the
 *  field is stable within a run. */
const SCATTER_INNER = 0.55
const SCATTER_OUTER = 0.95
export function scatterInRegion(biome: Biome, n: number): Array<{ x: number; z: number; seed: number }> {
  const reg = regionByBiome(biome)
  if (!reg) return []
  const GOLDEN = 2.39996323 // golden angle (radians)
  const i2 = SCATTER_INNER * SCATTER_INNER
  const span = SCATTER_OUTER * SCATTER_OUTER - i2
  const pts: Array<{ x: number; z: number; seed: number }> = []
  for (let i = 0; i < n; i++) {
    // Area-uniform radius within the [inner, outer] ring.
    const rad = reg.r * Math.sqrt(i2 + ((i + 0.5) / n) * span)
    const ang = i * GOLDEN + reg.x // offset by centre so two regions don't align
    pts.push({
      x: reg.x + Math.cos(ang) * rad,
      z: reg.z + Math.sin(ang) * rad,
      seed: (i * 0.6180339 + 0.13) % 1,
    })
  }
  // Drop any point that fell on water / off the island — a big biome blob (e.g.
  // the swamp) can overhang the map edge, and an off-island forage point would be
  // planted where the player can never reach it. Survivors are still in-annulus.
  return pts.filter((p) => tileAt(Math.floor(p.x), Math.floor(p.z)) !== null)
}

/** True if (x,z) falls inside (or just outside) any mountain region blob
 *  (rock or snow — both are tall now) — used to keep rivers from carving a
 *  channel through the mountains. The +2 margin past the rendered footprint
 *  stops the river cleanly at the foot. */
function inMountain(x: number, z: number): boolean {
  const wob = 2.4 * Math.sin(x * 0.4 + 1.1) + 2.4 * Math.cos(z * 0.36 - 0.7)
  for (const reg of REGIONS) {
    if (reg.peak === undefined) continue
    if (Math.hypot(x - reg.x, z - reg.z) + wob < reg.r + 2) return true
  }
  return false
}

// Boundary fray, ADDED to a flat blob's distance (and to the castle safe-zone
// radius) so a flat biome's edge against grass breaks into organic interlock
// fingers instead of hard tile stair-steps — overwhelmingly the high-contrast
// desert↔grass / sand↔grass seam (forest shares grass's surface class so its
// seam is invisible, swamp is green-on-green, and the snow/rock mountains hide
// their edge behind vertical cliff faces). Mountains are EXCLUDED (kept crisp so
// their footprint still matches inMountain()/rampClass() and the map-reachability
// guarantee); flat biomes are all walkable height-1 like grass, so fraying their
// boundary can't change pathing.
//
// Amplitude sits on the MID (finger-scale ~5-7 tile) octaves rather than a coarse
// drift that just slides the whole edge. NOTE: this is deliberately COHERENT (no
// high-amplitude incoherent/hash octave) and moderate — a too-strong, too-jittery
// fray flips isolated single tiles to sand far from the main mass, and those
// detached freckles (plus the grass that shows through the frayed seam overlay)
// read as a different, mottled "edge sand texture" next to the solid biome sand.
// Keeping the edge wavy but CONTIGUOUS means the edge sand is just the dunes'
// frayed shoreline — same solid texture, not speckle.
function edgeFray(x: number, z: number): number {
  return (
    Math.sin(x * 0.5 + z * 0.35 + 1.3) * 1.1 + // coarse drift  (~12-tile period)
    Math.sin(x * 0.9 - z * 0.82 + 4.0) * 1.6 + //  medium lobes (~7) — DOMINANT
    Math.sin(x * 1.5 + z * 1.3 + 2.2) * 1.0 //     fine fingers (~4.5)
  )
}

function regionAt(x: number, z: number): Region | null {
  const wob = 2.4 * Math.sin(x * 0.4 + 1.1) + 2.4 * Math.cos(z * 0.36 - 0.7)
  let best: Region | null = null
  let bestEdge = Infinity
  for (const reg of REGIONS) {
    const fray = reg.peak === undefined ? edgeFray(x, z) : 0
    const d = Math.hypot(x - reg.x, z - reg.z) + wob + fray
    const edge = d - reg.r // negative = inside the blob
    if (edge < 0 && edge < bestEdge) {
      bestEdge = edge
      best = reg
    }
  }
  return best
}

// Half-width (tiles) of the carved ramp corridor that guarantees one walkable
// route to every summit. ~1.7 → a ≈3.4-tile-wide trail, wide enough that the
// flood-fill (and the player) always gets through even with a prop or two
// nearby — and the corridor is reserved from scatter (see obstacles.ts) so it
// reads as a cleared switchback up the mountain.
const RAMP_HALF_TILES = 1.7

/** Climbable-ramp height class at (x,z) for mountain region `reg`, or null if the
 *  tile is outside the ramp corridor. The corridor runs on a fixed azimuth
 *  (facing the castle by default) and its height is a STRICT one-class staircase
 *  from the foot (2) to the summit (peak): every adjacent corridor tile differs
 *  by ≤1 class, so the whole path is climbable end to end no matter how sheer the
 *  noise makes the cliffs on either side. This is what makes "always at least one
 *  walkable path to the top" a guarantee rather than an accident of the noise. */
function rampClass(x: number, z: number, reg: Region): number | null {
  if (reg.peak === undefined) return null
  const dx = x - reg.x
  const dz = z - reg.z
  const dc = Math.hypot(dx, dz)
  if (dc >= reg.r) return null
  const rampAng = reg.rampAng ?? Math.atan2(BASE_CASTLE_CENTER.z - reg.z, BASE_CASTLE_CENTER.x - reg.x)
  let da = (Math.atan2(dz, dx) - rampAng) % (Math.PI * 2)
  if (da < -Math.PI) da += Math.PI * 2
  if (da > Math.PI) da -= Math.PI * 2
  // Arc half-width that keeps the corridor ~constant tile-width at any radius.
  const halfAng = Math.min(Math.PI, RAMP_HALF_TILES / Math.max(1.5, dc))
  if (Math.abs(da) >= halfAng) return null
  const span = Math.max(1, reg.peak - 2)
  const stepLen = reg.r / span // tiles of run per one-class rise (> ~1.5 → climbable)
  const cls = 2 + Math.floor((reg.r - dc) / stepLen)
  return Math.max(2, Math.min(reg.peak, cls))
}

/** True if (x,z) lies in any mountain's ramp corridor — obstacles.ts reserves
 *  these tiles so scatter never blocks the one guaranteed path up. */
export function isMountainRampTile(x: number, z: number): boolean {
  // x,z are NEW-space tiles; rampClass works in base space.
  const [bx, bz] = toBase(x, z)
  for (const reg of REGIONS) {
    if (rampClass(bx, bz, reg) !== null) return true
  }
  return false
}

/** Mountain height at (x,z). On the carved ramp corridor it follows the climbable
 *  staircase (rampClass); elsewhere it's a QUADRATIC profile — gentle near the
 *  foot, steep toward the core. `t` runs 0 at the foot → 1 at the centre; the
 *  noise amplitude GROWS with `t` so the apron (and the ork camps / roads at the
 *  foot) stays shallow + climbable while the upper core fractures into Δ≥2 cliff
 *  faces you can't scale (but can drop off, with fall damage; see Character) —
 *  taller peaks + bigger edges than the first pass. */
function mountainHeight(x: number, z: number, reg: Region): number {
  const rc = rampClass(x, z, reg)
  if (rc !== null) return rc
  const dc = Math.hypot(x - reg.x, z - reg.z)
  const peak = reg.peak ?? 6
  const t = Math.max(0, 1 - dc / reg.r)
  const h = Math.round(peak * t * t + noiseB(x, z) * (0.35 + t * 0.95))
  return Math.max(1, Math.min(peak, h))
}

function classifyBiome(x: number, z: number): Tile | null {
  if (!isLandShape(x, z)) return null

  // Castle safe-zone: flat open grass, forced before anything else so no river,
  // lake, mountain or biome blob can intrude on the keep's surroundings. Its
  // OUTER edge is frayed by the same edgeFray: the desert's SW lobe reaches
  // INSIDE this radius, so an un-frayed circle here is exactly the "stair-stepped
  // sand edge" — a clean r=CASTLE_SAFE_R arc clipping the dunes — that edgeFray on
  // the blob alone could never touch (this check wins first). Fraying it lets the
  // sand↔grass boundary interlock. The inner core (radius − |fray|max ≈ 14) stays
  // pure grass so the keep is never crowded; the swamp guard below keeps the
  // marsh's poison tiles out of the frayed band on the south side.
  const dc = distFromCastle(x, z)
  // Full-strength fray on the bulge OUT into the dunes; the shrink IN is clamped
  // at −4 so the keep core (radius ≥ CASTLE_SAFE_R−4 ≈ 14) is always pure grass.
  if (dc < BASE_CASTLE_SAFE_R + Math.max(-4, edgeFray(x, z))) return { biome: 'grass', height: 1 }

  if (isRiverAt(x, z)) return null

  const d = distFromCoast(x, z)
  // Procedural inland lakes are disabled: they scattered randomly and chopped
  // biomes/mountains into pockets the road network couldn't reach. A single
  // deliberate lake lives in a basin instead (see DELIBERATE_LAKE).
  if (isDeliberateLake(x, z)) return null // carve the one hand-placed lake

  // Beach ring around the ocean coast. Its inland width is frayed 1→3 tiles by a
  // two-octave noise — beachW ≥ 1, so the water-adjacent tile is ALWAYS sand (the
  // sand↔water edge stays the clean coast shape); only the landward sand↔grass
  // edge wanders, breaking the hard 1-tile stair-step that the integer
  // distFromCoast otherwise leaves along the noisy coastline into organic
  // fingers. Sand is walkable height-1 like grass, so a wider fringe never
  // affects pathing/reachability.
  const beachW = 1 + Math.max(0, 1 + Math.sin(x * 0.6 + z * 0.42 + 2.1) * 0.8 + Math.sin(x * 1.25 - z * 0.95 + 0.4) * 0.6)
  if (d <= beachW) return { biome: 'sand', height: 1 }

  // Hand-placed grassy hills (climbable terraces) before regional biomes.
  const ph = plateauHeightAt(x, z)
  if (ph) return { biome: 'grass', height: ph }

  // Regional biome placement.
  const reg = regionAt(x, z)
  if (reg) {
    // Keep the poisonous marsh out of the keep's frayed safe-zone band: a swamp
    // tile that the fray pulled inside the true safe radius reverts to grass, so
    // sand may interlock toward the keep but the south-side marsh never does.
    if (reg.biome === 'swamp' && dc < BASE_CASTLE_SAFE_R) return { biome: 'grass', height: 1 }
    if (reg.peak !== undefined) {
      // Mountain biome (rock / snow): tall climbable mass.
      return { biome: reg.biome, height: mountainHeight(x, z, reg) }
    }
    return { biome: reg.biome, height: 1 }
  }

  // Scattered grass-belt forest clumps so the open green isn't uniform (denser
  // than before — the map read as too much flat grass).
  const forestN = noiseA(x, z) * noiseB(x + 7, z - 3)
  if (forestN > 0.5) return { biome: 'forest', height: 1 }

  return { biome: 'grass', height: 1 }
}

// Cache full tile grid once.
let cachedTiles: (Tile | null)[][] | null = null

function ensureTiles(): (Tile | null)[][] {
  if (cachedTiles) return cachedTiles
  const rows: (Tile | null)[][] = []
  for (let z = 0; z < ROWS; z++) {
    const row: (Tile | null)[] = []
    for (let x = 0; x < COLS; x++) {
      const [bx, bz] = toBase(x, z)
      // Biome + land mask from the CONTINUOUS base sample → coast/biome edges
      // stay smooth at the bigger resolution.
      const t = classifyBiome(bx, bz)
      if (!t) {
        row.push(null)
        continue
      }
      // Height re-sampled at the base GRID tile this falls in: each base tile
      // becomes a small flat plateau of new tiles, so Δ≥2 mountain cliffs and the
      // one climbable ramp survive the stretch (a continuous height sample would
      // smear every cliff into a walkable slope).
      const q = classifyBiome(Math.round(bx), Math.round(bz))
      row.push({ biome: t.biome, height: q ? q.height : t.height })
    }
    rows.push(row)
  }
  cachedTiles = rows
  return rows
}

export function buildTiles(): (Tile | null)[][] {
  return ensureTiles()
}

export function tileAt(x: number, z: number): Tile | null {
  if (x < 0 || z < 0 || x >= COLS || z >= ROWS) return null
  return ensureTiles()[z][x]
}

export function isLand(x: number, z: number): boolean {
  return tileAt(x, z) !== null
}

/**
 * World-Y of the top (walkable surface) of tile (x,z) — the single source of
 * truth for ground height. Stepped by GROUND_STEP per height class. Base ground
 * (height 1) sits at y=1; water / off-map returns 0. Tile tops are kept flat
 * (no per-tile relief) so neighbouring boxes stay flush.
 */
export function tileTopY(x: number, z: number): number {
  const t = tileAt(x, z)
  if (!t) return 0
  return 1 + (t.height - 1) * GROUND_STEP
}

/** Height class at a tile center, treating a bridge span as class 1 (its deck
 *  sits near base ground). null = not standable (open water / off-map). */
function heightClassAt(cx: number, cz: number): number | null {
  const t = tileAt(cx, cz)
  if (t) return t.height
  if (bridgeAt(cx + 0.5, cz + 0.5) !== null) return 1
  return null
}

/** True if an entity can stand on tile (cx,cz): any land height (all terrain is
 *  climbable now) or a bridge deck. Open water / off-map is not standable. */
export function standable(cx: number, cz: number): boolean {
  if (cx < 0 || cz < 0 || cx >= COLS || cz >= ROWS) return false
  return heightClassAt(cx, cz) !== null
}

/** Shared climb rule — the single source of truth for terrain step feasibility,
 *  used by pathfinding AND player/mob movement so they always agree. A step
 *  from (fx,fz) to (tx,tz) is allowed when the target is standable and the
 *  height-class difference is at most one (a Δ ≥ 2 face is an impassable cliff).
 *  Does NOT consider props/houses — callers layer those checks on top. */
export function canStep(fx: number, fz: number, tx: number, tz: number): boolean {
  const tc = heightClassAt(tx, tz)
  if (tc === null) return false
  const fc = heightClassAt(fx, fz)
  if (fc === null) return false
  return Math.abs(tc - fc) <= 1
}

/** Player movement rule — like canStep but one-directional. You may DROP off any
 *  height (the caller lets gravity carry you down and applies fall damage on
 *  landing), but you still cannot CLIMB a face taller than one class. Used only
 *  by the player; mobs keep the symmetric canStep so A* never routes them off a
 *  cliff to their death. */
export function canStepOrDrop(fx: number, fz: number, tx: number, tz: number): boolean {
  const tc = heightClassAt(tx, tz)
  if (tc === null) return false
  const fc = heightClassAt(fx, fz)
  if (fc === null) return false
  return tc - fc <= 1 // any drop allowed; climbing limited to one class
}
