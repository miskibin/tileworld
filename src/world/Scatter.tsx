import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { getObstacles, type Obstacle } from './obstacles'
import { applyWind, windTime } from './wind'
import { isFrozen } from './pauseStore'

// ─── Shared materials (module singletons) ───────────────────────────────────
const TRUNK_MAT = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 1 })
const FOLIAGE_DARK_MAT = new THREE.MeshStandardMaterial({ color: '#2f7a36', roughness: 0.95, flatShading: true })
const FOLIAGE_MID_MAT = new THREE.MeshStandardMaterial({ color: '#3a9442', roughness: 0.95, flatShading: true })
const FOLIAGE_LIGHT_MAT = new THREE.MeshStandardMaterial({ color: '#4cb358', roughness: 0.95, flatShading: true })

const BIRCH_TRUNK_MAT = new THREE.MeshStandardMaterial({ color: '#ece8d8', roughness: 0.9 })
const BIRCH_MARK_MAT = new THREE.MeshStandardMaterial({ color: '#2a261e', roughness: 1 })
const BIRCH_DARK_MAT = new THREE.MeshStandardMaterial({ color: '#3a8c34', roughness: 0.95, flatShading: true })
const BIRCH_LIGHT_MAT = new THREE.MeshStandardMaterial({ color: '#7dc04a', roughness: 0.95, flatShading: true })

const SNOWPINE_DARK_MAT = new THREE.MeshStandardMaterial({ color: '#35614a', roughness: 0.95, flatShading: true })
const SNOWPINE_MID_MAT = new THREE.MeshStandardMaterial({ color: '#427a5a', roughness: 0.95, flatShading: true })
const SNOW_MAT = new THREE.MeshStandardMaterial({ color: '#eef3f8', roughness: 0.7, flatShading: true })

const DEAD_MAT = new THREE.MeshStandardMaterial({ color: '#6e6258', roughness: 1, flatShading: true })
const DEAD_DARK_MAT = new THREE.MeshStandardMaterial({ color: '#4a4238', roughness: 1, flatShading: true })

const ROCK_MAT = new THREE.MeshStandardMaterial({ color: '#d3d3d3', roughness: 0.85, flatShading: true })
const BOULDER_MAT = new THREE.MeshStandardMaterial({ color: '#a8a8b0', roughness: 0.95, flatShading: true })
const BOULDER_DARK_MAT = new THREE.MeshStandardMaterial({ color: '#7c7c84', roughness: 0.95, flatShading: true })
const MOSS_MAT = new THREE.MeshStandardMaterial({ color: '#4a7a2a', roughness: 1, flatShading: true })

const BUSH_MATS = [
  new THREE.MeshStandardMaterial({ color: '#3a8a3a', roughness: 0.95, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: '#4aa84a', roughness: 0.95, flatShading: true }),
  new THREE.MeshStandardMaterial({ color: '#65bb55', roughness: 0.95, flatShading: true }),
]

const TUFT_MAT = new THREE.MeshStandardMaterial({ color: '#3aa044', roughness: 1, flatShading: true })

const CACTUS_MAT = new THREE.MeshStandardMaterial({ color: '#3e8b3e', roughness: 0.85, flatShading: true })
const CACTUS_DARK_MAT = new THREE.MeshStandardMaterial({ color: '#2f6a2f', roughness: 0.9, flatShading: true })

// Ice shard (snow): pale translucent crystal spires + a frosted base dusting.
const ICE_MAT = new THREE.MeshStandardMaterial({
  color: '#bfe4f5',
  roughness: 0.25,
  metalness: 0.05,
  transparent: true,
  opacity: 0.85,
  flatShading: true,
})
const ICE_DARK_MAT = new THREE.MeshStandardMaterial({ color: '#8fc4dd', roughness: 0.3, flatShading: true })

// Bones (desert): sun-bleached skull + ribs, lying on the sand.
const BONE_MAT = new THREE.MeshStandardMaterial({ color: '#e8e0cc', roughness: 0.95, flatShading: true })
const BONE_SHADOW_MAT = new THREE.MeshStandardMaterial({ color: '#cfc4a6', roughness: 1, flatShading: true })

