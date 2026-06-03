import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { buildTiles, tileTopY, type Biome } from './tileMap'
import { applyVisionShader } from './vision'
import { getDetailTextures } from './terrainDetail'

// ─── Side (cliff) materials ──────────────────────────────────────────
const SIDE_DIRT = new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 1 })
const SIDE_DIRT_DARK = new THREE.MeshStandardMaterial({ color: '#4a321d', roughness: 1 })
const SIDE_SAND = new THREE.MeshStandardMaterial({ color: '#c4a86a', roughness: 1 })
const SIDE_SAND_DARK = new THREE.MeshStandardMaterial({ color: '#8a784a', roughness: 1 })
const SIDE_ROCK = new THREE.MeshStandardMaterial({ color: '#80808a', roughness: 1 })
const SIDE_ROCK_DARK = new THREE.MeshStandardMaterial({ color: '#5d5d68', roughness: 1 })
const SIDE_SNOW = new THREE.MeshStandardMaterial({ color: '#b4bdcb', roughness: 1 })
const SIDE_SNOW_DARK = new THREE.MeshStandardMaterial({ color: '#7d8694', roughness: 1 })
const SIDE_SWAMP = new THREE.MeshStandardMaterial({ color: '#3a3a26', roughness: 1 })
const SIDE_SWAMP_DARK = new THREE.MeshStandardMaterial({ color: '#26261a', roughness: 1 })

const detail = getDetailTextures()

// Side (cliff) faces: subtle variation, no detail texture (it would smear on
// vertical faces).
;[
  SIDE_DIRT,
  SIDE_DIRT_DARK,
  SIDE_SAND,
  SIDE_SAND_DARK,
  SIDE_ROCK,
  SIDE_ROCK_DARK,
  SIDE_SNOW,
  SIDE_SNOW_DARK,
  SIDE_SWAMP,
  SIDE_SWAMP_DARK,
].forEach((mat) => applyVisionShader(mat, { variation: 0.5 }))

// ─── Surface classes ─────────────────────────────────────────────────
// A tile's *surface class* = the look of its top face. Grass plateaus (h≥2) read
// as a darker ridge. Each class has one spec, shared by the base tile material
// and the seam-overlay material.
type TopClass = 'grass' | 'grass_dark' | 'forest' | 'sand' | 'rock' | 'snow' | 'desert' | 'plains' | 'swamp'

// Tiles at or above this height class get a SNOW top regardless of their biome,
// so the rock range (peak 13) wears a white cap on its upper classes and the
// snow massif (peak 13) stays white over its top. Roughly peak-3 now that the
// mountains are compact.
export const SNOW_CAP_HEIGHT = 10

function classOf(biome: Biome, h: number): TopClass {
  // Very high ground is snow-capped whatever the biome — white rock peaks +
  // fully-white snow massif. Checked first so it wins over the biome's own top.
  if (h >= SNOW_CAP_HEIGHT) return 'snow'
  // Grassy biomes share ONE look: flat grass, forest floor, and grass plateaus
  // are all near-identical greens, so unifying them avoids "off grass" seams.
  // Forest still reads as forest from its dense trees, not the ground colour.
  if (biome === 'grass' || biome === 'forest' || biome === 'plains') return 'grass'
  return biome as TopClass
}

interface TopSpec {
  color: string
  rough: number
  flat: boolean
  tex: THREE.CanvasTexture
  detailScale: number
  detailStrength: number
  variation: number
  /** the two cliff-side materials [light, dark] */
  side: THREE.Material
  sideDark: THREE.Material
}

const TOP_SPECS: Record<TopClass, TopSpec> = {
  grass: { color: '#6cb14a', rough: 0.92, flat: false, tex: detail.grass, detailScale: 0.18, detailStrength: 0.72, variation: 1.0, side: SIDE_DIRT, sideDark: SIDE_DIRT_DARK },
  grass_dark: { color: '#52923a', rough: 0.92, flat: false, tex: detail.grass, detailScale: 0.18, detailStrength: 0.72, variation: 1.0, side: SIDE_DIRT, sideDark: SIDE_DIRT_DARK },
  forest: { color: '#3f8a3a', rough: 0.95, flat: false, tex: detail.grass, detailScale: 0.18, detailStrength: 0.65, variation: 0.85, side: SIDE_DIRT, sideDark: SIDE_DIRT_DARK },
  plains: { color: '#a8c45a', rough: 0.92, flat: false, tex: detail.grass, detailScale: 0.18, detailStrength: 0.65, variation: 1.0, side: SIDE_DIRT, sideDark: SIDE_DIRT_DARK },
  sand: { color: '#e6cf94', rough: 0.95, flat: false, tex: detail.sand, detailScale: 0.3, detailStrength: 0.5, variation: 0.6, side: SIDE_SAND, sideDark: SIDE_SAND_DARK },
  desert: { color: '#e8c585', rough: 0.95, flat: false, tex: detail.sand, detailScale: 0.3, detailStrength: 0.5, variation: 0.6, side: SIDE_SAND, sideDark: SIDE_SAND_DARK },
  rock: { color: '#a8a8b0', rough: 0.95, flat: true, tex: detail.rock, detailScale: 0.3, detailStrength: 0.6, variation: 0.7, side: SIDE_ROCK, sideDark: SIDE_ROCK_DARK },
  snow: { color: '#eef3f8', rough: 0.85, flat: true, tex: detail.snow, detailScale: 0.3, detailStrength: 0.4, variation: 0.45, side: SIDE_SNOW, sideDark: SIDE_SNOW_DARK },
  swamp: { color: '#587a36', rough: 1, flat: true, tex: detail.swamp, detailScale: 0.25, detailStrength: 0.6, variation: 0.85, side: SIDE_SWAMP, sideDark: SIDE_SWAMP_DARK },
}

