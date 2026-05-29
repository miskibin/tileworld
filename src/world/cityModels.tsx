import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { isPaused } from './pauseStore'
import { getPlayer } from './playerStore'
import { openTree, closeTree, isTreeOpen } from './townHallStore'
import { TOWN_HALL_INTERACT, INTERACT_DIST, CITY_WALL_HEIGHT } from './cityPlan'

// Shared procedural materials (flat-shaded, matching House.tsx / Shop.tsx).
const STONE = new THREE.MeshStandardMaterial({ color: '#7d7e86', roughness: 0.95, flatShading: true })
const DARK_STONE = new THREE.MeshStandardMaterial({ color: '#5c5d64', roughness: 0.95, flatShading: true })
const TIMBER = new THREE.MeshStandardMaterial({ color: '#caa877', roughness: 0.92, flatShading: true })
const BEAM = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 1, flatShading: true })
const ROOF = new THREE.MeshStandardMaterial({ color: '#7a2f28', roughness: 0.85, flatShading: true })
const BANNER = new THREE.MeshStandardMaterial({ color: '#2f5fa6', roughness: 0.8, side: THREE.DoubleSide })
const WOOD = new THREE.MeshStandardMaterial({ color: '#3a2618', roughness: 1 })
const GOLD = new THREE.MeshStandardMaterial({
  color: '#e0b04a',
  emissive: '#5a3a18',
  emissiveIntensity: 0.4,
  roughness: 0.6,
  metalness: 0.6,
  toneMapped: false,
})

// ---------------------------------------------------------------------------
// Town Hall — the city's interactable core. Press E within range to open the
// upgrade tree (mirrors Shop.tsx's interaction pattern).
// ---------------------------------------------------------------------------
const TH_W = 3.2
const TH_H = 2.4
const TH_D = 3.2
const TH_FOUND = 0.25

interface TownHallProps {
  position: [number, number, number]
  rotation?: number
}

export function TownHall({ position, rotation = 0 }: TownHallProps) {
  const promptRef = useRef<THREE.Group>(null!)
  const inRangeRef = useRef(false)

  // Keep an up-to-date in-range flag for the key handler.
  useFrame(() => {
    if (isPaused()) return
    const p = getPlayer()
    const dx = p.x - TOWN_HALL_INTERACT.x
    const dz = p.z - TOWN_HALL_INTERACT.z
    const inRange = Math.hypot(dx, dz) < INTERACT_DIST
    inRangeRef.current = inRange
    if (promptRef.current) promptRef.current.visible = inRange && !isTreeOpen()
  })

  // E toggles the upgrade tree.
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

  const roofGeo = useMemo(() => {
    const halfW = TH_D / 2 + 0.2
    const shape = new THREE.Shape()
    shape.moveTo(-halfW, 0)
    shape.lineTo(halfW, 0)
    shape.lineTo(0, 1.1)
    shape.closePath()
    return new THREE.ExtrudeGeometry(shape, { depth: TH_W + 0.4, bevelEnabled: false })
  }, [])

  const wallTopY = TH_FOUND + TH_H

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Stone foundation */}
      <mesh position={[0, TH_FOUND / 2, 0]} castShadow receiveShadow material={STONE}>
        <boxGeometry args={[TH_W + 0.4, TH_FOUND, TH_D + 0.4]} />
      </mesh>
      {/* Main hall */}
      <mesh position={[0, TH_FOUND + TH_H / 2, 0]} castShadow receiveShadow material={TIMBER}>
        <boxGeometry args={[TH_W, TH_H, TH_D]} />
      </mesh>
      {/* Corner timber posts */}
      {[
        [-TH_W / 2, -TH_D / 2],
        [TH_W / 2, -TH_D / 2],
        [-TH_W / 2, TH_D / 2],
        [TH_W / 2, TH_D / 2],
      ].map(([x, z], i) => (
        <mesh key={i} position={[x, TH_FOUND + TH_H / 2, z]} castShadow material={BEAM}>
          <boxGeometry args={[0.22, TH_H, 0.22]} />
        </mesh>
      ))}
      {/* Grand double door on the +Z (player-facing) front */}
      <mesh position={[0, TH_FOUND + 0.7, TH_D / 2 + 0.02]} castShadow material={WOOD}>
        <boxGeometry args={[1.0, 1.4, 0.08]} />
      </mesh>
      <mesh position={[0, TH_FOUND + 0.7, TH_D / 2 + 0.07]} material={BEAM}>
        <boxGeometry args={[0.06, 1.4, 0.04]} />
      </mesh>
      {/* Pitched roof */}
      <group position={[0, wallTopY, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh
          position={[0, 0, -(TH_W + 0.4) / 2]}
          castShadow
          receiveShadow
          material={ROOF}
          geometry={roofGeo}
        />
      </group>
      {/* Bell-tower cupola on the ridge */}
      <mesh position={[0, wallTopY + 1.2, 0]} castShadow material={DARK_STONE}>
        <boxGeometry args={[0.8, 0.9, 0.8]} />
      </mesh>
      <mesh position={[0, wallTopY + 1.85, 0]} castShadow material={ROOF}>
        <coneGeometry args={[0.7, 0.7, 4]} />
      </mesh>
      <mesh position={[0, wallTopY + 2.25, 0]} material={GOLD}>
        <sphereGeometry args={[0.12, 10, 8]} />
      </mesh>
      {/* Banner over the door */}
      <mesh position={[0, TH_FOUND + 1.7, TH_D / 2 + 0.06]} material={BANNER}>
        <planeGeometry args={[0.6, 0.9]} />
      </mesh>

      {/* Sign */}
      <Text
        position={[0, TH_FOUND + TH_H + 0.05, TH_D / 2 + 0.05]}
        fontSize={0.26}
        color="#f3e2b6"
        anchorX="center"
        anchorY="middle"
        outlineColor="#000"
        outlineWidth={0.015}
      >
        TOWN HALL
      </Text>

      {/* "Press E" prompt */}
      <group ref={promptRef} position={[0, wallTopY + 2.7, 0]} visible={false}>
        <Text fontSize={0.24} color="#fff5cc" anchorX="center" anchorY="middle" outlineColor="#000" outlineWidth={0.02}>
          Press E — Upgrades
        </Text>
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Wall segment — a stone box with crenellations along the top.
// ---------------------------------------------------------------------------
const WALL_THICK = 0.45

interface WallProps {
  position: [number, number, number]
  rotation?: number
  len: number
}

export function Wall({ position, rotation = 0, len }: WallProps) {
  const merlons = useMemo(() => {
    const out: number[] = []
    const step = 0.7
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
        <mesh key={i} position={[x, CITY_WALL_HEIGHT + 0.18, 0]} castShadow material={DARK_STONE}>
          <boxGeometry args={[0.32, 0.36, WALL_THICK + 0.04]} />
        </mesh>
      ))}
    </group>
  )
}

