import { useMemo } from 'react'
import * as THREE from 'three'

// Swamp-biome landmark: a huge gnarled leafless tree — thick twisted trunk,
// heavy bare branches reaching out, exposed roots flaring at the base, and a few
// strands of hanging moss. ~9 units tall, a clear focal point over the bog.
//
// Hand-built mesh tree (project convention — no GLTF). Authored around the local
// origin with its base on y=0; the parent supplies grid-coord placement and
// facing. No lights, no interaction.

const BARK = '#4a3b2c'
const BARK_DARK = '#33281d'
const ROOT = '#3e3122'
const MOSS = '#5d6b35'

// A tapered limb segment along +Y, built so its base sits at the local origin.
function limbGeo(len: number, rBot: number, rTop: number, seg = 6): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, seg)
  g.translate(0, len / 2, 0)
  return g
}

// Trunk: three stacked tapered segments, each leaning a bit more for a twist.
const TRUNK_SEGS = [
  { len: 2.6, rBot: 0.95, rTop: 0.78, tilt: [0.0, 0.0, 0.04] as const },
  { len: 2.4, rBot: 0.78, rTop: 0.58, tilt: [0.06, 0.4, -0.08] as const },
  { len: 2.2, rBot: 0.58, rTop: 0.34, tilt: [-0.04, 0.2, 0.12] as const },
]

interface Branch {
  // attach height on the (straightened) trunk, yaw around trunk, outward pitch
  y: number
  yaw: number
  pitch: number
  len: number
  rBot: number
  rTop: number
}
const BRANCHES: Branch[] = [
  { y: 4.6, yaw: 0.3, pitch: 0.9, len: 2.8, rBot: 0.32, rTop: 0.12 },
  { y: 5.2, yaw: 2.4, pitch: 1.0, len: 2.4, rBot: 0.28, rTop: 0.1 },
  { y: 5.6, yaw: 4.2, pitch: 0.8, len: 2.6, rBot: 0.26, rTop: 0.1 },
  { y: 6.2, yaw: 1.2, pitch: 1.1, len: 1.8, rBot: 0.2, rTop: 0.08 },
  { y: 6.0, yaw: 5.3, pitch: 1.0, len: 2.0, rBot: 0.22, rTop: 0.08 },
]

interface Root {
  yaw: number
  len: number
  r: number
}
const ROOTS: Root[] = [
  { yaw: 0.4, len: 1.6, r: 0.3 },
  { yaw: 1.7, len: 1.4, r: 0.26 },
  { yaw: 3.0, len: 1.7, r: 0.32 },
  { yaw: 4.3, len: 1.3, r: 0.24 },
  { yaw: 5.5, len: 1.5, r: 0.28 },
]

// Hanging moss strands dangling off branch tips: thin vertical boxes.
interface Moss {
  x: number
  y: number
  z: number
  h: number
}
const MOSS_STRANDS: Moss[] = [
  { x: 1.8, y: 4.4, z: 0.6, h: 1.2 },
  { x: -1.6, y: 4.8, z: -0.8, h: 1.5 },
  { x: 0.4, y: 5.0, z: 1.7, h: 1.0 },
  { x: -1.2, y: 5.2, z: 1.0, h: 0.9 },
]

export function GiantDeadTree({
  position = [0, 0, 0],
  rotation = 0,
}: {
  position?: [number, number, number]
  rotation?: number
}) {
  const barkMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: BARK, roughness: 1, flatShading: true }),
    [],
  )
  const barkDarkMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: BARK_DARK, roughness: 1, flatShading: true }),
    [],
  )
  const rootMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: ROOT, roughness: 1, flatShading: true }),
    [],
  )
  const mossMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: MOSS, roughness: 1, flatShading: true }),
    [],
  )

  // Geometries (memoized so all instances of this single landmark share them
  // within a render; they're cheap tapered cylinders).
  const trunkGeos = useMemo(() => TRUNK_SEGS.map((s) => limbGeo(s.len, s.rBot, s.rTop)), [])
  const branchGeos = useMemo(() => BRANCHES.map((b) => limbGeo(b.len, b.rBot, b.rTop, 5)), [])
  const rootGeos = useMemo(() => ROOTS.map((r) => limbGeo(r.len, r.r, r.r * 0.4, 5)), [])

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Exposed roots flaring out from the base, splayed nearly flat so their
          tips only dip just under the surface (a shallow, believable bury). */}
      {ROOTS.map((r, i) => (
        <group key={`root-${i}`} rotation={[0, r.yaw, 0]}>
          <group position={[0, 0.42, 0]} rotation={[Math.PI * 0.53, 0, 0]}>
            <mesh geometry={rootGeos[i]} material={rootMat} castShadow receiveShadow />
          </group>
        </group>
      ))}

      {/* Root collar / stump base */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow material={barkDarkMat}>
        <cylinderGeometry args={[0.95, 1.25, 0.6, 8]} />
      </mesh>

      {/* Twisted trunk — segments stacked, each leaning from the prior tip.
          We build them along a nested-group chain so the lean accumulates. */}
      <group position={[0, 0.55, 0]} rotation={TRUNK_SEGS[0].tilt}>
        <mesh geometry={trunkGeos[0]} material={barkMat} castShadow receiveShadow />
        <group position={[0, TRUNK_SEGS[0].len, 0]} rotation={TRUNK_SEGS[1].tilt}>
          <mesh geometry={trunkGeos[1]} material={barkMat} castShadow receiveShadow />
          <group position={[0, TRUNK_SEGS[1].len, 0]} rotation={TRUNK_SEGS[2].tilt}>
            <mesh geometry={trunkGeos[2]} material={barkMat} castShadow receiveShadow />
          </group>
        </group>
      </group>

      {/* Heavy bare branches — placed in the straightened trunk frame (the visual
          lean of the trunk is mild, so attaching by height reads fine and keeps
          them near the trunk for the inspector). */}
      {BRANCHES.map((b, i) => (
        <group key={`br-${i}`} position={[0, b.y, 0]} rotation={[0, b.yaw, 0]}>
          <group rotation={[0, 0, -b.pitch]}>
            <mesh geometry={branchGeos[i]} material={barkMat} castShadow receiveShadow />
            {/* a short forked twig off each branch tip */}
            <group position={[0, b.len, 0]} rotation={[0, 0, 0.7]}>
              <mesh geometry={limbGeo(b.len * 0.5, b.rTop, b.rTop * 0.4, 5)} material={barkMat} castShadow />
            </group>
          </group>
        </group>
      ))}

      {/* Hanging moss strands */}
      {MOSS_STRANDS.map((m, i) => (
        <mesh key={`moss-${i}`} position={[m.x, m.y - m.h / 2, m.z]} material={mossMat}>
          <boxGeometry args={[0.06, m.h, 0.06]} />
        </mesh>
      ))}
    </group>
  )
}
