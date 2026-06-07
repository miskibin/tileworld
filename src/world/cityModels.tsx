import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text, Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { isPaused } from './pauseStore'
import { getPlayer } from './playerStore'
import { openTree, closeTree, isTreeOpen } from './townHallStore'
import { getPhase } from './gameStore'
import { getCastle } from './castleStore'
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

  // Refs for the staged-destruction visuals, toggled each frame off the HP ratio.
  const merlonFullRef = useRef<THREE.Mesh>(null!)
  const merlonPartialRef = useRef<THREE.Mesh>(null!)
  const merlonSparseRef = useRef<THREE.Mesh>(null!)
  const rubbleRef = useRef<THREE.Mesh>(null!)
  const smokeRef = useRef<THREE.Group>(null!)
  const emberRef = useRef<THREE.Group>(null!)

  const roofY = KEEP_FOUND + KEEP_H

  // Keep-local material clones. STONE/* are singletons shared with every wall
  // and house, so tinting them on damage would soot the whole town — clone the
  // four the staged look mutates and remember their pristine colours.
  const mats = useMemo(() => {
    const stone = STONE.clone()
    const darkStone = DARK_STONE.clone()
    const lightStone = LIGHT_STONE.clone()
    const roof = ROOF.clone()
    return {
      stone,
      darkStone,
      lightStone,
      roof,
      base: {
        stone: stone.color.clone(),
        darkStone: darkStone.color.clone(),
        lightStone: lightStone.color.clone(),
        roof: roof.color.clone(),
      },
    }
  }, [])

  useEffect(
    () => () => {
      mats.stone.dispose()
      mats.darkStone.dispose()
      mats.lightStone.dispose()
      mats.roof.dispose()
    },
    [mats],
  )

  // Three merlon variants (full / partial / sparse) + ground rubble, each one
  // merged geometry. Only one merlon mesh is visible at a time, so the single
  // draw-call benefit holds — we just toggle .visible by HP stage.
  const merlons = useMemo(() => {
    const build = (keep: (i: number) => boolean) => {
      const geos: THREE.BufferGeometry[] = []
      let i = 0
      const push = (x: number, z: number) => {
        if (keep(i)) geos.push(box(0.5, 0.5, 0.5, x, roofY + 0.25, z))
        i++
      }
      for (let x = -KEEP_W / 2 + 0.4; x <= KEEP_W / 2 - 0.4; x += 1.0) {
        push(x, -KEEP_D / 2 + 0.2)
        push(x, KEEP_D / 2 - 0.2)
      }
      for (let z = -KEEP_D / 2 + 1.2; z <= KEEP_D / 2 - 1.2; z += 1.0) {
        push(-KEEP_W / 2 + 0.2, z)
        push(KEEP_W / 2 - 0.2, z)
      }
      return mergeGeometries(geos, false) as THREE.BufferGeometry
    }
    // Rubble block: rotate about its own centre, then place on the ground.
    const rb = (x: number, z: number, ry: number, s = 0.5) => {
      const g = new THREE.BoxGeometry(s, s * 0.85, s)
      g.rotateY(ry)
      g.translate(x, s * 0.42, z)
      return g
    }
    return {
      full: build(() => true),
      partial: build((i) => i % 3 !== 0), // ~1/3 knocked off
      sparse: build((i) => i % 3 === 1), // ~2/3 gone, a jagged few left
      rubble: mergeGeometries(
        [
          rb(-KEEP_W / 2 - 0.4, 0.6, 0.5),
          rb(KEEP_W / 2 + 0.3, -1.1, 1.2, 0.45),
          rb(0.8, KEEP_D / 2 + 0.5, 2.1),
          rb(-1.4, -KEEP_D / 2 - 0.4, 0.8, 0.4),
        ],
        false,
      ) as THREE.BufferGeometry,
    }
  }, [roofY])

  useFrame(() => {
    // Destruction visuals run regardless of the pause gate so the keep stays
    // correctly damaged-looking while a modal (shop / upgrade tree) is open.
    const c = getCastle()
    const ratio = c.maxHp > 0 ? c.hp / c.maxHp : 0
    const hurting = performance.now() * 0.001 < c.hurtFlashUntil

    const b = mats.base
    if (hurting) {
      mats.stone.color.set('#c98850')
      mats.darkStone.color.set('#c98850')
      mats.lightStone.color.set('#c98850')
      mats.roof.color.copy(b.roof)
    } else {
      const k = ratio > 0.66 ? 1 : ratio > 0.33 ? 0.7 : 0.45
      mats.stone.color.copy(b.stone).multiplyScalar(k)
      mats.darkStone.color.copy(b.darkStone).multiplyScalar(k)
      mats.lightStone.color.copy(b.lightStone).multiplyScalar(k)
      mats.roof.color.copy(b.roof).multiplyScalar(k)
    }

    if (merlonFullRef.current) merlonFullRef.current.visible = ratio > 0.66
    if (merlonPartialRef.current) merlonPartialRef.current.visible = ratio > 0.33 && ratio <= 0.66
    if (merlonSparseRef.current) merlonSparseRef.current.visible = ratio <= 0.33
    const burning = ratio <= 0.33
    if (rubbleRef.current) rubbleRef.current.visible = burning
    if (smokeRef.current) smokeRef.current.visible = burning
    if (emberRef.current) emberRef.current.visible = burning

    // Proximity prompt — still gated on pause like the rest of the sim.
    if (isPaused()) return
    const p = getPlayer()
    const dx = p.x - KEEP_INTERACT.x
    const dz = p.z - KEEP_INTERACT.z
    const inRange = Math.hypot(dx, dz) < INTERACT_DIST
    inRangeRef.current = inRange
    // Hidden behind the StartScreen (menu): the player boots in range of the keep.
    if (promptRef.current) promptRef.current.visible = inRange && !isTreeOpen() && getPhase() !== 'menu'
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

  return (
    <group position={position} rotation={[0, rotation, 0]} scale={[0.88, 0.7, 0.88]}>
      {/* Foundation */}
      <mesh position={[0, KEEP_FOUND / 2, 0]} castShadow receiveShadow material={mats.darkStone}>
        <boxGeometry args={[KEEP_W + 0.5, KEEP_FOUND, KEEP_D + 0.5]} />
      </mesh>
      {/* Main keep block */}
      <mesh position={[0, KEEP_FOUND + KEEP_H / 2, 0]} castShadow receiveShadow material={mats.stone}>
        <boxGeometry args={[KEEP_W, KEEP_H, KEEP_D]} />
      </mesh>
      {/* Battlement merlons — three staged variants, one visible at a time */}
      <mesh ref={merlonFullRef} geometry={merlons.full} material={mats.darkStone} castShadow />
      <mesh ref={merlonPartialRef} geometry={merlons.partial} material={mats.darkStone} castShadow visible={false} />
      <mesh ref={merlonSparseRef} geometry={merlons.sparse} material={mats.darkStone} castShadow visible={false} />
      {/* Knocked-off rubble on the ground (low HP only) */}
      <mesh ref={rubbleRef} geometry={merlons.rubble} material={mats.darkStone} castShadow receiveShadow visible={false} />
      {/* Central tower rising above the roof */}
      <mesh position={[0, roofY + 0.65, 0]} castShadow receiveShadow material={mats.lightStone}>
        <boxGeometry args={[2.0, 1.3, 2.0]} />
      </mesh>
      <mesh position={[0, roofY + 1.55, 0]} rotation={[0, Math.PI / 4, 0]} castShadow material={mats.roof}>
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
        <Billboard>
          <Text fontSize={0.24} color="#fff5cc" anchorX="center" anchorY="middle" outlineColor="#000" outlineWidth={0.018}>
            Press E — Upgrades
          </Text>
        </Billboard>
      </group>

      {/* Smoke + embers when the keep is burning (low HP only) */}
      <group ref={smokeRef} position={[0, roofY + 2, 0]} visible={false}>
        <Sparkles count={12} scale={[3, 4, 3]} size={6} speed={0.3} opacity={0.5} color="#3a3a3a" noise={1.5} />
      </group>
      <group ref={emberRef} position={[0, roofY + 1.4, 0]} visible={false}>
        <Sparkles count={8} scale={[2.4, 3, 2.4]} size={2.5} speed={0.8} opacity={0.9} color="#ff7a2a" />
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
    <mesh position={position} rotation={[0, rotation, 0]} scale={[1, 0.74, 1]} geometry={geo} material={STONE} castShadow receiveShadow />
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
    <group position={position} rotation={[0, rotation, 0]} scale={[0.92, 0.72, 0.92]}>
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
    <group position={position} rotation={[0, rotation, 0]} scale={[1, 0.77, 1]}>
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