// Reeds (swamp): tall thin marsh blades + brown cattail tips.
const REED_MAT = new THREE.MeshStandardMaterial({ color: '#6b8a44', roughness: 1, flatShading: true })
const REED_DARK_MAT = new THREE.MeshStandardMaterial({ color: '#4f6c34', roughness: 1, flatShading: true })
const CATTAIL_MAT = new THREE.MeshStandardMaterial({ color: '#7a4a2a', roughness: 1, flatShading: true })

const STEM_MAT = new THREE.MeshStandardMaterial({ color: '#f0e8d0', roughness: 0.9 })
const RED_CAP_MAT = new THREE.MeshStandardMaterial({ color: '#c83838', roughness: 0.9, flatShading: true })
const BROWN_CAP_MAT = new THREE.MeshStandardMaterial({ color: '#8a5a3a', roughness: 0.9, flatShading: true })
const DOT_MAT = new THREE.MeshStandardMaterial({ color: '#f8f6e8', roughness: 0.9 })

const FLOWER_STEM_MAT = new THREE.MeshStandardMaterial({ color: '#3a7a2a', roughness: 1 })
const FLOWER_CENTER_MAT = new THREE.MeshStandardMaterial({ color: '#e8c84a', roughness: 0.9 })
const FLOWER_PETAL_MATS = [
  new THREE.MeshStandardMaterial({ color: '#d63a3a', roughness: 0.9 }),
  new THREE.MeshStandardMaterial({ color: '#e6c84a', roughness: 0.9 }),
  new THREE.MeshStandardMaterial({ color: '#6abadf', roughness: 0.9 }),
  new THREE.MeshStandardMaterial({ color: '#e88ad6', roughness: 0.9 }),
]

// Inject wind sway into the leafy materials only — broadleaf canopies, bushes,
// reeds and grass tufts. Trunks (TRUNK/BIRCH_TRUNK), snow caps, cactus, rocks,
// bones, mushrooms and flowers stay rigid. Done once here at module load on the
// shared singletons, so every instanced foliage mesh sways off one uniform.
;[
  FOLIAGE_DARK_MAT,
  FOLIAGE_MID_MAT,
  FOLIAGE_LIGHT_MAT,
  BIRCH_DARK_MAT,
  BIRCH_LIGHT_MAT,
  BUSH_MATS[0],
  BUSH_MATS[1],
  BUSH_MATS[2],
  REED_MAT,
  REED_DARK_MAT,
  TUFT_MAT,
].forEach(applyWind)

// ─── Part geometry helpers (pre-translated / pre-rotated to bake local offset)
interface Part {
  geo: THREE.BufferGeometry
  mat: THREE.Material
  castShadow?: boolean
  tint?: boolean
}

function bake(
  factory: () => THREE.BufferGeometry,
  translate?: [number, number, number],
  rotate?: [number, number, number],
): THREE.BufferGeometry {
  const g = factory()
  if (rotate) {
    g.rotateX(rotate[0])
    g.rotateY(rotate[1])
    g.rotateZ(rotate[2])
  }
  if (translate) g.translate(translate[0], translate[1], translate[2])
  return g
}

function bushParts(mat: THREE.Material): Part[] {
  return [
    { geo: bake(() => new THREE.IcosahedronGeometry(0.24, 0), [0, 0.18, 0]), mat, castShadow: true, tint: true },
    { geo: bake(() => new THREE.IcosahedronGeometry(0.2, 0), [0.2, 0.15, 0.05]), mat, castShadow: true, tint: true },
    { geo: bake(() => new THREE.IcosahedronGeometry(0.18, 0), [-0.17, 0.13, 0.1]), mat, castShadow: true, tint: true },
    { geo: bake(() => new THREE.IcosahedronGeometry(0.19, 0), [0.05, 0.22, -0.16]), mat, castShadow: true, tint: true },
  ]
}

