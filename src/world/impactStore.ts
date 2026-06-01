import * as THREE from 'three'

// Pooled hit-impact spark bursts — the little shower of shards thrown off when a
// blow lands (sword on ork, ork on the castle gate). Pure per-frame channel,
// like projectileStore: combat code calls spawnImpact() on a connect, and
// Impacts.tsx steps + renders the live pool every frame. No notify — only the
// 3D scene reads it, so it never touches React.

export interface Spark {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  age: number // seconds elapsed
  life: number // seconds total
  size: number
  r: number
  g: number
  b: number
}

const MAX = 240
const sparks: Spark[] = []

const GRAVITY = -11
const DRAG = 2.4

export interface ImpactOpts {
  /** number of shards in the burst */
  count?: number
  /** base shard colour (hex) */
  color?: string
  /** outward speed magnitude */
  spread?: number
  /** shard size multiplier */
  size?: number
  /** upward launch bias */
  up?: number
}

const _c = new THREE.Color()

/** Emit a burst of shards at a world-grid point. Saturating the pool drops the oldest sparks. */
export function spawnImpact(x: number, y: number, z: number, opts: ImpactOpts = {}): void {
  const count = opts.count ?? 10
  const speed = opts.spread ?? 3.2
  const size = opts.size ?? 1
  const up = opts.up ?? 1.4
  _c.set(opts.color ?? '#ffd27a')
  for (let i = 0; i < count; i++) {
    if (sparks.length >= MAX) sparks.shift()
    // Fan out around a ring with jitter, biased outward in XZ and upward.
    const a = (i / count) * Math.PI * 2 + Math.random() * 1.2
    const sp = speed * (0.6 + Math.random() * 0.8)
    sparks.push({
      x,
      y,
      z,
      vx: Math.cos(a) * sp,
      vy: (up + Math.random() * 1.2) * (0.6 + Math.random() * 0.6),
      vz: Math.sin(a) * sp,
      age: 0,
      life: 0.32 + Math.random() * 0.22,
      size: size * (0.7 + Math.random() * 0.6),
      r: _c.r,
      g: _c.g,
      b: _c.b,
    })
  }
}

/** Advance every shard (drag + gravity + a soft ground bounce) and prune dead ones. */
export function stepImpacts(dt: number): void {
  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i]
    s.age += dt
    if (s.age >= s.life) {
      sparks.splice(i, 1)
      continue
    }
    const d = Math.max(0, 1 - DRAG * dt)
    s.vx *= d
    s.vz *= d
    s.vy = s.vy * d + GRAVITY * dt
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.z += s.vz * dt
    if (s.y < 0.05) {
      s.y = 0.05
      s.vy *= -0.3
      s.vx *= 0.5
      s.vz *= 0.5
    }
  }
}

export function getImpacts(): Spark[] {
  return sparks
}

export function resetImpacts(): void {
  sparks.length = 0
}
