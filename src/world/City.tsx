import { useEffect, useState } from 'react'
import { House } from './House'
import { Keep, Wall, Tower, Gate, Farm } from './cityModels'
import { getCity, subscribeCity, resetCity, type CityState } from './cityStore'
import { resetUpgrades } from './upgradeStore'
import { resetUnlocks } from './weaponUnlockStore'
import { registerHouseBlocker, resetHouseBlockers } from './houseBlockers'
import {
  KEEP_SLOT,
  KEEP_HALF,
  HOUSE_SLOTS,
  WALL_SLOTS,
  TOWER_SLOTS,
  GATE_SLOTS,
  FARM_SLOT,
  slotGroundY,
} from './cityPlan'

// Wall collision thickness (must match the Wall model in cityModels.tsx).
const WALL_THICK = 0.6
const TOWER_HALF = 1.0

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
    registerHouseBlocker({
      minX: KEEP_SLOT.x - KEEP_HALF.x,
      maxX: KEEP_SLOT.x + KEEP_HALF.x,
      minZ: KEEP_SLOT.z - KEEP_HALF.z,
      maxZ: KEEP_SLOT.z + KEEP_HALF.z,
    })
    for (let i = 0; i < city.housesBuilt && i < HOUSE_SLOTS.length; i++) {
      const s = HOUSE_SLOTS[i]
      const halfW = 2.8 / 2 + 0.3
      const halfD = 2.2 / 2 + 0.3
      registerHouseBlocker({ minX: s.x - halfW, maxX: s.x + halfW, minZ: s.z - halfD, maxZ: s.z + halfD })
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
      registerHouseBlocker({ minX: w.x - halfW, maxX: w.x + halfW, minZ: w.z - halfD, maxZ: w.z + halfD })
    }
  }, [city.wallsBuilt])

  useEffect(() => {
    if (!city.towersBuilt) return
    for (const t of TOWER_SLOTS) {
      registerHouseBlocker({ minX: t.x - TOWER_HALF, maxX: t.x + TOWER_HALF, minZ: t.z - TOWER_HALF, maxZ: t.z + TOWER_HALF })
    }
  }, [city.towersBuilt])

  // HMR / unmount safety: clear singleton stores so re-mount doesn't stack
  // villagers, blockers, or double-apply upgrades.
  useEffect(() => {
    return () => {
      resetCity()
      resetUpgrades()
      resetUnlocks()
      resetHouseBlockers()
    }
  }, [])

  const keepY = slotGroundY(KEEP_SLOT.x, KEEP_SLOT.z)

  return (
    <group>
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

      {/* Watchtowers */}
      {city.towersBuilt &&
        TOWER_SLOTS.map((s, i) => (
          <Tower key={`tower-${i}`} position={[s.x, slotGroundY(s.x, s.z), s.z]} rotation={s.rotation} />
        ))}

      {/* Farm */}
      {city.farmBuilt && (
        <Farm
          position={[FARM_SLOT.x, slotGroundY(FARM_SLOT.x, FARM_SLOT.z), FARM_SLOT.z]}
          rotation={FARM_SLOT.rotation}
          w={FARM_SLOT.w}
          d={FARM_SLOT.d}
        />
      )}
    </group>
  )
}