function mushroomRedParts(): Part[] {
  return [
    { geo: bake(() => new THREE.CylinderGeometry(0.028, 0.04, 0.1, 6), [0, 0.05, 0]), mat: STEM_MAT, castShadow: true },
    { geo: bake(() => new THREE.SphereGeometry(0.09, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.12, 0]), mat: RED_CAP_MAT, castShadow: true },
    { geo: bake(() => new THREE.SphereGeometry(0.018, 6, 5), [0.045, 0.165, 0.02]), mat: DOT_MAT },
    { geo: bake(() => new THREE.SphereGeometry(0.014, 6, 5), [-0.035, 0.155, -0.04]), mat: DOT_MAT },
    { geo: bake(() => new THREE.SphereGeometry(0.012, 6, 5), [0.01, 0.18, 0.05]), mat: DOT_MAT },
  ]
}

function mushroomBrownParts(): Part[] {
  return [
    { geo: bake(() => new THREE.CylinderGeometry(0.028, 0.04, 0.1, 6), [0, 0.05, 0]), mat: STEM_MAT, castShadow: true },
    { geo: bake(() => new THREE.SphereGeometry(0.09, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2), [0, 0.12, 0]), mat: BROWN_CAP_MAT, castShadow: true },
  ]
}

function flowerParts(petalMat: THREE.Material): Part[] {
  const parts: Part[] = [
    { geo: bake(() => new THREE.CylinderGeometry(0.008, 0.008, 0.14, 4), [0, 0.07, 0]), mat: FLOWER_STEM_MAT },
    { geo: bake(() => new THREE.SphereGeometry(0.02, 5, 4), [0, 0.15, 0]), mat: FLOWER_CENTER_MAT },
  ]
  for (let i = 0; i < 4; i++) {
    parts.push({
      geo: bake(
        () => new THREE.SphereGeometry(0.028, 5, 4),
        [Math.cos((i * Math.PI) / 2) * 0.04, 0.15, Math.sin((i * Math.PI) / 2) * 0.04],
      ),
      mat: petalMat,
    })
  }
  return parts
}

