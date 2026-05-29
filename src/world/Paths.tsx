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

/** Each path is a polyline of grid-space (x, z) waypoints. Roads branch from
 *  the castle gates out to the biome regions, crossing rivers at the bridges. */
const PATHS: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  // South gate → southern crossroads
  [[56, 43], [56, 47], [54, 50], [52, 53]],
  // Southern crossroads → SW swamp (via z≈50 bridge)
  [[52, 53], [46, 52], [42, 50.5], [34, 52], [24, 55], [18, 57]],
  // Southern crossroads → SE pine wood
  [[52, 53], [60, 54], [68, 55], [76, 57]],
  // North wall → northern crossroads
  [[56, 23], [56, 18], [54, 15], [52, 12]],
  // Northern crossroads → NW snow
  [[52, 12], [44, 12], [34, 12], [26, 13], [20, 14]],
  // Northern crossroads → NE desert (via E-W river bridge at x≈64)
  [[52, 12], [60, 13], [64, 16], [70, 14], [76, 15]],
  // West wall → W forest (via z≈30 bridge over the N-S river)
  [[43, 33], [43, 30], [38, 30.5], [31, 31], [22, 35], [16, 38]],
  // East wall → E stone highlands
  [[69, 33], [74, 35], [80, 37]],
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
