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

// ─── Camera FOV punch ──────────────────────────────────────────
// Offensive "weight": a connecting hit / kill / hard landing kicks the camera
// FOV out a few degrees, then it eases back. Read once per frame by the camera
// and added to its base FOV — pairs with (but is independent of) the positional
// shake above. Degrees, decays linearly so the snap-in reads, the ease-out calms.
let fovKick = 0
let fovLastT = 0

// Live-tunable FOV-punch knobs, mutated by the leva panel (DebugBindings.tsx).
// `kill`/`hit`/`land` are the per-event punch sizes (read at the call sites in
// Character.tsx); `max` caps stacked punches; `decay` is the ease-out rate.
export const fovTunables = {
  kill: 2.6, // takedown punch (degrees)
  hit: 1.3, // connecting-blow punch
  land: 2.2, // hard-landing punch
  max: 7, // cap so stacked hits never blow the view open
  decay: 22, // degrees shed per second (snappy ease-out)
}

/** Punch the camera FOV out by `deg` (clamped). Bigger events punch harder. */
export function addFovKick(deg: number): void {
  fovKick = Math.min(fovTunables.max, fovKick + deg)
}

/** Current FOV offset in degrees (0 when settled). Decays by real time elapsed. */
export function getFovKick(now: number): number {
  if (fovLastT === 0) fovLastT = now
  const dt = Math.min(0.1, Math.max(0, now - fovLastT))
  fovLastT = now
  if (fovKick > 0) fovKick = Math.max(0, fovKick - fovTunables.decay * dt)
  return fovKick
}

/** Clear any lingering FOV punch on a fresh run / world remount. */
export function resetFovKick(): void {
  fovKick = 0
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