const PARTS: Record<string, Part[]> = {
  tree: [
    { geo: bake(() => new THREE.CylinderGeometry(0.09, 0.12, 0.5, 6), [0, 0.25, 0]), mat: TRUNK_MAT, castShadow: true },
    { geo: bake(() => new THREE.IcosahedronGeometry(0.46, 1), [0, 0.64, 0]), mat: FOLIAGE_DARK_MAT, castShadow: true, tint: true },
    { geo: bake(() => new THREE.IcosahedronGeometry(0.26, 1), [0.24, 0.6, 0.06]), mat: FOLIAGE_DARK_MAT, castShadow: true, tint: true },
    { geo: bake(() => new THREE.IcosahedronGeometry(0.4, 1), [0, 0.86, 0]), mat: FOLIAGE_MID_MAT, castShadow: true, tint: true },
    { geo: bake(() => new THREE.IcosahedronGeometry(0.24, 1), [-0.22, 0.82, -0.08]), mat: FOLIAGE_MID_MAT, castShadow: true, tint: true },
    { geo: bake(() => new THREE.IcosahedronGeometry(0.33, 1), [0, 1.06, 0]), mat: FOLIAGE_LIGHT_MAT, castShadow: true, tint: true },
    { geo: bake(() => new THREE.IcosahedronGeometry(0.22, 1), [0, 1.24, 0]), mat: FOLIAGE_LIGHT_MAT, castShadow: true, tint: true },
  ],
  birch: [
    { geo: bake(() => new THREE.CylinderGeometry(0.06, 0.075, 0.8, 6), [0, 0.4, 0]), mat: BIRCH_TRUNK_MAT, castShadow: true },
    { geo: bake(() => new THREE.BoxGeometry(0.005, 0.04, 0.08), [0.075, 0.55, 0]), mat: BIRCH_MARK_MAT },
    { geo: bake(() => new THREE.BoxGeometry(0.005, 0.03, 0.06), [-0.075, 0.32, 0.02]), mat: BIRCH_MARK_MAT },
    { geo: bake(() => new THREE.IcosahedronGeometry(0.34, 0), [0, 0.95, 0]), mat: BIRCH_DARK_MAT, castShadow: true },
    { geo: bake(() => new THREE.IcosahedronGeometry(0.22, 0), [0.18, 1.05, 0.1]), mat: BIRCH_LIGHT_MAT, castShadow: true },
    { geo: bake(() => new THREE.IcosahedronGeometry(0.24, 0), [-0.16, 1.0, -0.1]), mat: BIRCH_DARK_MAT, castShadow: true },
    { geo: bake(() => new THREE.IcosahedronGeometry(0.18, 0), [0.05, 1.18, 0]), mat: BIRCH_LIGHT_MAT, castShadow: true },
  ],
  snowPine: [
    { geo: bake(() => new THREE.CylinderGeometry(0.08, 0.1, 0.36, 6), [0, 0.18, 0]), mat: TRUNK_MAT, castShadow: true },
    { geo: bake(() => new THREE.ConeGeometry(0.5, 0.45, 7), [0, 0.48, 0]), mat: SNOWPINE_DARK_MAT, castShadow: true },
    { geo: bake(() => new THREE.ConeGeometry(0.38, 0.42, 7), [0, 0.78, 0]), mat: SNOWPINE_MID_MAT, castShadow: true },
    { geo: bake(() => new THREE.ConeGeometry(0.26, 0.4, 7), [0, 1.06, 0]), mat: SNOWPINE_MID_MAT, castShadow: true },
    // Snow-capped peak + dustings of snow clinging to the lower branches.
    { geo: bake(() => new THREE.ConeGeometry(0.27, 0.18, 7), [0, 1.28, 0]), mat: SNOW_MAT, castShadow: true },
    { geo: bake(() => new THREE.IcosahedronGeometry(0.13, 0), [0.2, 0.6, 0.08]), mat: SNOW_MAT },
    { geo: bake(() => new THREE.IcosahedronGeometry(0.1, 0), [-0.15, 0.86, -0.05]), mat: SNOW_MAT },
  ],
  deadTree: [
    { geo: bake(() => new THREE.CylinderGeometry(0.06, 0.095, 0.9, 6), [0, 0.45, 0]), mat: DEAD_MAT, castShadow: true },
    {
      geo: bake(() => new THREE.CylinderGeometry(0.025, 0.04, 0.42, 5), [0.2, 0.7, 0.08], [0, 0, -0.8]),
      mat: DEAD_DARK_MAT,
      castShadow: true,
    },
    {
      geo: bake(() => new THREE.CylinderGeometry(0.022, 0.035, 0.36, 5), [-0.17, 0.82, -0.04], [0, 0, 0.7]),
      mat: DEAD_DARK_MAT,
      castShadow: true,
    },
    {
      geo: bake(() => new THREE.CylinderGeometry(0.018, 0.028, 0.3, 5), [0.06, 1.0, 0.13], [0.4, 0, 0.2]),
      mat: DEAD_MAT,
      castShadow: true,
    },
    {
      geo: bake(() => new THREE.CylinderGeometry(0.016, 0.024, 0.26, 5), [-0.08, 1.05, -0.1], [-0.3, 0, -0.4]),
      mat: DEAD_MAT,
      castShadow: true,
    },
  ],
  rock: [{ geo: bake(() => new THREE.IcosahedronGeometry(0.18, 0), [0, 0.05, 0]), mat: ROCK_MAT, castShadow: true }],
  boulder: [
    { geo: bake(() => new THREE.IcosahedronGeometry(0.55, 0), [0, 0.28, 0]), mat: BOULDER_MAT, castShadow: true },
    { geo: bake(() => new THREE.IcosahedronGeometry(0.22, 0), [0.38, 0.12, 0.12]), mat: BOULDER_DARK_MAT, castShadow: true },
    { geo: bake(() => new THREE.IcosahedronGeometry(0.16, 0), [-0.05, 0.62, 0.1]), mat: MOSS_MAT, castShadow: true },
  ],
  'bush-0': bushParts(BUSH_MATS[0]),
  'bush-1': bushParts(BUSH_MATS[1]),
  'bush-2': bushParts(BUSH_MATS[2]),
  'mushroom-0': mushroomRedParts(),
  'mushroom-1': mushroomBrownParts(),
  'flower-0': flowerParts(FLOWER_PETAL_MATS[0]),
  'flower-1': flowerParts(FLOWER_PETAL_MATS[1]),
  'flower-2': flowerParts(FLOWER_PETAL_MATS[2]),
  'flower-3': flowerParts(FLOWER_PETAL_MATS[3]),
  // Bladier grass tuft: 5 thin leaning blades, all rooted near y≈0 (cone center
  // = height/2 above base), tint:true for per-instance color variation (2026-06-05).
  tuft: [
    { geo: bake(() => new THREE.ConeGeometry(0.025, 0.26, 4), [0, 0.13, 0]), mat: TUFT_MAT, tint: true },
    { geo: bake(() => new THREE.ConeGeometry(0.022, 0.22, 4), [0.06, 0.11, 0.02], [0, 0.5, 0.22]), mat: TUFT_MAT, tint: true },
    { geo: bake(() => new THREE.ConeGeometry(0.022, 0.2, 4), [-0.06, 0.1, -0.03], [0, -0.4, -0.2]), mat: TUFT_MAT, tint: true },
    { geo: bake(() => new THREE.ConeGeometry(0.02, 0.18, 4), [0.03, 0.09, -0.06], [0.25, 0, 0.15]), mat: TUFT_MAT, tint: true },
    { geo: bake(() => new THREE.ConeGeometry(0.02, 0.17, 4), [-0.04, 0.085, 0.05], [-0.2, 0, -0.18]), mat: TUFT_MAT, tint: true },
  ],
  cactus: [
    // Main column
    { geo: bake(() => new THREE.CylinderGeometry(0.13, 0.15, 0.7, 7), [0, 0.35, 0]), mat: CACTUS_MAT, castShadow: true },
    // Top cap
    { geo: bake(() => new THREE.SphereGeometry(0.13, 8, 6), [0, 0.7, 0]), mat: CACTUS_DARK_MAT, castShadow: true },
    // Right arm (horizontal segment + vertical extension)
    { geo: bake(() => new THREE.CylinderGeometry(0.07, 0.08, 0.22, 6), [0.18, 0.4, 0], [0, 0, Math.PI / 2]), mat: CACTUS_MAT, castShadow: true },
    { geo: bake(() => new THREE.CylinderGeometry(0.07, 0.08, 0.24, 6), [0.29, 0.52, 0]), mat: CACTUS_MAT, castShadow: true },
    { geo: bake(() => new THREE.SphereGeometry(0.07, 6, 5), [0.29, 0.64, 0]), mat: CACTUS_DARK_MAT, castShadow: true },
    // Left arm (lower)
    { geo: bake(() => new THREE.CylinderGeometry(0.06, 0.07, 0.2, 6), [-0.17, 0.28, 0], [0, 0, Math.PI / 2]), mat: CACTUS_MAT, castShadow: true },
    { geo: bake(() => new THREE.CylinderGeometry(0.06, 0.07, 0.2, 6), [-0.27, 0.38, 0]), mat: CACTUS_MAT, castShadow: true },
    { geo: bake(() => new THREE.SphereGeometry(0.06, 6, 5), [-0.27, 0.48, 0]), mat: CACTUS_DARK_MAT, castShadow: true },
  ],
  // Ice shard — a cluster of angular crystal spires jutting from a frosted base.
  // Tall pointed cones (low radial segs → faceted), so it reads icy and sharp.
  iceShard: [
    // Frosted base dusting at ground level (snow tone, no shadow — flat on ground).
    { geo: bake(() => new THREE.IcosahedronGeometry(0.16, 0), [0, 0.02, 0]), mat: ICE_DARK_MAT },
    // Main spire.
    { geo: bake(() => new THREE.ConeGeometry(0.1, 0.5, 4), [0, 0.27, 0]), mat: ICE_MAT, castShadow: true },
    // Two leaning side spires.
    { geo: bake(() => new THREE.ConeGeometry(0.07, 0.34, 4), [0.13, 0.18, 0.05], [0, 0.6, 0.35]), mat: ICE_MAT, castShadow: true },
    { geo: bake(() => new THREE.ConeGeometry(0.06, 0.26, 4), [-0.12, 0.14, -0.04], [0, -0.4, -0.3]), mat: ICE_MAT, castShadow: true },
  ],
  // Bones — a sun-bleached skull + a small fan of ribs half-buried in sand.
  // Lies flat (low profile), so it casts a soft shadow but blocks nothing.
  bones: [
    // Skull dome.
    { geo: bake(() => new THREE.SphereGeometry(0.1, 7, 5, 0, Math.PI * 2, 0, Math.PI / 1.6), [-0.12, 0.07, 0]), mat: BONE_MAT, castShadow: true },
    // Snout / jaw block.
    { geo: bake(() => new THREE.BoxGeometry(0.1, 0.06, 0.08), [-0.02, 0.05, 0]), mat: BONE_SHADOW_MAT, castShadow: true },
    // Eye sockets.
    { geo: bake(() => new THREE.SphereGeometry(0.022, 5, 4), [-0.13, 0.09, 0.05]), mat: BONE_SHADOW_MAT },
    { geo: bake(() => new THREE.SphereGeometry(0.022, 5, 4), [-0.13, 0.09, -0.05]), mat: BONE_SHADOW_MAT },
    // Rib arcs fanning out from the skull (thin half-buried cylinders).
    { geo: bake(() => new THREE.CylinderGeometry(0.012, 0.012, 0.22, 5), [0.1, 0.03, 0.08], [0.5, 0, Math.PI / 2]), mat: BONE_MAT, castShadow: true },
    { geo: bake(() => new THREE.CylinderGeometry(0.012, 0.012, 0.24, 5), [0.16, 0.03, 0], [0, 0, Math.PI / 2]), mat: BONE_MAT, castShadow: true },
    { geo: bake(() => new THREE.CylinderGeometry(0.012, 0.012, 0.22, 5), [0.1, 0.03, -0.08], [-0.5, 0, Math.PI / 2]), mat: BONE_MAT, castShadow: true },
  ],
  // Reeds — a clump of tall thin marsh blades with a couple of brown cattail
  // heads. Flimsy low growth: walk-through, casts a light shadow.
  reeds: [
    { geo: bake(() => new THREE.CylinderGeometry(0.012, 0.02, 0.6, 4), [0, 0.3, 0], [0.08, 0, 0.05]), mat: REED_MAT, castShadow: true },
    { geo: bake(() => new THREE.CylinderGeometry(0.012, 0.02, 0.52, 4), [0.07, 0.26, 0.04], [0.05, 0, -0.18]), mat: REED_DARK_MAT, castShadow: true },
    { geo: bake(() => new THREE.CylinderGeometry(0.012, 0.02, 0.46, 4), [-0.06, 0.23, -0.03], [-0.1, 0, 0.2]), mat: REED_MAT, castShadow: true },
    { geo: bake(() => new THREE.CylinderGeometry(0.01, 0.016, 0.4, 4), [0.04, 0.2, -0.06], [0.15, 0, 0.12]), mat: REED_DARK_MAT, castShadow: true },
    // Cattail heads.
    { geo: bake(() => new THREE.CylinderGeometry(0.028, 0.028, 0.1, 6), [0.01, 0.58, 0.02]), mat: CATTAIL_MAT, castShadow: true },
    { geo: bake(() => new THREE.CylinderGeometry(0.024, 0.024, 0.08, 6), [0.09, 0.5, 0.05]), mat: CATTAIL_MAT, castShadow: true },
  ],
}

