import { useEffect, useState } from 'react'
import { tileAt } from './tileMap'
import { House } from './House'
import { Garden } from './Garden'
import { VillagerView } from './Villager'
import { createVillager, resetVillagers, subscribeVillagers, type VillagerState } from './villagerStore'
import { registerHouseBlocker, resetHouseBlockers } from './houseBlockers'

interface VillageProps {
  /** centre grid coords */
  position: [number, number]
  rotation?: number
  seed?: number
  wallColor?: string
  roofColor?: string
}

export function Village({ position, rotation = 0, seed = 0, wallColor, roofColor }: VillageProps) {
  // Compute house, garden, door positions in grid coords (offset-group space).
  const cos = Math.cos(rotation)
  const sin = Math.sin(rotation)
  const rotLocal = (lx: number, lz: number): [number, number] => [
    position[0] + lx * cos - lz * sin,
    position[1] + lx * sin + lz * cos,
  ]

  const [houseX, houseZ] = rotLocal(0, 0)
  const [gardenX, gardenZ] = rotLocal(2.8, 0)
  // Door is on +Z side of the house (in local space) — that's its front.
  const [doorX, doorZ] = rotLocal(-0.8, 1.4)

  const tile = tileAt(Math.floor(houseX), Math.floor(houseZ))
  const groundY = tile ? tile.height : 1

  useEffect(() => {
    // Register the house footprint (axis-aligned bounding box, ignoring
    // rotation — close enough at the small angles we use) so pathfinding
    // routes around it.
    const halfW = 2.8 / 2 + 0.3
    const halfD = 2.2 / 2 + 0.3
    registerHouseBlocker({
      minX: houseX - halfW,
      maxX: houseX + halfW,
      minZ: houseZ - halfD,
      maxZ: houseZ + halfD,
    })
    // Register one villager per house
    createVillager({
      x: doorX,
      y: groundY,
      z: doorZ,
      facing: rotation + Math.PI,
      homeX: houseX,
      homeZ: houseZ,
      gardenX,
      gardenZ,
      doorX,
      doorZ,
      seed,
      paletteIndex: Math.floor(seed * 7) % 3,
    })
  }, [houseX, houseZ, gardenX, gardenZ, doorX, doorZ, rotation, seed, groundY])

  return (
    <group>
      <House
        position={[houseX, groundY, houseZ]}
        rotation={rotation}
        seed={seed}
        wallColor={wallColor}
        roofColor={roofColor}
        ownerVillagerHomeX={houseX}
        ownerVillagerHomeZ={houseZ}
      />
      <Garden position={[gardenX, groundY, gardenZ]} rotation={rotation} seed={seed + 3} />
    </group>
  )
}

/** Renders all villagers from the shared store. Drop once in World. */
export function VillagerCrowd() {
  const [list, setList] = useState<VillagerState[]>([])

  useEffect(() => {
    // Re-sync whenever a villager is created (e.g. an Economy upgrade spawns one).
    const unsub = subscribeVillagers((list) => setList([...list]))
    return () => {
      unsub()
      resetVillagers()
      resetHouseBlockers()
    }
  }, [])

  return (
    <group>
      {list.map((v) => (
        <VillagerView key={v.id} state={v} />
      ))}
    </group>
  )
}
