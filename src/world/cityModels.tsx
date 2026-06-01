import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { isPaused } from './pauseStore'
import { getPlayer } from './playerStore'
import { openTree, closeTree, isTreeOpen } from './townHallStore'
import { KEEP_INTERACT, INTERACT_DIST, CITY_WALL_HEIGHT } from './cityPlan'
import { stoneTexture, woodTexture, shingleTexture, soilTexture } from './textures'

// Shared procedural materials. Surface detail comes from canvas textures
// (textures.ts); when those are unavailable (headless inspect) the generators
// return null and we fall back to the flat palette colour.
function texMat(
  map: THREE.Texture | null,
  fallback: string,
  opts: THREE.MeshStandardMaterialParameters = {},
): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: map ? '#ffffff' : fallback,
    map: map ?? undefined,
    roughness: 0.95,
    flatShading: !map,
    ...opts,
  })
}

const STONE = texMat(stoneTexture('#7d7e86'), '#7d7e86')
const DARK_STONE = texMat(stoneTexture('#5c5d64'), '#5c5d64')
const LIGHT_STONE = texMat(stoneTexture('#969aa4'), '#969aa4')
const BEAM = texMat(woodTexture('#5a3a22'), '#5a3a22', { roughness: 1 })
const ROOF = texMat(shingleTexture('#7a2f28'), '#7a2f28', { roughness: 0.85 })
const BANNER = new THREE.MeshStandardMaterial({ color: '#2f5fa6', roughness: 0.8, side: THREE.DoubleSide })
const WOOD = texMat(woodTexture('#3a2618'), '#3a2618', { roughness: 1 })
const SOIL = texMat(soilTexture('#6b4a2a'), '#6b4a2a', { roughness: 1 })
const CROP = new THREE.MeshStandardMaterial({ color: '#8fae4a', roughness: 0.9, flatShading: true })
const GOLD = new THREE.MeshStandardMaterial({
  color: '#e0b04a',
  emissive: '#5a3a18',
  emissiveIntensity: 0.4,
  roughness: 0.6,
  metalness: 0.6,
  toneMapped: false,
})

/** Multiply a geometry's UVs in place so a shared, repeat=1 texture keeps a
 *  consistent block scale regardless of the part's world size. */
function scaleUv(geo: THREE.BufferGeometry, su: number, sv: number): THREE.BufferGeometry {
  const uv = geo.attributes.uv as THREE.BufferAttribute | undefined
  if (uv) {
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv)
    uv.needsUpdate = true
  }
  return geo
}

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  return g
}

// ---------------------------------------------------------------------------
// Keep — the castle's central, multi-tile stronghold. It exists from the start
// and is the player's interactable: press E within range to open the upgrade
// tree (mirrors Shop.tsx's interaction pattern).
// ---------------------------------------------------------------------------
const KEEP_W = 7
const KEEP_H = 1.9
const KEEP_D = 6
const KEEP_FOUND = 0.3

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
    return () => {
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  const roofY = KEEP_FOUND + KEEP_H

  // All battlement merlons merged into one geometry → a single draw call
  // instead of ~16 separate meshes.
  const merlonGeo = useMemo(() => {
    const geos: THREE.BufferGeometry[] = []
    const stepX = 1.0
    const stepZ = 1.0
    for (let x = -KEEP_W / 2 + 0.4; x <= KEEP_W / 2 - 0.4; x += stepX) {
      geos.push(box(0.5, 0.5, 0.5, x, roofY + 0.25, -KEEP_D / 2 + 0.2))
      geos.push(box(0.5, 0.5, 0.5, x, roofY + 0.25, KEEP_D / 2 - 0.2))
    }
    for (let z = -KEEP_D / 2 + 1.2; z <= KEEP_D / 2 - 1.2; z += stepZ) {
      geos.push(box(0.5, 0.5, 0.5, -KEEP_W / 2 + 0.2, roofY + 0.25, z))
      geos.push(box(0.5, 0.5, 0.5, KEEP_W / 2 - 0.2, roofY + 0.25, z))
    }
    return mergeGeometries(geos, false) as THREE.BufferGeometry
  }, [roofY])

  return (
    <group position={position} rotation={[0, rotation, 0]} scale={[0.88, 0.78, 0.88]}>
      {/* Foundation */}
      <mesh position={[0, KEEP_FOUND / 2, 0]} castShadow receiveShadow material={DARK_STONE}>
        <boxGeometry args={[KEEP_W + 0.5, KEEP_FOUND, KEEP_D + 0.5]} />
      </mesh>
      {/* Main keep block */}
      <mesh position={[0, KEEP_FOUND + KEEP_H / 2, 0]} castShadow receiveShadow material={STONE}>
        <boxGeometry args={[KEEP_W, KEEP_H, KEEP_D]} />
      </mesh>
      {/* Battlement merlons (merged) */}
      <mesh geometry={merlonGeo} material={DARK_STONE} castShadow />
      {/* Central tower rising above the roof */}
      <mesh position={[0, roofY + 0.65, 0]} castShadow receiveShadow material={LIGHT_STONE}>
        <boxGeometry args={[2.0, 1.3, 2.0]} />
      </mesh>
      <mesh position={[0, roofY + 1.55, 0]} rotation={[0, Math.PI / 4, 0]} castShadow material={ROOF}>
        <coneGeometry args={[1.4, 0.9, 4]} />
      </mesh>
      <mesh position={[0, roofY + 2.05, 0]} material={GOLD}>
        <sphereGeometry args={[0.18, 10, 8]} />
      </mesh>
      {/* Grand door on the +Z (player-facing) front */}
      <mesh position={[0, KEEP_FOUND + 0.85, KEEP_D / 2 + 0.02]} castShadow material={WOOD}>
        <boxGeometry args={[1.4, 1.6, 0.12]} />
      </mesh>
      <mesh position={[0, KEEP_FOUND + 0.85, KEEP_D / 2 + 0.09]} material={BEAM}>
        <boxGeometry args={[0.1, 1.6, 0.05]} />
      </mesh>
      {/* Banners flanking the door (planes — no shadow) */}
      <mesh position={[-1.4, KEEP_FOUND + 1.25, KEEP_D / 2 + 0.08]} material={BANNER}>
        <planeGeometry args={[0.6, 1.4]} />
      </mesh>
      <mesh position={[1.4, KEEP_FOUND + 1.25, KEEP_D / 2 + 0.08]} material={BANNER}>
        <planeGeometry args={[0.6, 1.4]} />
      </mesh>

      {/* "Press E" prompt */}
      <group ref={promptRef} position={[0, roofY + 2.6, 0]} visible={false}>
        <Text fontSize={0.34} color="#fff5cc" anchorX="center" anchorY="middle" outlineColor="#000" outlineWidth={0.025}>
          Press E — Upgrades
        </Text>
      </group>
    </group>
  )
}