// ---------------------------------------------------------------------------
// Watchtower — round stone tower with a conical roof.
// ---------------------------------------------------------------------------
const TOWER_H = 2.8

interface TowerProps {
  position: [number, number, number]
  rotation?: number
}

export function Tower({ position, rotation = 0 }: TowerProps) {
  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, TOWER_H / 2, 0]} castShadow receiveShadow material={STONE}>
        <cylinderGeometry args={[0.7, 0.8, TOWER_H, 10]} />
      </mesh>
      {/* Battlement ring */}
      <mesh position={[0, TOWER_H + 0.05, 0]} castShadow material={DARK_STONE}>
        <cylinderGeometry args={[0.85, 0.85, 0.3, 10]} />
      </mesh>
      {/* Conical roof */}
      <mesh position={[0, TOWER_H + 0.75, 0]} castShadow material={ROOF}>
        <coneGeometry args={[0.95, 1.1, 10]} />
      </mesh>
      {/* Flag */}
      <mesh position={[0, TOWER_H + 1.5, 0]} material={BEAM}>
        <cylinderGeometry args={[0.03, 0.03, 0.7, 6]} />
      </mesh>
      <mesh position={[0.22, TOWER_H + 1.7, 0]} material={BANNER}>
        <planeGeometry args={[0.4, 0.26]} />
      </mesh>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Gate — two stone posts with a timber lintel spanning the wall opening.
// ---------------------------------------------------------------------------
const GATE_H = 2.2

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
        <boxGeometry args={[0.7, GATE_H, 0.7]} />
      </mesh>
      <mesh position={[half, GATE_H / 2, 0]} castShadow receiveShadow material={STONE}>
        <boxGeometry args={[0.7, GATE_H, 0.7]} />
      </mesh>
      {/* Lintel */}
      <mesh position={[0, GATE_H + 0.15, 0]} castShadow material={BEAM}>
        <boxGeometry args={[width + 0.9, 0.35, 0.6]} />
      </mesh>
      {/* Crest */}
      <mesh position={[0, GATE_H + 0.5, 0]} material={GOLD}>
        <boxGeometry args={[0.4, 0.3, 0.1]} />
      </mesh>
      {/* Open door leaves swung against the posts */}
      <mesh position={[-half + 0.1, GATE_H / 2, 0.45]} rotation={[0, 0.9, 0]} castShadow material={WOOD}>
        <boxGeometry args={[half - 0.1, GATE_H - 0.3, 0.1]} />
      </mesh>
      <mesh position={[half - 0.1, GATE_H / 2, 0.45]} rotation={[0, -0.9, 0]} castShadow material={WOOD}>
        <boxGeometry args={[half - 0.1, GATE_H - 0.3, 0.1]} />
      </mesh>
    </group>
  )
}
