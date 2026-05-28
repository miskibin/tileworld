import { useMemo } from 'react'
import * as THREE from 'three'
import { tileAt } from './tileMap'

/**
 * Hand-routed dirt paths connecting the player spawn to the villages,
 * shop, and ork-camp approaches. Rendered as a series of slim quads sitting
 * just above the terrain.
 */

const PATH_WIDTH = 0.85
const PATH_COLOR = '#8a6d44'
const Y_OFFSET = 0.04
const SEGMENT_PADDING = 0.15

const PATH_MAT = new THREE.MeshStandardMaterial({
  color: PATH_COLOR,
  roughness: 1,
  flatShading: true,
})
const PATH_GEO = new THREE.PlaneGeometry(1, 1)

/** Each path is a polyline of grid-space (x, z) waypoints. */
const PATHS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  // Spawn → eastern village (and shop)
  [[48, 36], [50, 38], [52, 41], [56, 43], [58, 44]],
  // Eastern village → shop spur
  [[55, 43], [54, 42.5], [52, 42]],
  // Spawn → western village
  [[48, 36], [44, 35], [40, 33], [36, 31], [30, 30], [26, 30]],
  // Spawn → N-S river bridge at z≈30
  [[48, 36], [46, 33], [44, 31], [42, 30.5]],
  // Spawn → N-S river bridge at z≈50
  [[48, 36], [46, 40], [44, 44], [42, 50.5]],
  // Eastern village → E-W river bridge at x=64
  [[58, 44], [60, 38], [62, 30], [64, 22]],
]

function tileHeightAt(x: number, z: number): number {
  const t = tileAt(Math.floor(x), Math.floor(z))
  return t ? t.height : 1
}

interface Segment {
  cx: number
  cz: number
  cy: number
  length: number
  angle: number
}

function buildSegments(): Segment[] {
  const out: Segment[] = []
  for (const path of PATHS) {
    for (let i = 0; i < path.length - 1; i++) {
      const [ax, az] = path[i]
      const [bx, bz] = path[i + 1]
      const dx = bx - ax
      const dz = bz - az
      const length = Math.hypot(dx, dz) + SEGMENT_PADDING
      if (length < 0.001) continue
      const cx = (ax + bx) / 2
      const cz = (az + bz) / 2
      const angle = Math.atan2(dz, dx)
      // Use tile height at the segment midpoint so the path sits on the
      // ground over uneven biomes (rock, snow plateaus).
      const cy = tileHeightAt(cx, cz) + Y_OFFSET
      out.push({ cx, cz, cy, length, angle })
    }
  }
  return out
}

export function Paths() {
  const segments = useMemo(() => buildSegments(), [])

  return (
    <group>
      {segments.map((s, i) => (
        <mesh
          key={i}
          position={[s.cx, s.cy, s.cz]}
          rotation={[-Math.PI / 2, 0, -s.angle]}
          scale={[s.length, PATH_WIDTH, 1]}
          receiveShadow
          material={PATH_MAT}
          geometry={PATH_GEO}
        />
      ))}
    </group>
  )
}