// ---------------------------------------------------------------------------
// Wall segment — a stone box with crenellations along the top. Body + merlons
// are merged into ONE geometry so each wall is a single draw call (was ~13).
// ---------------------------------------------------------------------------
const WALL_THICK = 0.6

interface WallProps {
  position: [number, number, number]
  rotation?: number
  len: number
}

export function Wall({ position, rotation = 0, len }: WallProps) {
  const geo = useMemo(() => {
    const geos: THREE.BufferGeometry[] = []
    const body = box(len, CITY_WALL_HEIGHT, WALL_THICK, 0, CITY_WALL_HEIGHT / 2, 0)
    scaleUv(body, len * 0.4, CITY_WALL_HEIGHT * 0.5)
    geos.push(body)
    const step = 0.8
    const count = Math.max(1, Math.floor(len / step))
    const start = -((count - 1) * step) / 2
    for (let i = 0; i < count; i++) {
      geos.push(box(0.38, 0.4, WALL_THICK + 0.06, start + i * step, CITY_WALL_HEIGHT + 0.2, 0))
    }
    return mergeGeometries(geos, false) as THREE.BufferGeometry
  }, [len])

  return (
    <mesh position={position} rotation={[0, rotation, 0]} scale={[1, 0.82, 1]} geometry={geo} material={STONE} castShadow receiveShadow />
  )
}

// ---------------------------------------------------------------------------
// Watchtower — square stone tower with a pitched roof (grid-aligned). Body +
// battlement ring merged into one stone mesh.
// ---------------------------------------------------------------------------
const TOWER_H = 2.5

interface TowerProps {
  position: [number, number, number]
  rotation?: number
}

const TOWER_GEO = (() => {
  const body = box(1.8, TOWER_H, 1.8, 0, TOWER_H / 2, 0)
  scaleUv(body, 0.9, TOWER_H * 0.5)
  const batt = box(2.1, 0.4, 2.1, 0, TOWER_H + 0.1, 0)
  return mergeGeometries([body, batt], false) as THREE.BufferGeometry
})()

export function Tower({ position, rotation = 0 }: TowerProps) {
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={[0.92, 0.8, 0.92]}>
      <mesh geometry={TOWER_GEO} material={STONE} castShadow receiveShadow />
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
const GATE_H = 2.0

interface GateProps {
  position: [number, number, number]
  rotation?: number
  width: number
}

export function Gate({ position, rotation = 0, width }: GateProps) {
  const half = width / 2
  return (
    <group position={position} rotation={[0, rotation, 0]} scale={[1, 0.85, 1]}>
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
      {/* Crop rows (small — skip shadow casting) */}
      {rows.map((x, i) => (
        <mesh key={i} position={[x, 0.22, 0]} material={CROP}>
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