// Coalesce a kind's parts: every part sharing the same material AND shadow flag
// can be welded into a single geometry, so the kind draws in one InstancedMesh
// per (material, castShadow) bucket instead of one per part. Pixels are
// identical — same material, same shadow casting — only the draw count drops.
// e.g. tuft (3 cones, one mat) 3→1; cactus (5 body + 3 cap) 8→2; tree 4→4
// (four distinct mats, already minimal).
const mergedPartCache = new Map<string, Part[]>()
function mergedParts(key: string): Part[] {
  const cached = mergedPartCache.get(key)
  if (cached) return cached
  const raw = PARTS[key]
  const buckets = new Map<string, { geos: THREE.BufferGeometry[]; mat: THREE.Material; castShadow: boolean; tint: boolean }>()
  // Preserve first-seen order so any draw ordering stays stable.
  const order: string[] = []
  for (const part of raw) {
    const cast = part.castShadow ?? false
    const tint = part.tint ?? false
    // Bucket by material identity (module singletons) + shadow flag + tint flag.
    // Tinted parts must stay separate so per-instance color can be set independently.
    const matId = (part.mat as THREE.Material).uuid
    const bk = `${matId}|${cast ? 1 : 0}|${tint ? 1 : 0}`
    let b = buckets.get(bk)
    if (!b) {
      b = { geos: [], mat: part.mat, castShadow: cast, tint }
      buckets.set(bk, b)
      order.push(bk)
    }
    b.geos.push(part.geo)
  }
  const out: Part[] = order.map((bk) => {
    const b = buckets.get(bk)!
    const geo = b.geos.length === 1 ? b.geos[0] : (mergeGeometries(b.geos, false) as THREE.BufferGeometry)
    return { geo, mat: b.mat, castShadow: b.castShadow, tint: b.tint }
  })
  mergedPartCache.set(key, out)
  return out
}

