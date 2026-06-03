import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { slotGroundY, isInsideCastle } from './cityPlan'
import { getCity, subscribeCity } from './cityStore'
import { getPlayer, healPlayer, isPlayerAlive } from './playerStore'
import { isFrozen } from './pauseStore'
import { isCulled } from './cull'

// Healing Shrine (Defense structure): gated on cityStore.shrineBuilt. While the
// living hero stands inside the city walls, the shrine slowly regenerates their
// HP. healPlayer notifies the HUD, so — like castleStore.repairCastle — we heal
// in whole-HP steps on an accumulator rather than fractions every frame, to
// avoid per-frame HUD churn. A glowing crystal, NO point light (emissive only).

// Interior slot east of the keep, clear of the keep footprint + house rows.
const SLOT = { x: 76, z: 50 } as const
const HEAL_PER_SEC = 4 // HP/sec while inside the walls

// Self-illuminated crystal — toneMapped:false keeps it bright without a light.
const CRYSTAL = new THREE.MeshStandardMaterial({
  color: '#9fe8d2',
  emissive: '#37c9a6',
  emissiveIntensity: 1.4,
  roughness: 0.2,
  metalness: 0.1,
  toneMapped: false,
})
const BASE = new THREE.MeshStandardMaterial({ color: '#cfd6dd', roughness: 0.7, flatShading: true })
const BASE_DARK = new THREE.MeshStandardMaterial({ color: '#9aa3ad', roughness: 0.8, flatShading: true })

export function HealingShrine() {
  const [built, setBuilt] = useState(() => getCity().shrineBuilt)
  useEffect(() => subscribeCity((s) => setBuilt(s.shrineBuilt)), [])

  const crystalRef = useRef<THREE.Mesh>(null!)
  const healAcc = useRef(0) // fractional HP banked between whole-HP heals
  const groundY = slotGroundY(SLOT.x, SLOT.z)

  useFrame(({ clock }, dt) => {
    if (isFrozen() || !built) return
    // Far from the shrine the hero is outside the walls anyway (no heal), so skip
    // the cosmetic crystal trig + the in-castle check entirely when culled.
    if (isCulled(SLOT.x, SLOT.z)) return
    const now = clock.getElapsedTime()

    // Gentle hover + spin on the crystal (cosmetic, cheap).
    if (crystalRef.current) {
      crystalRef.current.rotation.y = now * 0.6
      crystalRef.current.position.y = 1.35 + Math.sin(now * 1.6) * 0.06
    }

    if (!isPlayerAlive()) return
    const p = getPlayer()
    if (!isInsideCastle(p.x, p.z)) {
      healAcc.current = 0
      return
    }
    if (p.hp >= p.maxHp) {
      healAcc.current = 0
      return
    }
    // Bank fractional HP; flush whole points to keep notify churn off the frame.
    healAcc.current += HEAL_PER_SEC * dt
    if (healAcc.current >= 1) {
      const whole = Math.floor(healAcc.current)
      healAcc.current -= whole
      healPlayer(whole)
    }
  })

  if (!built) return null
  return (
    <group position={[SLOT.x, groundY, SLOT.z]}>
      {/* Stepped stone plinth */}
      <mesh position={[0, 0.12, 0]} castShadow receiveShadow material={BASE_DARK}>
        <cylinderGeometry args={[0.7, 0.8, 0.24, 8]} />
      </mesh>
      <mesh position={[0, 0.38, 0]} castShadow material={BASE}>
        <cylinderGeometry args={[0.42, 0.55, 0.3, 8]} />
      </mesh>
      {/* Pedestal column */}
      <mesh position={[0, 0.85, 0]} castShadow material={BASE}>
        <cylinderGeometry args={[0.18, 0.24, 0.7, 8]} />
      </mesh>
      {/* Floating healing crystal (emissive — no light) */}
      <mesh ref={crystalRef} position={[0, 1.35, 0]} castShadow material={CRYSTAL}>
        <octahedronGeometry args={[0.32, 0]} />
      </mesh>
    </group>
  )
}
