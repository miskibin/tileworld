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
  GATE_SLOT,
  FARM_SLOT,
  slotGroundY,
} from './cityPlan'

/**
 * Renders the central castle: the Keep (always) plus structures the upgrade
 * tree has built (houses, walls, gate, towers, farm). Subscribes to cityStore
 * so new purchases appear live. Mount once inside World's offset group.
 */
export function City() {
  const [city, setCity] = useState<CityState>(() => ({ ...getCity() }))

  useEffect(() => subscribeCity((s) => setCity({ ...s })), [])

  // Register pathfinding blockers (keep + each built house). registerHouseBlocker
  // dedupes by exact bounds, so re-running on housesBuilt change is safe and
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
      registerHouseBlocker({
        minX: s.x - halfW,
        maxX: s.x + halfW,
        minZ: s.z - halfD,
        maxZ: s.z + halfD,
      })
    }
  }, [city.housesBuilt])

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

      {/* Gate */}
      {city.gateBuilt && (
        <Gate
          position={[GATE_SLOT.x, slotGroundY(GATE_SLOT.x, GATE_SLOT.z), GATE_SLOT.z]}
          rotation={GATE_SLOT.rotation}
          width={GATE_SLOT.width}
        />
      )}

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