function obstacleSubKind(o: Obstacle): string {
  if (o.kind === 'bush') return `bush-${o.variant % 3}`
  if (o.kind === 'mushroom') return `mushroom-${o.variant % 2}`
  if (o.kind === 'flower') return `flower-${o.variant % 4}`
  return o.kind
}

function InstancedPart({ part, obstacles }: { part: Part; obstacles: Obstacle[] }) {
  const ref = useRef<THREE.InstancedMesh>(null!)

  useEffect(() => {
    const m = ref.current
    if (!m) return
    const dummy = new THREE.Object3D()
    obstacles.forEach((o, i) => {
      dummy.position.set(o.x, o.y, o.z)
      dummy.rotation.set(0, o.rot, 0)
      dummy.scale.setScalar(o.scale)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()

    if (part.tint) {
      const col = new THREE.Color()
      const base = (part.mat as THREE.MeshStandardMaterial).color
      obstacles.forEach((o, i) => {
        // deterministic hash from position (no Math.random — world is deterministic)
        const h = Math.abs(Math.sin((o.x * 12.9898 + o.z * 78.233) * 43758.5453))
        const hh = h - Math.floor(h)
        // ±value + slight warm/cool green shift, multiplied onto the base foliage color
        const v = 0.86 + hh * 0.28 // 0.86..1.14 brightness
        col.copy(base).multiplyScalar(v)
        col.offsetHSL((hh - 0.5) * 0.04, (hh - 0.5) * 0.10, 0) // tiny hue/sat drift
        m.setColorAt(i, col)
      })
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  }, [obstacles, part.tint, part.mat])

  return (
    <instancedMesh
      ref={ref}
      args={[part.geo, part.mat, obstacles.length]}
      castShadow={part.castShadow ?? false}
      receiveShadow
    />
  )
}

// Advances the shared wind clock once per frame. Frozen behind any modal so the
// world (foliage included) holds still, matching every other useFrame.
function WindDriver() {
  useFrame(({ clock }) => {
    if (isFrozen()) return
    windTime.value = clock.getElapsedTime()
  })
  return null
}

export function Scatter() {
  const groups = useMemo(() => {
    const obstacles = getObstacles()
    const map = new Map<string, Obstacle[]>()
    for (const o of obstacles) {
      const key = obstacleSubKind(o)
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(o)
    }
    return map
  }, [])

  return (
    <group>
      <WindDriver />
      {Array.from(groups.entries()).flatMap(([key, list]) => {
        if (!PARTS[key]) return []
        const parts = mergedParts(key)
        return parts.map((part, i) => (
          <InstancedPart key={`${key}-${i}`} part={part} obstacles={list} />
        ))
      })}
    </group>
  )
}
