import { useEffect } from 'react'
import * as THREE from 'three'
import { tileAt, tileTopY } from './tileMap'
import { House } from './House'
import { Tent } from './Tent'
import { createTrader, resetTraders } from './traderStore'
import { registerHouseBlocker, resetHouseBlockers } from './houseBlockers'

// A small desert caravan market in the NE frontier (reachable flat dunes — see
// the reserved footprint in obstacles.ts). A handful of independent merchant
// NPCs man the stalls; the player trades with them and can recruit them into the
// militia. Buildings + traders are authored in absolute grid coords (rotation
// kept at 0 so coords stay easy to reason about), matching the offset-group space
// the rest of World uses.

interface TraderVillageProps {
  /** market-centre grid coords */
  position?: [number, number]
}

// Sandstone dwellings to set the frontier-market mood, distinct from the castle's
// plaster houses.
const HOUSE_WALL = '#cdb892'
const HOUSE_ROOF = '#9c6b3c'
// Colourful market awnings, echoing the trader robe palette.
const AWNINGS = ['#b5462f', '#2f6f6a', '#caa23a']

// Market-square dressing (crates, barrel, rug) — simple shared meshes.
const CRATE_MAT = new THREE.MeshStandardMaterial({ color: '#8a5a30', roughness: 1, flatShading: true })
const BARREL_MAT = new THREE.MeshStandardMaterial({ color: '#6e4628', roughness: 1, flatShading: true })
const RUG_MAT = new THREE.MeshStandardMaterial({ color: '#7a2f3a', roughness: 1 })

function groundY(x: number, z: number): number {
  return tileAt(Math.floor(x), Math.floor(z)) ? tileTopY(Math.floor(x), Math.floor(z)) : 1
}

export function TraderVillage({ position = [96, 34] }: TraderVillageProps) {
  const [cx, cz] = position

  // Dwellings (north row) + market stalls (south row). Traders stand just in
  // front (+Z) of each stall, where the tent opening faces.
  const houses: Array<[number, number]> = [
    [cx - 3, cz - 4],
    [cx + 3, cz - 4],
    [cx, cz - 4.6],
  ]
  const stalls: Array<{ x: number; z: number; awning: string; name: string }> = [
    { x: cx - 4, z: cz + 1, awning: AWNINGS[0], name: 'Caravan Peddler' },
    { x: cx, z: cz + 1, awning: AWNINGS[1], name: 'Spice Merchant' },
    { x: cx + 4, z: cz + 1, awning: AWNINGS[2], name: 'Coastal Trader' },
  ]

  useEffect(() => {
    // Reserve house footprints so pathfinding routes around the dwellings.
    houses.forEach(([hx, hz], i) => {
      registerHouseBlocker(
        { minX: hx - 1.6, maxX: hx + 1.6, minZ: hz - 1.3, maxZ: hz + 1.3 },
        `trader-house-${i}`,
      )
    })
    // One trader per stall, standing at the counter front.
    stalls.forEach((s, i) => {
      const standX = s.x
      const standZ = s.z + 1.0
      createTrader({
        x: standX,
        y: groundY(standX, standZ),
        z: standZ,
        facing: Math.PI, // face south, toward the player approaching from the castle
        homeX: standX,
        homeZ: standZ,
        gardenX: s.x,
        gardenZ: s.z + 0.7, // the stall counter
        doorX: standX,
        doorZ: standZ,
        seed: 0.21 + i * 0.37,
        paletteIndex: i % 3,
        name: s.name,
      })
    })
    return () => {
      resetTraders()
      houses.forEach((_, i) => resetHouseBlockers(`trader-house-${i}`))
    }
    // Layout is derived from a fixed position prop; run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cx, cz])

  return (
    <group>
      {houses.map(([hx, hz], i) => (
        <House
          key={`h${i}`}
          position={[hx, groundY(hx, hz), hz]}
          rotation={0}
          seed={i * 2.3}
          wallColor={HOUSE_WALL}
          roofColor={HOUSE_ROOF}
        />
      ))}
      {stalls.map((s, i) => (
        <group key={`s${i}`} position={[s.x, groundY(s.x, s.z), s.z]}>
          <Tent position={[0, 0, 0]} rotation={0} color={s.awning} />
          {/* Counter plank across the tent opening */}
          <mesh position={[0, 0.45, 0.7]} castShadow material={CRATE_MAT}>
            <boxGeometry args={[1.3, 0.12, 0.18]} />
          </mesh>
          <mesh position={[-0.55, 0.22, 0.7]} castShadow material={CRATE_MAT}>
            <boxGeometry args={[0.18, 0.45, 0.18]} />
          </mesh>
          <mesh position={[0.55, 0.22, 0.7]} castShadow material={CRATE_MAT}>
            <boxGeometry args={[0.18, 0.45, 0.18]} />
          </mesh>
        </group>
      ))}
      {/* Market-square dressing in the centre */}
      <group position={[cx, groundY(cx, cz - 0.5), cz - 0.5]}>
        <mesh position={[0.6, 0.2, 0]} castShadow material={CRATE_MAT}>
          <boxGeometry args={[0.5, 0.4, 0.5]} />
        </mesh>
        <mesh position={[0.9, 0.5, 0.15]} castShadow material={CRATE_MAT}>
          <boxGeometry args={[0.4, 0.4, 0.4]} />
        </mesh>
        <mesh position={[-0.7, 0.3, 0.2]} castShadow material={BARREL_MAT}>
          <cylinderGeometry args={[0.26, 0.26, 0.6, 10]} />
        </mesh>
        <mesh position={[0, 0.011, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow material={RUG_MAT}>
          <planeGeometry args={[2.2, 1.4]} />
        </mesh>
      </group>
    </group>
  )
}
