import { useEffect, useState } from 'react'
import { tileAt } from './tileMap'
import { House } from './House'
import { Garden } from './Garden'
import { VillagerView } from './Villager'
import { createVillager, getVillagers, resetVillagers, type VillagerState } from './villagerStore'

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
      />
      <Garden position={[gardenX, groundY, gardenZ]} rotation={rotation} seed={seed + 3} />
    </group>
  )
}

/** Renders all villagers from the shared store. Drop once in World. */
export function VillagerCrowd() {
  const [list, setList] = useState<VillagerState[]>([])

  useEffect(() => {
    const handle = requestAnimationFrame(() => setList([...getVillagers()]))
    return () => {
      cancelAnimationFrame(handle)
      resetVillagers()
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
