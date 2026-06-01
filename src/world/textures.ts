import * as THREE from 'three'

// ─── Procedural canvas textures ──────────────────────────────────────────────
// All surface detail is painted at runtime onto a <canvas> — no image files,
// matching the project's "everything procedural" ethos. Each generator bakes a
// base colour + variation into the bitmap and returns a THREE.CanvasTexture, so
// the consuming material can keep `color` white and let the map carry the look.
//
// Headless-safe: `npm run inspect` mounts models in node where `document` is
// undefined; every generator returns `null` there and callers fall back to a
// plain colour material. Textures are cached by (kind, color, repeat).

type Tex = THREE.Texture | null
const cache = new Map<string, Tex>()

interface Pad {
  c: HTMLCanvasElement
  ctx: CanvasRenderingContext2D
}

function pad(size: number): Pad | null {
  // Guard against headless (node) AND the inspector's fake `document` shim,
  // which is defined but has no createElement.
  if (typeof document === 'undefined' || typeof document.createElement !== 'function') return null
  const c = document.createElement('canvas')
  c.width = c.height = size
  const ctx = c.getContext('2d')
  return ctx ? { c, ctx } : null
}

function finish(c: HTMLCanvasElement, repeat: number): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.repeat.set(repeat, repeat)
  t.colorSpace = THREE.SRGBColorSpace
  t.anisotropy = 4
  return t
}

function rgbOf(hex: string): [number, number, number] {
  const h = hex.replace('#', '')
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
}

/** Shift a hex colour by `amt` (−1..1 added to each channel) → css rgb(). */
function shade(hex: string, amt: number): string {
  const [r, g, b] = rgbOf(hex)
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + amt * 255)))
  return `rgb(${f(r)},${f(g)},${f(b)})`
}

/** Scatter `n` faint speckles to break up flat fills. */
function speckle(ctx: CanvasRenderingContext2D, size: number, n: number, color: string): void {
  for (let i = 0; i < n; i++) {
    const x = Math.random() * size
    const y = Math.random() * size
    const v = (Math.random() - 0.5) * 0.16
    ctx.fillStyle = shade(color, v)
    ctx.globalAlpha = 0.5
    ctx.fillRect(x, y, 1, 1)
  }
  ctx.globalAlpha = 1
}

const get = (key: string, make: () => Tex): Tex => {
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const t = make()
  cache.set(key, t)
  return t
}

// ─── Stone (ashlar courses, for castle walls / keep / towers) ────────────────
export function stoneTexture(color: string, repeat = 1): Tex {
  return get(`stone:${color}:${repeat}`, () => {
    const p = pad(128)
    if (!p) return null
    const { c, ctx } = p
    ctx.fillStyle = shade(color, -0.07) // mortar joints
    ctx.fillRect(0, 0, 128, 128)
    const rows = 4
    const cols = 4
    const bh = 128 / rows
    const bw = 128 / cols
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (bw / 2)
      for (let i = -1; i <= cols; i++) {
        const x = i * bw + off + 1.5
        const y = r * bh + 1.5
        ctx.fillStyle = shade(color, (Math.random() - 0.5) * 0.12)
        ctx.fillRect(x, y, bw - 3, bh - 3)
        // top-left highlight bevel
        ctx.fillStyle = shade(color, 0.06)
        ctx.fillRect(x, y, bw - 3, 1.5)
      }
    }
    speckle(ctx, 128, 700, color)
    return finish(c, repeat)
  })
}

