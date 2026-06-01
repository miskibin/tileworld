import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Shared helper for collapsing a creature's hand-authored mesh tree into the
// fewest possible draw calls WITHOUT changing a single pixel.
//
// A creature is built from many small <mesh>es. Every mesh that is STATIC
// relative to the same frame of reference (the root group, or one animated
// sub-group like an arm) and shares the SAME material AND the SAME castShadow
// flag renders identically whether it's one mesh or many — so we weld those
// into a single geometry. Bucketing by (material, castShadow) is what keeps the
// result pixel- and shadow-identical: meshes that cast shadows never get merged
// with ones that don't, so the shadow pass is unchanged too.
//
// This mirrors the prop merge in Scatter.tsx, generalised so any creature can
// declare its static parts as data and get back one merged Part per bucket.
// Geometries are built once at module scope and shared across every instance of
// the creature (e.g. all orks), which also drops the per-instance geometry
// allocation the JSX form paid on every spawn.

export interface PartSpec {
  geo: THREE.BufferGeometry
  mat: THREE.Material
  /** local offset within the frame of reference (the JSX `position`) */
  pos?: [number, number, number]
  /** local rotation within the frame of reference (the JSX `rotation`) */
  rot?: [number, number, number]
  /** uniform scale (the JSX `scale`) */
  scale?: number
  castShadow?: boolean
  /**
   * Optional logical bucket. When a creature builds its materials PER INSTANCE
   * (e.g. an ork tints its own skin on a hurt flash) the geometry is still
   * shared across all instances, so we bucket by this stable slot name instead
   * of the per-instance material identity, and the caller supplies the real
   * material at render time. Omit it for shared module-level materials.
   */
  slot?: string
}

export interface MergedPart {
  geo: THREE.BufferGeometry
  mat: THREE.Material
  castShadow: boolean
  slot?: string
}

/** Bake a part's local transform into a clone of its geometry. */
function baked(p: PartSpec): THREE.BufferGeometry {
  const g = p.geo.clone()
  if (p.scale && p.scale !== 1) g.scale(p.scale, p.scale, p.scale)
  if (p.rot) {
    if (p.rot[0]) g.rotateX(p.rot[0])
    if (p.rot[1]) g.rotateY(p.rot[1])
    if (p.rot[2]) g.rotateZ(p.rot[2])
  }
  if (p.pos) g.translate(p.pos[0], p.pos[1], p.pos[2])
  return g
}

/**
 * Merge a list of static parts into one MergedPart per (material, castShadow)
 * bucket. First-seen order is preserved so draw ordering is stable.
 */
export function mergeParts(parts: PartSpec[]): MergedPart[] {
  const buckets = new Map<string, { geos: THREE.BufferGeometry[]; mat: THREE.Material; cast: boolean; slot?: string }>()
  const order: string[] = []
  for (const p of parts) {
    const cast = p.castShadow ?? false
    const key = `${p.slot ?? p.mat.uuid}|${cast ? 1 : 0}`
    let b = buckets.get(key)
    if (!b) {
      b = { geos: [], mat: p.mat, cast, slot: p.slot }
      buckets.set(key, b)
      order.push(key)
    }
    b.geos.push(baked(p))
  }
  return order.map((key) => {
    const b = buckets.get(key)!
    const geo = b.geos.length === 1 ? b.geos[0] : (mergeGeometries(b.geos, false) as THREE.BufferGeometry)
    return { geo, mat: b.mat, castShadow: b.cast, slot: b.slot }
  })
}
