import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { isPaused } from './pauseStore'
import { woodTexture } from './textures'
import { tileAt, CENTER_X, CENTER_Z } from './tileMap'

// A small sailing ship — hull, deck, stern cabin, mast + billowing sail. Built
// around the local origin with the hull bottom on y=0 (the waterline), so the
// `Ships` placer can just drop it on the sea. Inspectable via model-smith.

function texMat(map: THREE.Texture | null, fallback: string, roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: map ? '#ffffff' : fallback,
    map: map ?? undefined,
    roughness,
    flatShading: !map,
  })
}

const HULL = texMat(woodTexture('#5a3a22', 2, 5), '#5a3a22', 0.9)
const DECK = texMat(woodTexture('#8a5a34', 2, 6), '#8a5a34', 0.95)
const MAST = new THREE.MeshStandardMaterial({ color: '#6b4626', roughness: 1 })
const SAIL = new THREE.MeshStandardMaterial({ color: '#e9e2cc', roughness: 0.9, side: THREE.DoubleSide })
const FLAG = new THREE.MeshStandardMaterial({ color: '#b23a34', roughness: 0.8, side: THREE.DoubleSide })

export function Boat() {
  return (
    <group>
      {/* Hull */}
      <mesh position={[0, 0.28, 0]} castShadow receiveShadow material={HULL}>
        <boxGeometry args={[1.3, 0.56, 2.8]} />
      </mesh>
      {/* Bow wedge (pointed front, +Z) */}
      <mesh position={[0, 0.28, 1.5]} rotation={[0, Math.PI / 4, 0]} castShadow material={HULL}>
        <boxGeometry args={[0.92, 0.56, 0.92]} />
      </mesh>
      {/* Gunwale rim */}
      <mesh position={[0, 0.57, 0]} castShadow material={DECK}>
        <boxGeometry args={[1.36, 0.1, 2.86]} />
      </mesh>
      {/* Inner deck */}
      <mesh position={[0, 0.55, 0]} material={DECK}>
        <boxGeometry args={[1.0, 0.06, 2.5]} />
      </mesh>
      {/* Stern cabin */}
      <mesh position={[0, 0.82, -0.95]} castShadow material={DECK}>
        <boxGeometry args={[0.92, 0.5, 0.7]} />
      </mesh>
      {/* Mast */}
      <mesh position={[0, 1.55, 0.2]} castShadow material={MAST}>
        <cylinderGeometry args={[0.05, 0.06, 2.0, 6]} />
      </mesh>
      {/* Yard (cross beam) */}
      <mesh position={[0, 2.1, 0.2]} material={MAST}>
        <boxGeometry args={[1.2, 0.06, 0.06]} />
      </mesh>
      {/* Sail */}
      <mesh position={[0, 1.5, 0.24]} castShadow material={SAIL}>
        <boxGeometry args={[1.1, 1.25, 0.04]} />
      </mesh>
      {/* Pennant flag at the masthead */}
      <mesh position={[0.32, 2.46, 0.2]} material={FLAG}>
        <planeGeometry args={[0.5, 0.2]} />
      </mesh>
    </group>
  )
}

// ─── Ships: a few boats slowly circling the island on the open sea ───────────
// Placed in world space (outside the grid-offset group), like Birds. Orbits
// sit just beyond the coast so the boats stay on water.
interface Orbit {
  rx: number
  rz: number
  speed: number
  phase: number
  seed: number
}
// Orbits sit well outside the island at every angle (the island is a
// superellipse that bulges into the corners, so an ellipse that's only clear on
// the axes still clips the corners). These radii clear it all the way round.
const ORBITS: Orbit[] = [
  { rx: 88, rz: 66, speed: 0.05, phase: 0.0, seed: 0.3 },
  { rx: 95, rz: 72, speed: -0.04, phase: 2.3, seed: 1.7 },
  { rx: 84, rz: 80, speed: 0.045, phase: 4.1, seed: 2.9 },
]

export function Ships() {
  const refs = useRef<(THREE.Group | null)[]>([])

  useFrame(({ clock }) => {
    if (isPaused()) return
    const t = clock.getElapsedTime()
    for (let i = 0; i < ORBITS.length; i++) {
      const g = refs.current[i]
      if (!g) continue
      const o = ORBITS[i]
      const ang = o.phase + t * o.speed
      let x = Math.cos(ang) * o.rx
      let z = Math.sin(ang) * o.rz
      // Safety net: if the orbit ever crosses onto land, push the boat radially
      // outward until it's back over water (tileAt === null ⇒ sea).
      let guard = 0
      while (tileAt(Math.floor(x + CENTER_X), Math.floor(z + CENTER_Z)) !== null && guard++ < 15) {
        x *= 1.08
        z *= 1.08
      }
      // Float on the water surface (raised to y≈0.9). Keeps the old ~0.07
      // freeboard above the waterline so the hull sits in the sea, not under it.
      g.position.set(x, 0.97 + Math.sin(t * 0.8 + o.seed) * 0.08, z)
      // Heading = tangent of the orbit (derivative), so the bow leads the turn.
      const hx = -Math.sin(ang) * o.rx * o.speed
      const hz = Math.cos(ang) * o.rz * o.speed
      g.rotation.y = Math.atan2(hx, hz)
      g.rotation.z = Math.sin(t * 0.9 + o.seed) * 0.05 // roll
      g.rotation.x = Math.sin(t * 0.7 + o.seed * 1.3) * 0.03 // pitch
    }
  })

  return (
    <group>
      {ORBITS.map((_, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
          scale={1.4}
        >
          <Boat />
        </group>
      ))}
    </group>
  )
}
