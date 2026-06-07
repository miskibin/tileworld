import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import { House } from './House'
import { Garden } from './Garden'
import { Keep, Wall, Tower, Gate } from './cityModels'
import { getCity, subscribeCity, resetCity, type CityState } from './cityStore'
import { getTowers, isTowerAlive, subscribeTowers, TOWER_MAX_HP } from './towerStore'
import { resetUpgrades } from './upgradeStore'
import { resetUnlocks } from './weaponUnlockStore'
import { registerHouseBlocker, resetHouseBlockers } from './houseBlockers'
import { cobbleTexture } from './textures'
import {
  KEEP_SLOT,
  KEEP_HALF,
  HOUSE_SLOTS,
  WALL_SLOTS,
  TOWER_SLOTS,
  type TowerSlot,
  GATE_SLOTS,
  FARM_SLOT,
  CITY_CENTER,
  CASTLE_BOUNDS,
  slotGroundY,
} from './cityPlan'

// Wall collision thickness (must match the Wall model in cityModels.tsx).
const WALL_THICK = 0.6
const TOWER_HALF = 1.0

// Tower HP-bar + rubble look (shared, allocated once).
const TBAR_BG = new THREE.MeshBasicMaterial({ color: '#1a1410', toneMapped: false })
const TBAR_FG = new THREE.MeshBasicMaterial({ color: '#9adcff', toneMapped: false })
const TBAR_GEO = new THREE.PlaneGeometry(1, 1)
const TBAR_W = 1.6
const RUBBLE_MAT = new THREE.MeshStandardMaterial({ color: '#5c5d64', roughness: 1, flatShading: true })

// Courtyard floor laid inside the walls once they're raised — flagstone instead
// of plain grass. Inset half a tile so it tucks just inside the wall line.
const COURTYARD_INSET = 0.5
const COURTYARD_W = CASTLE_BOUNDS.maxX - CASTLE_BOUNDS.minX - COURTYARD_INSET * 2
const COURTYARD_D = CASTLE_BOUNDS.maxZ - CASTLE_BOUNDS.minZ - COURTYARD_INSET * 2
const COURTYARD_TEX = cobbleTexture('#8f8f98', 13)
const COURTYARD_MAT = new THREE.MeshStandardMaterial({
  color: COURTYARD_TEX ? '#ffffff' : '#8f8f98',
  map: COURTYARD_TEX ?? undefined,
  roughness: 0.95,
})

/**
 * One watchtower slot. Renders the tower model while it has HP, a low pile of
 * rubble once orks batter it down (rebuilt each prep), and a billboard HP bar
 * that fades in while damaged. The bar reads tower HP live each frame; the
 * model⇄rubble swap is driven by the alive→destroyed notify from towerStore.
 */
function BuiltTower({ slot, index }: { slot: TowerSlot; index: number }) {
  const [alive, setAlive] = useState(() => isTowerAlive(index))
  const barRef = useRef<THREE.Group>(null!)
  const fgRef = useRef<THREE.Mesh>(null!)
  const y = slotGroundY(slot.x, slot.z)

  useEffect(() => subscribeTowers(() => setAlive(isTowerAlive(index))), [index])

  useFrame(() => {
    const hp = getTowers().hp[index]
    const ratio = Math.max(0, hp / TOWER_MAX_HP)
    if (barRef.current) barRef.current.visible = hp > 0 && ratio < 1
    if (fgRef.current && ratio < 1) {
      fgRef.current.scale.x = TBAR_W * ratio
      fgRef.current.position.x = -((1 - ratio) * TBAR_W) / 2
    }
  })

  return (
    <group>
      {alive ? (
        <Tower position={[slot.x, y, slot.z]} rotation={slot.rotation} />
      ) : (
        <group position={[slot.x, y, slot.z]} rotation={[0, slot.rotation, 0]}>
          {/* Collapsed stone pile */}
          <mesh position={[0, 0.35, 0]} castShadow receiveShadow material={RUBBLE_MAT}>
            <boxGeometry args={[1.9, 0.7, 1.9]} />
          </mesh>
          <mesh position={[0.5, 0.85, -0.3]} rotation={[0.4, 0.6, 0.2]} castShadow material={RUBBLE_MAT}>
            <boxGeometry args={[0.8, 0.7, 0.8]} />
          </mesh>
          <mesh position={[-0.6, 0.7, 0.4]} rotation={[0.2, -0.4, 0.5]} castShadow material={RUBBLE_MAT}>
            <boxGeometry args={[0.7, 0.6, 0.9]} />
          </mesh>
        </group>
      )}
      {/* HP bar */}
      <group ref={barRef} position={[slot.x, y + 4.2, slot.z]} visible={false}>
        <Billboard follow>
          <mesh material={TBAR_BG} geometry={TBAR_GEO} scale={[TBAR_W + 0.1, 0.22, 1]} />
          <mesh ref={fgRef} material={TBAR_FG} geometry={TBAR_GEO} position={[0, 0, 0.001]} scale={[TBAR_W, 0.16, 1]} />
        </Billboard>
      </group>
    </group>
  )
}

/**
 * Renders the central castle: the Keep (always) plus structures the upgrade
 * tree has built (houses, walls, gates, towers, farm). Subscribes to cityStore
 * so new purchases appear live. Mount once inside World's offset group.
 */
