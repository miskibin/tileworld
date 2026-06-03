// Transient combat juice: camera shake impulses + floating world-space combat
// text ("+8 ★", "+20 XP"). Consumers poll each frame (camera) or subscribe
// (HUD), matching the rest of the codebase's store conventions.

// ─── Screen shake (trauma-based) ───────────────────────────────
// Trauma is a 0..1 charge that events add to and that decays continuously. The
// camera offset is MAX_SHAKE · trauma², so the shake ramps in sharply and tails
// off gently — far less nauseating than a raw linear impulse, and overlapping
// hits stack toward a cap instead of fighting for the max.
let trauma = 0
let lastT = 0
const MAX_SHAKE = 0.9
const TRAUMA_DECAY = 2.4 // trauma units shed per second

/** Add trauma (0..1). Bigger events add more; clamped so it never runs away. */
export function addShake(amount: number): void {
  trauma = Math.min(1, trauma + amount)
}

/** Current shake offset magnitude (0 when settled). Decays trauma by real time elapsed. */
export function getShake(now: number): number {
  if (lastT === 0) lastT = now
  const dt = Math.min(0.1, Math.max(0, now - lastT))
  lastT = now
  if (trauma > 0) trauma = Math.max(0, trauma - TRAUMA_DECAY * dt)
  if (trauma <= 0) return 0
  return MAX_SHAKE * trauma * trauma
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
  /** random horizontal drift so stacked numbers don't overlap */
  dx: number
  /** size multiplier (crits spawn bigger) */
  scale: number
}

const floats: FloatText[] = []
let nextId = 0
const FLOAT_LIFE = 1.1
const subs = new Set<() => void>()

/** Spawn a floating world-space number. `scale` > 1 for crits / big hits. */
export function spawnFloat(text: string, color: string, x: number, y: number, z: number, scale = 1): void {
  floats.push({
    id: nextId++,
    text,
    color,
    x,
    y,
    z,
    born: performance.now() * 0.001,
    dx: (Math.random() * 2 - 1) * 0.4,
    scale,
  })
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