// ─── Plaster / stucco (house walls) ──────────────────────────────────────────
export function plasterTexture(color: string, repeat = 1): Tex {
  return get(`plaster:${color}:${repeat}`, () => {
    const p = pad(128)
    if (!p) return null
    const { c, ctx } = p
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 128, 128)
    // soft mottled blobs
    for (let i = 0; i < 90; i++) {
      const x = Math.random() * 128
      const y = Math.random() * 128
      const r = 4 + Math.random() * 16
      ctx.globalAlpha = 0.06 + Math.random() * 0.08
      ctx.fillStyle = shade(color, (Math.random() - 0.5) * 0.5)
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    // a couple of hairline cracks
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = shade(color, -0.18)
      ctx.lineWidth = 0.7
      ctx.beginPath()
      let x = Math.random() * 128
      let y = Math.random() * 128
      ctx.moveTo(x, y)
      for (let s = 0; s < 6; s++) {
        x += (Math.random() - 0.5) * 20
        y += 6 + Math.random() * 10
        ctx.lineTo(x, y)
      }
      ctx.stroke()
    }
    speckle(ctx, 128, 400, color)
    return finish(c, repeat)
  })
}

// ─── Wood planks (beams, doors, timber) ──────────────────────────────────────
export function woodTexture(color: string, repeat = 1, planks = 4): Tex {
  return get(`wood:${color}:${repeat}:${planks}`, () => {
    const p = pad(128)
    if (!p) return null
    const { c, ctx } = p
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 128, 128)
    const pw = 128 / planks
    for (let i = 0; i < planks; i++) {
      const x = i * pw
      ctx.fillStyle = shade(color, (Math.random() - 0.5) * 0.1)
      ctx.fillRect(x, 0, pw, 128)
      // plank gap
      ctx.fillStyle = shade(color, -0.22)
      ctx.fillRect(x, 0, 1.5, 128)
      // vertical grain streaks
      for (let g = 0; g < 7; g++) {
        ctx.strokeStyle = shade(color, (Math.random() - 0.5) * 0.16)
        ctx.lineWidth = 0.8
        ctx.beginPath()
        const gx = x + 3 + Math.random() * (pw - 6)
        ctx.moveTo(gx, 0)
        ctx.bezierCurveTo(gx + 3, 42, gx - 3, 86, gx + 2, 128)
        ctx.stroke()
      }
    }
    return finish(c, repeat)
  })
}

// ─── Roof shingles (overlapping scalloped tiles) ─────────────────────────────
export function shingleTexture(color: string, repeat = 1): Tex {
  return get(`shingle:${color}:${repeat}`, () => {
    const p = pad(128)
    if (!p) return null
    const { c, ctx } = p
    ctx.fillStyle = shade(color, -0.12)
    ctx.fillRect(0, 0, 128, 128)
    const rows = 6
    const cols = 6
    const rh = 128 / rows
    const cw = 128 / cols
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * (cw / 2)
      for (let i = -1; i <= cols; i++) {
        const x = i * cw + off
        const y = r * rh
        ctx.fillStyle = shade(color, (Math.random() - 0.5) * 0.14)
        ctx.beginPath()
        // rounded-bottom shingle
        ctx.moveTo(x, y)
        ctx.lineTo(x + cw, y)
        ctx.lineTo(x + cw, y + rh * 0.5)
        ctx.quadraticCurveTo(x + cw / 2, y + rh * 1.05, x, y + rh * 0.5)
        ctx.closePath()
        ctx.fill()
        // shadow line under each row
        ctx.strokeStyle = shade(color, -0.2)
        ctx.lineWidth = 1
        ctx.stroke()
      }
    }
    return finish(c, repeat)
  })
}

// ─── Thatch (golden straw roof) ──────────────────────────────────────────────
export function thatchTexture(color: string, repeat = 1): Tex {
  return get(`thatch:${color}:${repeat}`, () => {
    const p = pad(128)
    if (!p) return null
    const { c, ctx } = p
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 128, 128)
    for (let i = 0; i < 900; i++) {
      const x = Math.random() * 128
      const y = Math.random() * 128
      const len = 8 + Math.random() * 16
      ctx.strokeStyle = shade(color, (Math.random() - 0.5) * 0.3)
      ctx.lineWidth = 0.8 + Math.random()
      ctx.beginPath()
      ctx.moveTo(x, y)
      ctx.lineTo(x + (Math.random() - 0.5) * 3, y + len)
      ctx.stroke()
    }
    return finish(c, repeat)
  })
}

