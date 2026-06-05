import { useMemo } from 'react'
import * as THREE from 'three'

// Swamp-biome landmark: a gnarled leafless dead tree — a tapering twisted trunk,
// a handful of bare branches forking upward/outward, and a flared knot of roots
// at the base. ~2.8 units tall, a compact focal point over the bog.
//
// Hand-built mesh tree (project convention — no GLTF). Authored around the local
// origin with its base on y=0; the parent supplies grid-coord placement and
// facing. No lights, no interaction.

const BARK = '#5a4a38' // weathered greyed swamp-brown
const BARK_DARK = '#36291c' // darker accent for the lower trunk + collar
const ROOT = '#2f2418' // near-black wet root wood

// A tapered limb segment along +Y, built so its base sits at the local origin.
function limbGeo(len: number, rBot: number, rTop: number, seg = 6): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, seg)
  g.translate(0, len / 2, 0)
  return g
}

// Trunk: three stacked tapered segments, each leaning a touch more for a slow
// twist. The lean accumulates down a nested-group chain. Total ~2.0 tall before
// the collar, branches push the silhouette up to ~2.8.
const TRUNK_SEGS = [
  { len: 0.85, rBot: 0.34, rTop: 0.27, tilt: [0.0, 0.0, 0.05] as const },
  { len: 0.75, rBot: 0.27, rTop: 0.19, tilt: [0.05, 0.5, -0.1] as const },
  { len: 0.6, rBot: 0.19, rTop: 0.1, tilt: [-0.06, 0.3, 0.13] as const },
]

interface Branch {
  // attach height on the trunk, yaw around trunk, outward pitch from vertical
  y: number
  yaw: number
  pitch: number
  len: number
  rBot: number
  rTop: number
  // optional forked twig: relative angle off the branch tip
  twig?: number
}
const BRANCHES: Branch[] = [
  { y: 1.5, yaw: 0.4, pitch: 0.8, len: 0.95, rBot: 0.13, rTop: 0.05, twig: 0.7 },
  { y: 1.75, yaw: 2.5, pitch: 0.7, len: 0.85, rBot: 0.12, rTop: 0.045, twig: 0.6 },
  { y: 1.95, yaw: 4.4, pitch: 0.9, len: 0.8, rBot: 0.11, rTop: 0.04, twig: 0.8 },
  { y: 2.15, yaw: 1.4, pitch: 0.55, len: 0.65, rBot: 0.09, rTop: 0.035, twig: 0.5 },
  { y: 2.15, yaw: 3.4, pitch: 0.6, len: 0.55, rBot: 0.08, rTop: 0.03 },
]

interface Root {
  yaw: number
  len: number
  r: number
}
const ROOTS: Root[] = [
  { yaw: 0.3, len: 0.6, r: 0.13 },
  { yaw: 1.6, len: 0.52, r: 0.11 },
  { yaw: 2.9, len: 0.64, r: 0.14 },
  { yaw: 4.2, len: 0.5, r: 0.1 },
  { yaw: 5.4, len: 0.58, r: 0.12 },
]

const COLLAR_H = 0.32 // dark root collar the trunk rises out of
const TRUNK_Y0 = COLLAR_H * 0.7 // trunk base nests slightly into the collar

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

  // Geometries (memoized so all instances of this single landmark share them
  // within a render; they're cheap tapered cylinders).
  const trunkGeos = useMemo(() => TRUNK_SEGS.map((s) => limbGeo(s.len, s.rBot, s.rTop)), [])
  const branchGeos = useMemo(() => BRANCHES.map((b) => limbGeo(b.len, b.rBot, b.rTop, 5)), [])
  const twigGeos = useMemo(
    () => BRANCHES.map((b) => limbGeo(b.len * 0.45, b.rTop, b.rTop * 0.4, 5)),
    [],
  )
  const rootGeos = useMemo(() => ROOTS.map((r) => limbGeo(r.len, r.r, r.r * 0.35, 5)), [])

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Flared roots splaying out from the base, tipped nearly flat so their
          ends just dip under the surface for a believable shallow bury. */}
      {ROOTS.map((r, i) => (
        <group key={`root-${i}`} rotation={[0, r.yaw, 0]}>
          <group position={[0, 0.18, 0]} rotation={[Math.PI * 0.54, 0, 0]}>
            <mesh geometry={rootGeos[i]} material={rootMat} castShadow receiveShadow />
          </group>
        </group>
      ))}

      {/* Dark root collar / stump the trunk grows out of. */}
      <mesh position={[0, COLLAR_H / 2, 0]} castShadow receiveShadow material={barkDarkMat}>
        <cylinderGeometry args={[0.34, 0.5, COLLAR_H, 8]} />
      </mesh>

      {/* Twisted trunk — segments stacked, each leaning from the prior tip so
          the lean accumulates into a gentle gnarl. Lowest segment is the darker
          weathered accent; the upper two are lighter greyed bark. */}
      <group position={[0, TRUNK_Y0, 0]} rotation={TRUNK_SEGS[0].tilt}>
        <mesh geometry={trunkGeos[0]} material={barkDarkMat} castShadow receiveShadow />
        <group position={[0, TRUNK_SEGS[0].len, 0]} rotation={TRUNK_SEGS[1].tilt}>
          <mesh geometry={trunkGeos[1]} material={barkMat} castShadow receiveShadow />
          <group position={[0, TRUNK_SEGS[1].len, 0]} rotation={TRUNK_SEGS[2].tilt}>
            <mesh geometry={trunkGeos[2]} material={barkMat} castShadow receiveShadow />
          </group>
        </group>
      </group>

      {/* Bare branches forking off the trunk. Placed by attach height in the
          straightened trunk frame — the trunk's visual lean is mild, so they
          read as attached and stay hugging the trunk. Each (except the top
          stub) sprouts a short forked twig at its tip. */}
      {BRANCHES.map((b, i) => (
        <group key={`br-${i}`} position={[0, b.y, 0]} rotation={[0, b.yaw, 0]}>
          <group rotation={[0, 0, -b.pitch]}>
            <mesh geometry={branchGeos[i]} material={barkMat} castShadow receiveShadow />
            {b.twig !== undefined && (
              <group position={[0, b.len, 0]} rotation={[0, 0, b.twig]}>
                <mesh geometry={twigGeos[i]} material={barkMat} castShadow />
              </group>
            )}
          </group>
        </group>
      ))}
    </group>
  )
}