const CLASSES = Object.keys(TOP_SPECS) as TopClass[]

function makeTopMat(s: TopSpec, edgeAlpha: boolean): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: s.color, roughness: s.rough, flatShading: s.flat })
  applyVisionShader(m, {
    detail: s.tex,
    detailMean: s.tex.userData.mean as number,
    detailScale: s.detailScale,
    detailStrength: s.detailStrength,
    variation: s.variation,
    edgeAlpha,
  })
  return m
}

// Base top material per class (solid), and a seam-overlay copy with edgeAlpha so
// the neighbour biome can fray over a seam tile with its REAL texture + shading.
const BASE_TOP = {} as Record<TopClass, THREE.MeshStandardMaterial>
const OVERLAY_TOP = {} as Record<TopClass, THREE.MeshStandardMaterial>
CLASSES.forEach((c) => {
  BASE_TOP[c] = makeTopMat(TOP_SPECS[c], false)
  OVERLAY_TOP[c] = makeTopMat(TOP_SPECS[c], true)
  // Decal-style depth bias: the seam overlay sits COPLANAR with the base tile
  // top (OVERLAY_EPS = 0) and wins the depth test via polygonOffset instead of a
  // physical Y gap. A positive Y gap (the old 0.03) z-fought at distance/grazing
  // angles, drawing a thin bright line along the seam band — the "lines at biome
  // edges". A constant depth bias avoids that and any hovering lip at steps.
  OVERLAY_TOP[c].polygonOffset = true
  OVERLAY_TOP[c].polygonOffsetFactor = -2
  OVERLAY_TOP[c].polygonOffsetUnits = -4
})

// Box face order: +x, -x, +y (top), -y (bottom), +z, -z
function classMats(c: TopClass): THREE.Material[] {
  const s = TOP_SPECS[c]
  return [s.side, s.side, BASE_TOP[c], s.sideDark, s.side, s.side]
}

// Stable per-class rank: the higher-ranked biome creeps over the lower at a seam,
// so each seam gets exactly one overlay (no double-coverage).
const CLASS_ORDER: TopClass[] = ['grass', 'grass_dark', 'plains', 'forest', 'swamp', 'sand', 'desert', 'rock', 'snow']
const rankOf = (c: TopClass): number => CLASS_ORDER.indexOf(c)

const BOX_GEO = new THREE.BoxGeometry(1, 1, 1)

// ─── Base terrain (instanced boxes) ──────────────────────────────────
interface TilePos {
  x: number
  z: number
  top: number
}

