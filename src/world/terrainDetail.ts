import * as THREE from 'three'

// ─── Procedural, seamless terrain detail textures ──────────────────────
// Generated once on a <canvas> at boot — no image files, deterministic, and
// tileable (every sampler wraps). The terrain shader samples these by
// continuous world-XZ UVs (see vision.ts), so the grain flows across tiles
// without exposing the 1×1 grid. This is the "create your own textures" half
// of the look; the shader adds large-scale hue/value variation on top.

const SIZE = 256

// Deterministic hash in [0,1) — no Math.random, so the textures are identical
// every run (matches the deterministic-world ethos).
function hash2(ix: number, iy: number, seed: number): number {
  const s = Math.sin(ix * 127.1 + iy * 311.7 + seed * 74.7) * 43758.5453
  return s - Math.floor(s)
}

// Periodic value noise on a cellsX×cellsY lattice. Lattice indices wrap, so the
// field repeats exactly over [0,1) in both axes → seamless when tiled. Allowing
// cellsX ≠ cellsY gives directional features (grass blades / sand ripples) that
// still tile cleanly.
function valueNoise(cellsX: number, cellsY: number, seed: number) {
  const g = new Float32Array(cellsX * cellsY)
  for (let j = 0; j < cellsY; j++)
    for (let i = 0; i < cellsX; i++) g[j * cellsX + i] = hash2(i, j, seed)
  return (u: number, v: number): number => {
    const x = u * cellsX
    const y = v * cellsY
    const xi = Math.floor(x)
    const yi = Math.floor(y)
    const x0 = ((xi % cellsX) + cellsX) % cellsX
    const y0 = ((yi % cellsY) + cellsY) % cellsY
    const x1 = (x0 + 1) % cellsX
    const y1 = (y0 + 1) % cellsY
    let fx = x - xi
    let fy = y - yi
    fx = fx * fx * (3 - 2 * fx)
    fy = fy * fy * (3 - 2 * fy)
    const a = g[y0 * cellsX + x0]
    const b = g[y0 * cellsX + x1]
    const c = g[y1 * cellsX + x0]
    const d = g[y1 * cellsX + x1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
  }
}

type RGB = [number, number, number]

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

interface TexSpec {
  seed: number
  dark: string
  base: string
  light: string
  /** fine per-texel grain strength (0..1) */
  grain: number
  /** large soft patch strength (0..1) */
  patch: number
  /** directional streak strength (0..1) — blades / ripples / cracks */
  streak: number
  /** true = vertical streaks (grass), false = horizontal streaks (sand) */
  streakVertical: boolean
}

function buildTexture(spec: TexSpec): THREE.CanvasTexture {
  const dark = hexToRgb(spec.dark)
  const base = hexToRgb(spec.base)
  const light = hexToRgb(spec.light)

  const patch = valueNoise(7, 7, spec.seed)
  const mid = valueNoise(18, 18, spec.seed + 11)
  const grain = valueNoise(96, 96, spec.seed + 23)
  // Directional lattice: many cells along one axis, few along the other →
  // narrow features extended in the perpendicular direction.
  const streak = spec.streakVertical
    ? valueNoise(64, 7, spec.seed + 37)
    : valueNoise(7, 64, spec.seed + 37)

  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')!
  const img = ctx.createImageData(SIZE, SIZE)
  const data = img.data

  let lumSum = 0
  for (let py = 0; py < SIZE; py++) {
    const v = py / SIZE
    for (let px = 0; px < SIZE; px++) {
      const u = px / SIZE
      // Combined tonal value, centred ~0.5.
      let t = patch(u, v) * 0.55 + mid(u, v) * 0.3 + grain(u, v) * 0.15
      if (spec.streak > 0) t += (streak(u, v) - 0.5) * spec.streak
      t = Math.min(1, Math.max(0, t))

      // dark → base → light ramp.
      const col = t < 0.5 ? mix(dark, base, t * 2) : mix(base, light, (t - 0.5) * 2)
      // Extra fine speckle so close-up reads as grains, not a smooth gradient.
      const sp = 0.9 + grain(u, v) * 0.2 * (0.5 + spec.grain)

      const r = Math.min(1, col[0] * sp)
      const g = Math.min(1, col[1] * sp)
      const b = Math.min(1, col[2] * sp)
      lumSum += 0.299 * r + 0.587 * g + 0.114 * b

      const o = (py * SIZE + px) * 4
      data[o] = r * 255
      data[o + 1] = g * 255
      data[o + 2] = b * 255
      data[o + 3] = 255
    }
  }
  ctx.putImageData(img, 0, 0)

  const tex = new THREE.CanvasTexture(canvas)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.colorSpace = THREE.SRGBColorSpace
  // Ground is viewed at a shallow RTS angle — anisotropy keeps the grain from
  // smearing into mush along the view direction (clamped to GPU max).
  tex.anisotropy = 8
  tex.needsUpdate = true
  // Mean luminance lets the shader normalise the imprint to ~1.0 so it
  // modulates the base colour without globally brightening/darkening it.
  tex.userData.mean = lumSum / (SIZE * SIZE)
  return tex
}

export type DetailKind = 'grass' | 'dirt' | 'rock' | 'sand' | 'snow' | 'swamp'

const SPECS: Record<DetailKind, TexSpec> = {
  grass: { seed: 1, dark: '#356b28', base: '#5d9e44', light: '#95d162', grain: 0.55, patch: 0.6, streak: 0.5, streakVertical: true },
  dirt: { seed: 2, dark: '#573f25', base: '#7a5c38', light: '#9c794a', grain: 0.7, patch: 0.5, streak: 0.18, streakVertical: false },
  rock: { seed: 3, dark: '#6e6e78', base: '#9a9aa3', light: '#c2c2cc', grain: 0.6, patch: 0.5, streak: 0.25, streakVertical: true },
  sand: { seed: 4, dark: '#c2a566', base: '#dcc081', light: '#efd9a0', grain: 0.4, patch: 0.45, streak: 0.3, streakVertical: false },
  snow: { seed: 5, dark: '#cdd8e8', base: '#eef3fa', light: '#ffffff', grain: 0.3, patch: 0.4, streak: 0.12, streakVertical: false },
  swamp: { seed: 6, dark: '#34421f', base: '#4e6230', light: '#6f7d3e', grain: 0.55, patch: 0.65, streak: 0.2, streakVertical: true },
}

let cache: Record<DetailKind, THREE.CanvasTexture> | null = null

/** Lazily build + cache one CanvasTexture per biome detail kind. */
export function getDetailTextures(): Record<DetailKind, THREE.CanvasTexture> {
  if (cache) return cache
  cache = {
    grass: buildTexture(SPECS.grass),
    dirt: buildTexture(SPECS.dirt),
    rock: buildTexture(SPECS.rock),
    sand: buildTexture(SPECS.sand),
    snow: buildTexture(SPECS.snow),
    swamp: buildTexture(SPECS.swamp),
  }
  return cache
}
