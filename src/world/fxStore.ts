// Transient combat juice: camera shake impulses + floating world-space combat
// text ("+8 ★", "+20 XP"). Consumers poll each frame (camera) or subscribe
// (HUD), matching the rest of the codebase's store conventions.

// ─── Screen shake ──────────────────────────────────────────────
let shakeUntil = 0
let shakeMag = 0

/** Add a shake impulse. Magnitude is in world units; takes the stronger of any overlapping shakes. */
export function addShake(mag: number, dur: number): void {
  const now = performance.now() * 0.001
  shakeUntil = Math.max(shakeUntil, now + dur)
  shakeMag = Math.max(shakeMag, mag)
}

/** Current shake offset magnitude (0 when expired). Decays over its lifetime. */
export function getShake(now: number): number {
  if (now >= shakeUntil) {
    shakeMag = 0
    return 0
  }
  // Linear falloff toward the end of the active window.
  const remain = shakeUntil - now
  return shakeMag * Math.min(1, remain / 0.25)
}

// ─── Floating combat text ──────────────────────────────────────
export interface FloatText {
  id: number
  text: string
  color: string
  /** world grid coords where it spawned */
  x: number
  z: number
  y: number
  born: number
}

const floats: FloatText[] = []
let nextId = 0
const FLOAT_LIFE = 1.1
const subs = new Set<() => void>()

export function spawnFloat(text: string, color: string, x: number, y: number, z: number): void {
  floats.push({ id: nextId++, text, color, x, y, z, born: performance.now() * 0.001 })
  subs.forEach((fn) => fn())
}

/** Returns live floats and prunes expired ones. */
export function getFloats(now: number): FloatText[] {
  for (let i = floats.length - 1; i >= 0; i--) {
    if (now - floats[i].born > FLOAT_LIFE) floats.splice(i, 1)
  }
  return floats
}

export const FLOAT_LIFETIME = FLOAT_LIFE

export function subscribeFloats(fn: () => void): () => void {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}
