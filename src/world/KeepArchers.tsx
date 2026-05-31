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
// Roof-top offset above the keep's ground tile (keep block ≈ 0.3 + 1.9 tall).
const ROOF_Y = 2.2
const MUZZLE_Y = ROOF_Y + 1.1
// Battlement corners, relative to the keep centre (inside the merlon ring).
const CORNERS = [
  { x: 2.6, z: 2.0 },
  { x: -2.6, z: 2.0 },
  { x: 2.6, z: -2.0 },
  { x: -2.6, z: -2.0 },
]

const TUNIC = new THREE.MeshStandardMaterial({ color: '#3a5f8f', roughness: 0.9, flatShading: true })
const SKIN = new THREE.MeshStandardMaterial({ color: '#caa078', roughness: 0.85, flatShading: true })
const BOW = new THREE.MeshStandardMaterial({ color: '#6a4a2a', roughness: 1 })

function Archer({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, ROOF_Y, z]}>
      <mesh position={[0, 0.35, 0]} castShadow material={TUNIC}>
        <boxGeometry args={[0.32, 0.5, 0.26]} />
      </mesh>
      <mesh position={[0, 0.72, 0]} castShadow material={SKIN}>
        <boxGeometry args={[0.24, 0.24, 0.24]} />
      </mesh>
      {/* Bow stave held to one side */}
      <mesh position={[0.22, 0.45, 0.05]} rotation={[0, 0, 0.15]} material={BOW}>
        <boxGeometry args={[0.05, 0.7, 0.05]} />
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
    <group position={[KEEP_SLOT.x, groundY, KEEP_SLOT.z]}>
      {CORNERS.map((c, i) => (
        <Archer key={i} x={c.x} z={c.z} />
      ))}
    </group>
  )
}
