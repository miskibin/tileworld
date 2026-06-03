import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { slotGroundY } from './cityPlan'
import { getCity, subscribeCity } from './cityStore'
import { spawnBolt } from './projectileStore'
import { getAliveOrks } from './orkStore'
import { isFrozen } from './pauseStore'
import { isCulled } from './cull'

// Ballista (Defense structure): a heavy single-target bolt-thrower planted just
// outside the north gate. Auto-fires a strong, slow bolt at the nearest ork in a
// long range. Mirrors Towers/KeepArchers: gated on cityStore.ballistaBuilt, no
// point light (the bolt itself is the only glow, handled by projectileStore).

// Slot: a couple tiles north of the north gate (x=72, z=45), aimed at the keep.
const SLOT = { x: 72, z: 42.5 } as const
const PROFILE = { range: 24, damage: 45, cooldown: 2.6, maxRange: 28 }
const MUZZLE_Y = 1.3 // bolt origin height above the platform base

// Static materials — shared, flat-shaded heavy timber + steel.
const FRAME = new THREE.MeshStandardMaterial({ color: '#5a3c22', roughness: 1, flatShading: true })
const FRAME_DARK = new THREE.MeshStandardMaterial({ color: '#3f2a17', roughness: 1, flatShading: true })
const STEEL = new THREE.MeshStandardMaterial({ color: '#7e828c', roughness: 0.5, metalness: 0.5, flatShading: true })
const STONE = new THREE.MeshStandardMaterial({ color: '#6e6e76', roughness: 0.95, flatShading: true })
const CORD = new THREE.MeshStandardMaterial({ color: '#d8cfb0', roughness: 0.8 })

export function Ballista() {
  const [built, setBuilt] = useState(() => getCity().ballistaBuilt)
  useEffect(() => subscribeCity((s) => setBuilt(s.ballistaBuilt)), [])

  const readyAt = useRef(0)
  const turretRef = useRef<THREE.Group>(null!)
  const groundY = slotGroundY(SLOT.x, SLOT.z)
  const rangeSq = PROFILE.range * PROFILE.range

  useFrame(({ clock }) => {
    if (isFrozen() || !built) return
    // When the player has roamed far from the castle the turret is fog-culled and
    // unobserved; skip the per-frame getAliveOrks() allocation + scan until they
    // return to defend.
    if (isCulled(SLOT.x, SLOT.z)) return
    const orks = getAliveOrks()
    if (orks.length === 0) return
    const now = clock.getElapsedTime()

    // Nearest alive ork in range — also drives the turret's aim.
    let best = null as (typeof orks)[number] | null
    let bestD = rangeSq
    for (const o of orks) {
      const dx = o.x - SLOT.x
      const dz = o.z - SLOT.z
      const d = dx * dx + dz * dz
      if (d < bestD) {
        bestD = d
        best = o
      }
    }
    if (!best) return

    // Swivel the bow toward the target (yaw only).
    if (turretRef.current) {
      turretRef.current.rotation.y = Math.atan2(best.x - SLOT.x, best.z - SLOT.z)
    }

    if (now < readyAt.current) return
    spawnBolt(SLOT.x, groundY + MUZZLE_Y, SLOT.z, { kind: 'ork', ref: best }, PROFILE.damage, {
      team: 'defender',
      maxRange: PROFILE.maxRange,
      speed: 16,
    })
    readyAt.current = now + PROFILE.cooldown
  })

  if (!built) return null
  return (
    <group position={[SLOT.x, groundY, SLOT.z]}>
      {/* Stone platform */}
      <mesh position={[0, 0.12, 0]} castShadow receiveShadow material={STONE}>
        <boxGeometry args={[1.7, 0.24, 1.7]} />
      </mesh>
      {/* Timber A-frame legs */}
      <mesh position={[-0.5, 0.55, 0.4]} rotation={[0, 0, 0.2]} castShadow material={FRAME_DARK}>
        <boxGeometry args={[0.14, 0.8, 0.14]} />
      </mesh>
      <mesh position={[0.5, 0.55, 0.4]} rotation={[0, 0, -0.2]} castShadow material={FRAME_DARK}>
        <boxGeometry args={[0.14, 0.8, 0.14]} />
      </mesh>
      <mesh position={[0, 0.55, -0.45]} castShadow material={FRAME_DARK}>
        <boxGeometry args={[0.14, 0.8, 0.14]} />
      </mesh>
      {/* Swivelling turret: stock + crossbar bow + nocked bolt */}
      <group ref={turretRef} position={[0, 0.95, 0]}>
        {/* Stock / rail the bolt rides along (+Z front) */}
        <mesh position={[0, 0, 0.15]} castShadow material={FRAME}>
          <boxGeometry args={[0.18, 0.16, 1.5]} />
        </mesh>
        {/* Bow crossbar */}
        <mesh position={[0, 0.05, 0.55]} castShadow material={FRAME}>
          <boxGeometry args={[1.6, 0.12, 0.12]} />
        </mesh>
        {/* Steel tips on each bow arm */}
        <mesh position={[0.8, 0.05, 0.55]} castShadow material={STEEL}>
          <boxGeometry args={[0.14, 0.1, 0.1]} />
        </mesh>
        <mesh position={[-0.8, 0.05, 0.55]} castShadow material={STEEL}>
          <boxGeometry args={[0.14, 0.1, 0.1]} />
        </mesh>
        {/* Drawn cord from each tip back to the stock */}
        <mesh position={[0.4, 0.05, 0.35]} rotation={[0, 0.6, 0]} material={CORD}>
          <boxGeometry args={[0.9, 0.02, 0.02]} />
        </mesh>
        <mesh position={[-0.4, 0.05, 0.35]} rotation={[0, -0.6, 0]} material={CORD}>
          <boxGeometry args={[0.9, 0.02, 0.02]} />
        </mesh>
        {/* Loaded bolt */}
        <mesh position={[0, 0.05, 0.5]} castShadow material={STEEL}>
          <boxGeometry args={[0.05, 0.05, 0.8]} />
        </mesh>
      </group>
    </group>
  )
}
