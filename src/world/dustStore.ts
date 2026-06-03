import * as THREE from 'three'
import type { Biome } from './tileMap'

// Pooled ground dust — the soft puffs kicked up by a sprinting footfall or a
// landing. Same pure per-frame channel as impactStore (no notify, only the 3D
// scene reads it), but tuned + rendered soft: gentle gravity, heavy drag, dull
// earthy colour, no bloom. Combat sparks stay in impactStore; this is the quiet
// counterpart so the two never get confused for one another.

export interface Mote {
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

const MAX = 160
const motes: Mote[] = []

// Dust drifts — it doesn't plummet like a spark shard. Light gravity, heavy drag
// so a puff blooms outward, hangs, and settles within ~half a second.
const GRAVITY = -1.2
const DRAG = 3.4

export interface DustOpts {
  /** number of motes in the puff */
  count?: number
  /** base mote colour (hex) */
  color?: string
  /** outward speed magnitude */
  spread?: number
  /** mote size multiplier */
  size?: number
  /** upward launch bias */
  up?: number
}

// Earthy dust tint per biome, plus whether a plain walk (not just a sprint)
// stirs it — loose ground (sand / snow / scree) puffs underfoot, packed ground
// (grass / forest floor) stays quiet so the effect reads as detail, not noise.
const DUST_BY_BIOME: Partial<Record<Biome, { color: string; loose: boolean }>> = {
  snow: { color: '#eaf1f7', loose: true },
  desert: { color: '#e3d2a0', loose: true },
  rock: { color: '#bcb8b0', loose: true },
  swamp: { color: '#6f6a4e', loose: false },
}
const DUST_DEFAULT = { color: '#c9b893', loose: false } // grass / forest / pine dirt

export function dustForBiome(biome: Biome | undefined): { color: string; loose: boolean } {
  return (biome && DUST_BY_BIOME[biome]) || DUST_DEFAULT
}

const _c = new THREE.Color()

/** Emit a soft puff of motes at a world-grid point. Saturating the pool drops the oldest. */
export function spawnDust(x: number, y: number, z: number, opts: DustOpts = {}): void {
  const count = opts.count ?? 5
  const speed = opts.spread ?? 0.9
  const size = opts.size ?? 1
  const up = opts.up ?? 0.5
  _c.set(opts.color ?? DUST_DEFAULT.color)
  for (let i = 0; i < count; i++) {
    if (motes.length >= MAX) motes.shift()
    const a = (i / count) * Math.PI * 2 + Math.random() * 1.6
    const sp = speed * (0.4 + Math.random() * 0.8)
    motes.push({
      x: x + (Math.random() * 2 - 1) * 0.12,
      y: y + Math.random() * 0.08,
      z: z + (Math.random() * 2 - 1) * 0.12,
      vx: Math.cos(a) * sp,
      vy: up * (0.5 + Math.random() * 0.8),
      vz: Math.sin(a) * sp,
      age: 0,
      life: 0.45 + Math.random() * 0.4,
      size: size * (0.7 + Math.random() * 0.7),
      r: _c.r,
      g: _c.g,
      b: _c.b,
    })
  }
}

/** Advance every mote (drag + gentle gravity, settling on the ground) and prune dead ones. */
export function stepDust(dt: number): void {
  for (let i = motes.length - 1; i >= 0; i--) {
    const s = motes[i]
    s.age += dt
    if (s.age >= s.life) {
      motes.splice(i, 1)
      continue
    }
    const d = Math.max(0, 1 - DRAG * dt)
    s.vx *= d
    s.vz *= d
    s.vy = s.vy * d + GRAVITY * dt
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.z += s.vz * dt
    if (s.y < 0.04) {
      s.y = 0.04
      s.vy = 0
    }
  }
}

export function getDust(): Mote[] {
  return motes
}

export function resetDust(): void {
  motes.length = 0
}
