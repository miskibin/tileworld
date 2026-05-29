import { useEffect, useState } from 'react'
import { House } from './House'
import { TownHall, Wall, Tower, Gate } from './cityModels'
import { getCity, subscribeCity, resetCity, type CityState } from './cityStore'
import { resetUpgrades } from './upgradeStore'
import { resetUnlocks } from './weaponUnlockStore'
import { registerHouseBlocker, resetHouseBlockers } from './houseBlockers'
import {
  TOWN_HALL_SLOT,
  HOUSE_SLOTS,
  WALL_SLOTS,
  TOWER_SLOTS,
  GATE_SLOT,
  slotGroundY,
} from './cityPlan'

/**
 * Renders the central city: the Town Hall (always) plus structures the upgrade
 * tree has built (houses, walls, gate, towers). Subscribes to cityStore so new
 * purchases appear live. Mount once inside World's offset group.
 */
export function City() {
  const [city, setCity] = useState<CityState>(() => ({ ...getCity() }))

  useEffect(() => subscribeCity((s) => setCity({ ...s })), [])

  // Register pathfinding blockers (town hall + each built house). Re-run when
  // housesBuilt changes so newly-built houses are routed around. registerHouseBlocker
  // dedupes by exact bounds, so re-running is safe and never touches the
  // villages' blockers (resetHouseBlockers is global — only used on unmount).
  useEffect(() => {
    const thHalf = 3.2 / 2 + 0.3
    registerHouseBlocker({
      minX: TOWN_HALL_SLOT.x - thHalf,
      maxX: TOWN_HALL_SLOT.x + thHalf,
      minZ: TOWN_HALL_SLOT.z - thHalf,
      maxZ: TOWN_HALL_SLOT.z + thHalf,
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

  const thY = slotGroundY(TOWN_HALL_SLOT.x, TOWN_HALL_SLOT.z)

  return (
    <group>
      <TownHall position={[TOWN_HALL_SLOT.x, thY, TOWN_HALL_SLOT.z]} rotation={TOWN_HALL_SLOT.rotation} />

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
    </group>
  )
}