function InstancedTiles({ positions, materials, cast }: { positions: TilePos[]; materials: THREE.Material[]; cast: boolean }) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useEffect(() => {
    const dummy = new THREE.Object3D()
    positions.forEach((p, i) => {
      dummy.position.set(p.x + 0.5, p.top / 2, p.z + 0.5)
      dummy.scale.set(1, p.top, 1)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      ref.current.setMatrixAt(i, dummy.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [positions])
  return <instancedMesh ref={ref} args={[BOX_GEO, materials, positions.length]} castShadow={cast} receiveShadow />
}

// ─── Seam overlay (real neighbour biome, road-style noise fray) ───────
interface OverlayPos {
  x: number
  z: number
  top: number
  /** per-corner coverage [(x,z),(x+1,z),(x,z+1),(x+1,z+1)] — 1 by the seam, 0 inland */
  cov: [number, number, number, number]
}

// Coplanar with the base top (depth handled by polygonOffset on OVERLAY_TOP, see
// above): the frayed neighbour biome covers the base where the shader keeps the
// fragment and reveals it where it discards, with no z-fighting seam line.
const OVERLAY_EPS = 0

function OverlayLayer({ tiles, material }: { tiles: OverlayPos[]; material: THREE.Material }) {
  const geo = useMemo(() => {
    const n = tiles.length
    const pos = new Float32Array(n * 4 * 3)
    const nor = new Float32Array(n * 4 * 3)
    const cov = new Float32Array(n * 4)
    const idx = new Uint32Array(n * 6)
    let v = 0
    let ii = 0
    for (const t of tiles) {
      const base = v
      const y = t.top + OVERLAY_EPS
      const corners = [
        [t.x, t.z],
        [t.x + 1, t.z],
        [t.x, t.z + 1],
        [t.x + 1, t.z + 1],
      ]
      for (let k = 0; k < 4; k++) {
        pos[v * 3] = corners[k][0]
        pos[v * 3 + 1] = y
        pos[v * 3 + 2] = corners[k][1]
        nor[v * 3 + 1] = 1
        cov[v] = t.cov[k]
        v++
      }
      idx[ii++] = base + 0
      idx[ii++] = base + 2
      idx[ii++] = base + 3
      idx[ii++] = base + 0
      idx[ii++] = base + 3
      idx[ii++] = base + 1
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    g.setAttribute('normal', new THREE.BufferAttribute(nor, 3))
    g.setAttribute('aCoverage', new THREE.BufferAttribute(cov, 1))
    g.setIndex(new THREE.BufferAttribute(idx, 1))
    return g
  }, [tiles])
  useEffect(() => () => geo.dispose(), [geo])
  return <mesh geometry={geo} material={material} receiveShadow />
}

export function Terrain() {
  const { base, overlays } = useMemo(() => {
    const tiles = buildTiles()

    const classGrid: (TopClass | null)[][] = tiles.map((row) =>
      row.map((t) => (t ? classOf(t.biome, Math.max(1, Math.round(t.height))) : null)),
    )
    const classAt = (x: number, z: number): TopClass | null =>
      z >= 0 && z < classGrid.length && x >= 0 && x < classGrid[z].length ? classGrid[z][x] : null
    // Corner coverage for an overlay of class N: 1 if any of the four tiles
    // meeting at the corner is class N, else 0. Interpolated across the quad it
    // gives a gradient from the seam (1) inland (0); the shader's noise discard
    // then frays that gradient into an irregular, sub-tile edge.
    const cornerCov = (cx: number, cz: number, n: TopClass): number =>
      classAt(cx - 1, cz - 1) === n ||
      classAt(cx, cz - 1) === n ||
      classAt(cx - 1, cz) === n ||
      classAt(cx, cz) === n
        ? 1
        : 0

    const baseBuckets = new Map<TopClass, TilePos[]>()
    const overlayBuckets = new Map<TopClass, OverlayPos[]>()

    tiles.forEach((row, z) =>
      row.forEach((tile, x) => {
        if (!tile) return
        const h = Math.max(1, Math.round(tile.height))
        const own = classOf(tile.biome, h)
        const top = tileTopY(x, z)

        let bList = baseBuckets.get(own)
        if (!bList) baseBuckets.set(own, (bList = []))
        bList.push({ x, z, top })

        // The single highest-ranked neighbouring class (8-neighbourhood) that
        // outranks this tile creeps over it.
        let creep: TopClass | null = null
        let creepRank = -1
        for (let dz = -1; dz <= 1; dz++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (!dx && !dz) continue
            const c = classAt(x + dx, z + dz)
            if (!c || c === own) continue
            const r = rankOf(c)
            if (r > rankOf(own) && r > creepRank) {
              creepRank = r
              creep = c
            }
          }
        }
        if (creep) {
          const cov: [number, number, number, number] = [
            cornerCov(x, z, creep),
            cornerCov(x + 1, z, creep),
            cornerCov(x, z + 1, creep),
            cornerCov(x + 1, z + 1, creep),
          ]
          let oList = overlayBuckets.get(creep)
          if (!oList) overlayBuckets.set(creep, (oList = []))
          oList.push({ x, z, top, cov })
        }
      }),
    )

    // Split each class into FLAT (top===1, base ground) and TALL (top>1,
    // elevated terrain) instanced meshes. Flat ground boxes are buried flush
    // against equal-height neighbours and cast no visible shadow, so they're
    // marked castShadow=false — they no longer enter the shadow pass, which is
    // what removes the periodic shadow-frame triangle spike (the bulk of the
    // map is flat). TALL tiles (mountains, plateaus, cliffs) still cast, so the
    // terrain relief that DOES throw a shadow is unchanged.
    const base: { positions: TilePos[]; mats: THREE.Material[]; cast: boolean }[] = []
    for (const [cls, positions] of baseBuckets) {
      const mats = classMats(cls)
      const flat = positions.filter((p) => p.top <= 1)
      const tall = positions.filter((p) => p.top > 1)
      if (flat.length) base.push({ positions: flat, mats, cast: false })
      if (tall.length) base.push({ positions: tall, mats, cast: true })
    }

    return {
      base,
      overlays: Array.from(overlayBuckets.entries()).map(([cls, tiles]) => ({ tiles, material: OVERLAY_TOP[cls] })),
    }
  }, [])

  return (
    <group>
      {base.map((g, i) => (
        <InstancedTiles key={`b${i}`} positions={g.positions} materials={g.mats} cast={g.cast} />
      ))}
      {overlays.map((o, i) => (
        <OverlayLayer key={`o${i}`} tiles={o.tiles} material={o.material} />
      ))}
    </group>
  )
}