// ─── Water surface (scrolling ripple/caustic lines) ──────────────────────────
export function waterTexture(color: string, repeat = 6): Tex {
  return get(`water:${color}:${repeat}`, () => {
    const p = pad(128)
    if (!p) return null
    const { c, ctx } = p
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 128, 128)
    // Wavy horizontal highlight bands — read as light glinting off ripples.
    ctx.lineWidth = 1.4
    for (let i = 0; i < 22; i++) {
      const y = Math.random() * 128
      ctx.strokeStyle = shade(color, 0.05 + Math.random() * 0.12)
      ctx.globalAlpha = 0.5
      ctx.beginPath()
      ctx.moveTo(0, y)
      for (let x = 0; x <= 128; x += 16) {
        ctx.lineTo(x, y + Math.sin(x * 0.12 + i) * 3)
      }
      ctx.stroke()
    }
    // Darker troughs.
    for (let i = 0; i < 14; i++) {
      const y = Math.random() * 128
      ctx.strokeStyle = shade(color, -0.1)
      ctx.globalAlpha = 0.4
      ctx.beginPath()
      ctx.moveTo(0, y)
      for (let x = 0; x <= 128; x += 16) ctx.lineTo(x, y + Math.cos(x * 0.1 + i) * 2)
      ctx.stroke()
    }
    ctx.globalAlpha = 1
    return finish(c, repeat)
  })
}

// ─── Cobble / flagstone (castle courtyard floor) ─────────────────────────────
export function cobbleTexture(color: string, repeat = 1): Tex {
  return get(`cobble:${color}:${repeat}`, () => {
    const p = pad(128)
    if (!p) return null
    const { c, ctx } = p
    ctx.fillStyle = shade(color, -0.18) // mortar/gaps between stones
    ctx.fillRect(0, 0, 128, 128)
    const cells = 5
    const cs = 128 / cells
    for (let ry = 0; ry < cells; ry++) {
      const off = (ry % 2) * (cs / 2) // running-bond offset on alternate rows
      for (let rx = -1; rx <= cells; rx++) {
        const jx = (Math.random() - 0.5) * 4
        const jy = (Math.random() - 0.5) * 4
        const x = rx * cs + off + 2 + jx
        const y = ry * cs + 2 + jy
        const w = cs - 4
        const h = cs - 4
        ctx.fillStyle = shade(color, (Math.random() - 0.5) * 0.18)
        ctx.fillRect(x, y, w, h)
        // top-left sheen bevel
        ctx.fillStyle = shade(color, 0.08)
        ctx.fillRect(x, y, w, 1.5)
        ctx.fillRect(x, y, 1.5, h)
        // bottom-right shadow bevel
        ctx.fillStyle = shade(color, -0.12)
        ctx.fillRect(x, y + h - 1.5, w, 1.5)
      }
    }
    speckle(ctx, 128, 500, color)
    return finish(c, repeat)
  })
}

// ─── Tilled soil (farm bed) ──────────────────────────────────────────────────
export function soilTexture(color: string, repeat = 1): Tex {
  return get(`soil:${color}:${repeat}`, () => {
    const p = pad(128)
    if (!p) return null
    const { c, ctx } = p
    ctx.fillStyle = color
    ctx.fillRect(0, 0, 128, 128)
    // furrow ridges
    for (let y = 0; y < 128; y += 10) {
      ctx.fillStyle = shade(color, 0.05)
      ctx.fillRect(0, y, 128, 5)
      ctx.fillStyle = shade(color, -0.08)
      ctx.fillRect(0, y + 5, 128, 5)
    }
    speckle(ctx, 128, 900, color)
    return finish(c, repeat)
  })
}
