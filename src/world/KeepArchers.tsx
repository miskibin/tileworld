import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { KEEP_SLOT, slotGroundY } from './cityPlan'
import { getCity, subscribeCity } from './cityStore'
import { spawnBolt } from './projectileStore'
import { getAliveOrks } from './orkStore'
import { isFrozen } from './pauseStore'

// Keep Archers upgrade: four bowmen stationed on the keep roof corners that
// auto-fire defender bolts at the nearest ork in range. Logic mirrors Towers;
// the figures are static low-poly props (cheap — they never move).

const ARCHER = { range: 20, damage: 7, cooldown: 1.3, maxRange: 26 }
// Keep roof deck height, in the keep's *scaled* space (keep block 0.3 + 1.9 tall,
// squashed by the keep group's Y-scale). Archers stand here so they sit on the
// roof rather than floating above it — keep this in sync with the Keep scale.
const KEEP_ROOF_SCALE_Y = 0.7
const ROOF_Y = (0.3 + 1.9) * KEEP_ROOF_SCALE_Y
// Bolt muzzle ≈ bow height above the deck.
const MUZZLE_Y = ROOF_Y + 0.66
// Battlement corners, relative to the keep centre (inside the merlon ring of the
// narrower scaled keep).
const CORNERS = [
  { x: 2.3, z: 1.9 },
  { x: -2.3, z: 1.9 },
  { x: 2.3, z: -1.9 },
  { x: -2.3, z: -1.9 },
]

const TUNIC = new THREE.MeshStandardMaterial({ color: '#3a5f8f', roughness: 0.9, flatShading: true })
const TUNIC_DARK = new THREE.MeshStandardMaterial({ color: '#27405e', roughness: 0.9, flatShading: true })
const SKIN = new THREE.MeshStandardMaterial({ color: '#caa078', roughness: 0.85, flatShading: true })
const LEG = new THREE.MeshStandardMaterial({ color: '#2a2f3a', roughness: 1, flatShading: true })
const BOW = new THREE.MeshStandardMaterial({ color: '#6a4a2a', roughness: 1, flatShading: true })
const STRING = new THREE.MeshStandardMaterial({ color: '#d8d2c0', roughness: 0.8 })
const QUIVER = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 1, flatShading: true })

// Hooded ranger, authored with feet at y=0 (parent group lifts it to the roof).
export function Archer({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, Math.PI, 0]}>
      {/* Legs */}
      <mesh position={[-0.09, 0.19, 0]} castShadow material={LEG}>
        <boxGeometry args={[0.12, 0.38, 0.14]} />
      </mesh>
      <mesh position={[0.09, 0.19, 0]} castShadow material={LEG}>
        <boxGeometry args={[0.12, 0.38, 0.14]} />
      </mesh>
      {/* Torso + belt */}
      <mesh position={[0, 0.62, 0]} castShadow material={TUNIC}>
        <boxGeometry args={[0.36, 0.48, 0.26]} />
      </mesh>
      <mesh position={[0, 0.42, 0]} material={TUNIC_DARK}>
        <boxGeometry args={[0.38, 0.08, 0.28]} />
      </mesh>
      {/* Arms */}
      <mesh position={[-0.24, 0.64, 0.02]} castShadow material={TUNIC}>
        <boxGeometry args={[0.1, 0.36, 0.1]} />
      </mesh>
      <mesh position={[0.2, 0.66, 0.12]} castShadow material={TUNIC}>
        <boxGeometry args={[0.1, 0.12, 0.22]} />
      </mesh>
      {/* Head + hood */}
      <mesh position={[0, 0.96, 0.01]} castShadow material={SKIN}>
        <boxGeometry args={[0.22, 0.22, 0.22]} />
      </mesh>
      <mesh position={[0, 1.0, -0.03]} castShadow material={TUNIC_DARK}>
        <boxGeometry args={[0.27, 0.2, 0.26]} />
      </mesh>
      <mesh position={[0, 1.04, -0.16]} castShadow material={TUNIC_DARK}>
        <boxGeometry args={[0.16, 0.16, 0.1]} />
      </mesh>
      {/* Quiver slung on the back */}
      <mesh position={[-0.06, 0.68, -0.18]} rotation={[0.25, 0, 0.15]} castShadow material={QUIVER}>
        <boxGeometry args={[0.1, 0.36, 0.1]} />
      </mesh>
      {/* Curved bow held to the front-right, with a string and a nocked arrow */}
      <mesh position={[0.28, 0.66, 0.16]} rotation={[0, Math.PI / 2, 0]} material={BOW}>
        <torusGeometry args={[0.3, 0.022, 6, 14, Math.PI * 1.25]} />
      </mesh>
      <mesh position={[0.28, 0.66, 0.0]} material={STRING}>
        <boxGeometry args={[0.012, 0.52, 0.012]} />
      </mesh>
      <mesh position={[0.18, 0.66, 0.32]} material={BOW}>
        <boxGeometry args={[0.018, 0.018, 0.5]} />
      </mesh>
    </group>
  )
}

export function KeepArchers() {
  const [built, setBuilt] = useState(() => getCity().keepArchers)
  useEffect(() => subscribeCity((s) => setBuilt(s.keepArchers)), [])

  const readyAt = useRef<number[]>(CORNERS.map(() => 0))
  const groundY = slotGroundY(KEEP_SLOT.x, KEEP_SLOT.z)
  const rangeSq = ARCHER.range * ARCHER.range

  useFrame(({ clock }) => {
    if (isFrozen() || !built) return
    const orks = getAliveOrks()
    if (orks.length === 0) return
    const now = clock.getElapsedTime()

    for (let i = 0; i < CORNERS.length; i++) {
      if (now < readyAt.current[i]) continue
      const cx = KEEP_SLOT.x + CORNERS[i].x
      const cz = KEEP_SLOT.z + CORNERS[i].z
      let best = null as (typeof orks)[number] | null
      let bestD = rangeSq
      for (const o of orks) {
        const dx = o.x - cx
        const dz = o.z - cz
        const d = dx * dx + dz * dz
        if (d < bestD) {
          bestD = d
          best = o
        }
      }
      if (!best) continue
      spawnBolt(cx, groundY + MUZZLE_Y, cz, { kind: 'ork', ref: best }, ARCHER.damage, {
        team: 'defender',
        maxRange: ARCHER.maxRange,
        speed: 12,
      })
      readyAt.current[i] = now + ARCHER.cooldown
    }
  })

  if (!built) return null
  return (
    <group position={[KEEP_SLOT.x, groundY + ROOF_Y, KEEP_SLOT.z]}>
      {CORNERS.map((c, i) => (
        <Archer key={i} x={c.x} z={c.z} />
      ))}
    </group>
  )
}
