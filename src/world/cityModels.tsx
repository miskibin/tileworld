import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { isPaused } from './pauseStore'
import { getPlayer } from './playerStore'
import { openTree, closeTree, isTreeOpen } from './townHallStore'
import { KEEP_INTERACT, INTERACT_DIST, CITY_WALL_HEIGHT } from './cityPlan'

// Shared procedural materials (flat-shaded, matching House.tsx / Shop.tsx).
const STONE = new THREE.MeshStandardMaterial({ color: '#7d7e86', roughness: 0.95, flatShading: true })
const DARK_STONE = new THREE.MeshStandardMaterial({ color: '#5c5d64', roughness: 0.95, flatShading: true })
const LIGHT_STONE = new THREE.MeshStandardMaterial({ color: '#969aa4', roughness: 0.95, flatShading: true })
const BEAM = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 1, flatShading: true })
const ROOF = new THREE.MeshStandardMaterial({ color: '#7a2f28', roughness: 0.85, flatShading: true })
const BANNER = new THREE.MeshStandardMaterial({ color: '#2f5fa6', roughness: 0.8, side: THREE.DoubleSide })
const WOOD = new THREE.MeshStandardMaterial({ color: '#3a2618', roughness: 1 })
const SOIL = new THREE.MeshStandardMaterial({ color: '#6b4a2a', roughness: 1, flatShading: true })
const CROP = new THREE.MeshStandardMaterial({ color: '#8fae4a', roughness: 0.9, flatShading: true })
const GOLD = new THREE.MeshStandardMaterial({
  color: '#e0b04a',
  emissive: '#5a3a18',
  emissiveIntensity: 0.4,
  roughness: 0.6,
  metalness: 0.6,
  toneMapped: false,
})

// ---------------------------------------------------------------------------
// Keep — the castle's central, multi-tile stronghold. It exists from the start
// and is the player's interactable: press E within range to open the upgrade
// tree (mirrors Shop.tsx's interaction pattern).
// ---------------------------------------------------------------------------
const KEEP_W = 7
const KEEP_H = 4.2
const KEEP_D = 6
const KEEP_FOUND = 0.35

interface KeepProps {
  position: [number, number, number]
  rotation?: number
}

