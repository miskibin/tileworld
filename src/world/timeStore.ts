import * as THREE from 'three'

/**
 * Day/night clock — a hand-rolled external store, same shape as playerStore /
 * pauseStore. Two update channels (see CLAUDE.md):
 *
 *  - HOT PATH: the world reads `getDay()` (live ref) every frame and the
 *    DayNight driver advances `t` with `advanceDay(dt)`. No notify — advancing
 *    the clock must never re-render React.
 *  - DISCRETE: the debug panel scrubs/freezes via `setDayTime` / `setDayFrozen`,
 *    which mutate + `notify`. `subscribeDay` is the listener channel (used by
 *    the leva panel to keep its slider in sync with the running clock).
 *
 * `t` ∈ [0,1): fraction through a 24h day. 0 = midnight, 0.5 = noon.
 */

// One full 24h cycle in real seconds (2 minutes).
export const DAY_LENGTH = 120

// Sun arc: how far south the sun is tilted (vs straight overhead at noon). The
// east→west sweep is X, height is Y, this constant biases Z so shadows fall
// across the south and never go perfectly vertical.
const SOUTH_BIAS = 0.55

// Start frozen at morning golden hour. t=0.30 yields a low, warm sun whose
// direction ≈ the old static SUN_DIR (92,36,60), so the world boots looking
// like it did before the cycle existed.
export const DAY_START_T = 0.3

export interface DayState {
  /** Fraction through the day, [0,1). 0 = midnight, 0.5 = noon. */
  t: number
  /** When true the clock holds still (independent of the global pause). */
  frozen: boolean
}

// frozen=false by default: the game (wave phase) drives time of day. Toggling
// the debug "frozen" control flips this true to hold the clock for scrubbing.
const state: DayState = { t: DAY_START_T, frozen: false }

type DayListener = (s: DayState) => void
const subs = new Set<DayListener>()

function notify(): void {
  subs.forEach((fn) => fn(state))
}

/** Live, mutable state — read fields off it every frame in useFrame. */
export function getDay(): DayState {
  return state
}

const nightScratch = new THREE.Vector3()

/** Cheap night gate for ambient SFX — true once the sun sits at/below the
 *  horizon (dusk through dawn). Allocation-free, safe to call per frame. */
export function isNight(): boolean {
  return sunDirAt(state.t, nightScratch).y < 0.05
}

/** Hot path: advance the clock. No notify (would re-render every frame). */
export function advanceDay(dt: number): void {
  if (state.frozen) return
  state.t = (state.t + dt / DAY_LENGTH) % 1
}

/** Discrete: scrub the clock from the debug panel. */
export function setDayTime(t: number): void {
  state.t = ((t % 1) + 1) % 1
  notify()
}

/** Discrete: freeze/unfreeze the day shift from the debug panel. */
export function setDayFrozen(frozen: boolean): void {
  if (state.frozen === frozen) return
  state.frozen = frozen
  notify()
}

/**
 * Throttled notify — called by the driver a few times a second while the clock
 * runs so the leva slider follows the moving time without per-frame churn.
 */
export function notifyDay(): void {
  notify()
}

export function subscribeDay(fn: DayListener): () => void {
  subs.add(fn)
  fn(state) // immediate call, per store convention
  return () => {
    subs.delete(fn)
  }
}

// ---------------------------------------------------------------------------
// Sun direction + lighting sample. One function maps `t` → everything the
// scene needs, so the DayNight driver and SunShadow agree on the sun.
// ---------------------------------------------------------------------------

/** Writes the (normalised) sun direction for time `t` into `out`. */
export function sunDirAt(t: number, out: THREE.Vector3): THREE.Vector3 {
  // a = 0 at sunrise (east), π at sunset (west), -π/2 at midnight (below).
  const a = (t - 0.25) * Math.PI * 2
  return out.set(Math.cos(a), Math.sin(a), SOUTH_BIAS).normalize()
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/**
 * Per-frame lighting factors + colours derived from the sun's height. Mutates
 * the caller-owned `s` (build it once with `makeDaySample()`) so the hot path
 * allocates nothing.
 */
export interface DaySample {
  /** Sun height, normalised dir.y (≈ -0.88 midnight … +0.88 noon). */
  e: number
  /** 0 when sun below horizon → 1 just above; scales the sun light. */
  sunVis: number
  /** 0 day → 1 deep night; drives moon + star fade. */
  nightAmount: number
  sunColor: THREE.Color
  /** 0..1 scale for ambient fill (moonlit floor at night). */
  ambientScale: number
  ambientColor: THREE.Color
  hemiScale: number
  hemiSky: THREE.Color
  hemiGround: THREE.Color
  fogColor: THREE.Color
}

export function makeDaySample(): DaySample {
  return {
    e: 0,
    sunVis: 1,
    nightAmount: 0,
    sunColor: new THREE.Color(),
    ambientScale: 1,
    ambientColor: new THREE.Color(),
    hemiScale: 1,
    hemiSky: new THREE.Color(),
    hemiGround: new THREE.Color(),
    fogColor: new THREE.Color(),
  }
}

// Palette (module-scope, allocated once).
const SUN_LOW = new THREE.Color('#ff8a4d')
const SUN_HIGH = new THREE.Color('#ffe6b3')
const AMB_DAY = new THREE.Color('#fff4e0')
const AMB_NIGHT = new THREE.Color('#2c3a63')
const HEMI_SKY_DAY = new THREE.Color('#e7eef8')
const HEMI_SKY_NIGHT = new THREE.Color('#1c2740')
const HEMI_GND_DAY = new THREE.Color('#5a6a44')
const HEMI_GND_NIGHT = new THREE.Color('#181f16')
const FOG_DAY = new THREE.Color('#d6c6a0')
const FOG_GOLD = new THREE.Color('#e6a878')
const FOG_NIGHT = new THREE.Color('#141b30')

const dirScratch = new THREE.Vector3()

export function sampleDay(t: number, s: DaySample): DaySample {
  const e = sunDirAt(t, dirScratch).y
  s.e = e
  s.sunVis = smoothstep(-0.03, 0.1, e)
  s.nightAmount = 1 - smoothstep(-0.02, 0.12, e)
  const dayAmount = smoothstep(0.0, 0.35, e)

  s.sunColor.copy(SUN_LOW).lerp(SUN_HIGH, smoothstep(0.05, 0.45, e))

  s.ambientScale = 0.18 + 0.82 * dayAmount // moonlit floor → full day
  s.ambientColor.copy(AMB_NIGHT).lerp(AMB_DAY, dayAmount)

  s.hemiScale = 0.22 + 0.78 * dayAmount
  s.hemiSky.copy(HEMI_SKY_NIGHT).lerp(HEMI_SKY_DAY, dayAmount)
  s.hemiGround.copy(HEMI_GND_NIGHT).lerp(HEMI_GND_DAY, dayAmount)

  // Golden near the horizon → neutral day, then crossfade to night blue.
  s.fogColor.copy(FOG_GOLD).lerp(FOG_DAY, smoothstep(0.12, 0.45, e))
  s.fogColor.lerp(FOG_NIGHT, s.nightAmount)

  return s
}