export function City() {
  const [city, setCity] = useState<CityState>(() => ({ ...getCity() }))

  useEffect(() => subscribeCity((s) => setCity({ ...s })), [])

  // Register pathfinding/collision blockers (keep + each built house).
  // registerHouseBlocker dedupes by exact bounds, so re-running is safe and
  // never touches other blockers (resetHouseBlockers is global — unmount only).
  useEffect(() => {
    registerHouseBlocker(
      {
        minX: KEEP_SLOT.x - KEEP_HALF.x,
        maxX: KEEP_SLOT.x + KEEP_HALF.x,
        minZ: KEEP_SLOT.z - KEEP_HALF.z,
        maxZ: KEEP_SLOT.z + KEEP_HALF.z,
      },
      'city',
    )
    for (let i = 0; i < city.housesBuilt && i < HOUSE_SLOTS.length; i++) {
      const s = HOUSE_SLOTS[i]
      const halfW = 2.8 / 2 + 0.3
      const halfD = 2.2 / 2 + 0.3
      registerHouseBlocker({ minX: s.x - halfW, maxX: s.x + halfW, minZ: s.z - halfD, maxZ: s.z + halfD }, 'city')
    }
  }, [city.housesBuilt])

  // Walls + towers become solid once built. Gate gaps are left open (not
  // registered), so the player/villagers pass through them.
  useEffect(() => {
    if (!city.wallsBuilt) return
    for (const w of WALL_SLOTS) {
      const along = w.len / 2
      const half = WALL_THICK / 2
      const isX = Math.abs(Math.sin(w.rotation)) < 0.5 // rotation 0/180 → runs along X
      const halfW = isX ? along : half
      const halfD = isX ? half : along
      registerHouseBlocker({ minX: w.x - halfW, maxX: w.x + halfW, minZ: w.z - halfD, maxZ: w.z + halfD }, 'city')
    }
  }, [city.wallsBuilt])

  useEffect(() => {
    if (!city.towersBuilt) return
    for (const t of TOWER_SLOTS) {
      registerHouseBlocker({ minX: t.x - TOWER_HALF, maxX: t.x + TOWER_HALF, minZ: t.z - TOWER_HALF, maxZ: t.z + TOWER_HALF }, 'city')
    }
  }, [city.towersBuilt])

  // HMR / unmount safety: clear singleton stores so re-mount doesn't stack
  // villagers, blockers, or double-apply upgrades.
  useEffect(() => {
    return () => {
      resetCity()
      resetUpgrades()
      resetUnlocks()
      resetHouseBlockers('city')
    }
  }, [])

  const keepY = slotGroundY(KEEP_SLOT.x, KEEP_SLOT.z)

  return (
    <group>
      {/* Courtyard floor — flagstone replaces the grass interior once walls are up */}
      {city.wallsBuilt && (
        <mesh
          position={[CITY_CENTER.x, slotGroundY(CITY_CENTER.x, CITY_CENTER.z) + 0.06, CITY_CENTER.z]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
          material={COURTYARD_MAT}
        >
          <planeGeometry args={[COURTYARD_W, COURTYARD_D]} />
        </mesh>
      )}

      <Keep position={[KEEP_SLOT.x, keepY, KEEP_SLOT.z]} rotation={KEEP_SLOT.rotation} />

      {/* Houses for each built slot */}
      {HOUSE_SLOTS.slice(0, city.housesBuilt).map((s, i) => (
        <House
          key={`house-${i}`}
          position={[s.x, slotGroundY(s.x, s.z), s.z]}
          rotation={s.rotation}
          seed={i * 1.7 + 0.3}
          wallColor="#cdb594"
          roofColor="#6b4a2a"
          ownerVillagerHomeX={s.x}
          ownerVillagerHomeZ={s.z}
        />
      ))}

      {/* Perimeter walls */}
      {city.wallsBuilt &&
        WALL_SLOTS.map((s, i) => (
          <Wall key={`wall-${i}`} position={[s.x, slotGroundY(s.x, s.z), s.z]} rotation={s.rotation} len={s.len} />
        ))}

      {/* Gates (one per wall) */}
      {city.gateBuilt &&
        GATE_SLOTS.map((g, i) => (
          <Gate
            key={`gate-${i}`}
            position={[g.x, slotGroundY(g.x, g.z), g.z]}
            rotation={g.rotation}
            width={g.width}
          />
        ))}

      {/* Watchtowers — destructible (model ↔ rubble + HP bar), rebuilt each prep */}
      {city.towersBuilt &&
        TOWER_SLOTS.map((s, i) => <BuiltTower key={`tower-${i}`} slot={s} index={i} />)}

      {/* Farm — the village-style fenced veggie garden (same model the world villages use) */}
      {city.farmBuilt && (
        <Garden
          position={[FARM_SLOT.x, slotGroundY(FARM_SLOT.x, FARM_SLOT.z), FARM_SLOT.z]}
          rotation={FARM_SLOT.rotation}
          size={Math.min(FARM_SLOT.w, FARM_SLOT.d) / 2 - 0.2}
          seed={7}
        />
      )}
    </group>
  )
}