export function Keep({ position, rotation = 0 }: KeepProps) {
  const promptRef = useRef<THREE.Group>(null!)
  const inRangeRef = useRef(false)

  useFrame(() => {
    if (isPaused()) return
    const p = getPlayer()
    const dx = p.x - KEEP_INTERACT.x
    const dz = p.z - KEEP_INTERACT.z
    const inRange = Math.hypot(dx, dz) < INTERACT_DIST
    inRangeRef.current = inRange
    if (promptRef.current) promptRef.current.visible = inRange && !isTreeOpen()
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE') return
      if (isTreeOpen()) {
        closeTree()
        return
      }
      if (!inRangeRef.current) return
      openTree()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Crenellation merlons around the keep roof.
  const merlons = useMemo(() => {
    const out: [number, number][] = []
    const stepX = 1.0
    const stepZ = 1.0
    for (let x = -KEEP_W / 2 + 0.4; x <= KEEP_W / 2 - 0.4; x += stepX) {
      out.push([x, -KEEP_D / 2 + 0.2])
      out.push([x, KEEP_D / 2 - 0.2])
    }
    for (let z = -KEEP_D / 2 + 1.2; z <= KEEP_D / 2 - 1.2; z += stepZ) {
      out.push([-KEEP_W / 2 + 0.2, z])
      out.push([KEEP_W / 2 - 0.2, z])
    }
    return out
  }, [])

  const roofY = KEEP_FOUND + KEEP_H

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Foundation */}
      <mesh position={[0, KEEP_FOUND / 2, 0]} castShadow receiveShadow material={DARK_STONE}>
        <boxGeometry args={[KEEP_W + 0.5, KEEP_FOUND, KEEP_D + 0.5]} />
      </mesh>
      {/* Main keep block */}
      <mesh position={[0, KEEP_FOUND + KEEP_H / 2, 0]} castShadow receiveShadow material={STONE}>
        <boxGeometry args={[KEEP_W, KEEP_H, KEEP_D]} />
      </mesh>
      {/* Battlement merlons */}
      {merlons.map(([x, z], i) => (
        <mesh key={i} position={[x, roofY + 0.25, z]} castShadow material={DARK_STONE}>
          <boxGeometry args={[0.5, 0.5, 0.5]} />
        </mesh>
      ))}
      {/* Central tower rising above the roof */}
      <mesh position={[0, roofY + 1.0, 0]} castShadow receiveShadow material={LIGHT_STONE}>
        <boxGeometry args={[2.4, 2.0, 2.4]} />
      </mesh>
      <mesh position={[0, roofY + 2.6, 0]} rotation={[0, Math.PI / 4, 0]} castShadow material={ROOF}>
        <coneGeometry args={[1.9, 1.4, 4]} />
      </mesh>
      <mesh position={[0, roofY + 3.5, 0]} material={GOLD}>
        <sphereGeometry args={[0.18, 10, 8]} />
      </mesh>
      {/* Grand door on the +Z (player-facing) front */}
      <mesh position={[0, KEEP_FOUND + 0.95, KEEP_D / 2 + 0.02]} castShadow material={WOOD}>
        <boxGeometry args={[1.4, 1.9, 0.12]} />
      </mesh>
      <mesh position={[0, KEEP_FOUND + 0.95, KEEP_D / 2 + 0.09]} material={BEAM}>
        <boxGeometry args={[0.1, 1.9, 0.05]} />
      </mesh>
      {/* Banners flanking the door */}
      <mesh position={[-1.4, KEEP_FOUND + 2.4, KEEP_D / 2 + 0.08]} material={BANNER}>
        <planeGeometry args={[0.7, 1.6]} />
      </mesh>
      <mesh position={[1.4, KEEP_FOUND + 2.4, KEEP_D / 2 + 0.08]} material={BANNER}>
        <planeGeometry args={[0.7, 1.6]} />
      </mesh>

      <Text
        position={[0, roofY + 0.05, KEEP_D / 2 + 0.05]}
        fontSize={0.4}
        color="#f3e2b6"
        anchorX="center"
        anchorY="middle"
        outlineColor="#000"
        outlineWidth={0.02}
      >
        KEEP
      </Text>

      {/* "Press E" prompt */}
      <group ref={promptRef} position={[0, roofY + 4.2, 0]} visible={false}>
        <Text fontSize={0.34} color="#fff5cc" anchorX="center" anchorY="middle" outlineColor="#000" outlineWidth={0.025}>
          Press E — Upgrades
        </Text>
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Wall segment — a stone box with crenellations along the top.
// ---------------------------------------------------------------------------
const WALL_THICK = 0.6

interface WallProps {
  position: [number, number, number]
  rotation?: number
  len: number
}

export function Wall({ position, rotation = 0, len }: WallProps) {
  const merlons = useMemo(() => {
    const out: number[] = []
    const step = 0.8
    const count = Math.max(1, Math.floor(len / step))
    const start = -((count - 1) * step) / 2
    for (let i = 0; i < count; i++) out.push(start + i * step)
    return out
  }, [len])

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, CITY_WALL_HEIGHT / 2, 0]} castShadow receiveShadow material={STONE}>
        <boxGeometry args={[len, CITY_WALL_HEIGHT, WALL_THICK]} />
      </mesh>
      {merlons.map((x, i) => (
        <mesh key={i} position={[x, CITY_WALL_HEIGHT + 0.2, 0]} castShadow material={DARK_STONE}>
          <boxGeometry args={[0.38, 0.4, WALL_THICK + 0.06]} />
        </mesh>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Watchtower — square stone tower with a pitched roof (grid-aligned).
// ---------------------------------------------------------------------------
const TOWER_H = 3.4

interface TowerProps {
  position: [number, number, number]
  rotation?: number
}

export function Tower({ position, rotation = 0 }: TowerProps) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, TOWER_H / 2, 0]} castShadow receiveShadow material={STONE}>
        <boxGeometry args={[1.8, TOWER_H, 1.8]} />
      </mesh>
      {/* Battlement ring */}
      <mesh position={[0, TOWER_H + 0.1, 0]} castShadow material={DARK_STONE}>
        <boxGeometry args={[2.1, 0.4, 2.1]} />
      </mesh>
      {/* Pitched roof — 45° so the 4-sided cone's faces align with the square */}
      <mesh position={[0, TOWER_H + 0.95, 0]} rotation={[0, Math.PI / 4, 0]} castShadow material={ROOF}>
        <coneGeometry args={[1.5, 1.3, 4]} />
      </mesh>
      {/* Flag */}
      <mesh position={[0, TOWER_H + 1.9, 0]} material={BEAM}>
        <cylinderGeometry args={[0.04, 0.04, 0.9, 6]} />
      </mesh>
      <mesh position={[0.3, TOWER_H + 2.15, 0]} material={BANNER}>
        <planeGeometry args={[0.55, 0.34]} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Gate — two stone posts with a timber lintel spanning the wall opening.
// ---------------------------------------------------------------------------
const GATE_H = 2.6

interface GateProps {
  position: [number, number, number]
  rotation?: number
  width: number
}

export function Gate({ position, rotation = 0, width }: GateProps) {
  const half = width / 2
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Posts */}
      <mesh position={[-half, GATE_H / 2, 0]} castShadow receiveShadow material={STONE}>
        <boxGeometry args={[0.9, GATE_H, 0.9]} />
      </mesh>
      <mesh position={[half, GATE_H / 2, 0]} castShadow receiveShadow material={STONE}>
        <boxGeometry args={[0.9, GATE_H, 0.9]} />
      </mesh>
      {/* Lintel */}
      <mesh position={[0, GATE_H + 0.2, 0]} castShadow material={BEAM}>
        <boxGeometry args={[width + 1.2, 0.5, 0.8]} />
      </mesh>
      {/* Crest */}
      <mesh position={[0, GATE_H + 0.65, 0]} material={GOLD}>
        <boxGeometry args={[0.5, 0.4, 0.12]} />
      </mesh>
      {/* Open door leaves swung against the posts */}
      <mesh position={[-half + 0.1, GATE_H / 2, 0.6]} rotation={[0, 0.9, 0]} castShadow material={WOOD}>
        <boxGeometry args={[half - 0.1, GATE_H - 0.4, 0.12]} />
      </mesh>
      <mesh position={[half - 0.1, GATE_H / 2, 0.6]} rotation={[0, -0.9, 0]} castShadow material={WOOD}>
        <boxGeometry args={[half - 0.1, GATE_H - 0.4, 0.12]} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Farm — a tilled plot with rows of crops.
// ---------------------------------------------------------------------------
interface FarmProps {
  position: [number, number, number]
  rotation?: number
  w: number
  d: number
}

export function Farm({ position, rotation = 0, w, d }: FarmProps) {
  const rows = useMemo(() => {
    const out: number[] = []
    for (let x = -w / 2 + 0.5; x <= w / 2 - 0.5; x += 0.8) out.push(x)
    return out
  }, [w])

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Soil bed */}
      <mesh position={[0, 0.06, 0]} receiveShadow material={SOIL}>
        <boxGeometry args={[w, 0.12, d]} />
      </mesh>
      {/* Crop rows */}
      {rows.map((x, i) => (
        <mesh key={i} position={[x, 0.22, 0]} castShadow material={CROP}>
          <boxGeometry args={[0.28, 0.24, d - 0.6]} />
        </mesh>
      ))}
      {/* Corner posts */}
      {[
        [-w / 2, -d / 2],
        [w / 2, -d / 2],
        [-w / 2, d / 2],
        [w / 2, d / 2],
      ].map(([x, z], i) => (
        <mesh key={`p${i}`} position={[x, 0.3, z]} castShadow material={BEAM}>
          <boxGeometry args={[0.12, 0.6, 0.12]} />
        </mesh>
      ))}
    </group>
  )
}
