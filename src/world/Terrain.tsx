import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { buildTiles, type Biome } from './tileMap'

// ─── Materials per biome ─────────────────────────────────────────────
const SIDE_DIRT = new THREE.MeshStandardMaterial({ color: '#6b4a2b', roughness: 1 })
const SIDE_DIRT_DARK = new THREE.MeshStandardMaterial({ color: '#4a321d', roughness: 1 })
const SIDE_SAND = new THREE.MeshStandardMaterial({ color: '#c4a86a', roughness: 1 })
const SIDE_SAND_DARK = new THREE.MeshStandardMaterial({ color: '#8a784a', roughness: 1 })
const SIDE_ROCK = new THREE.MeshStandardMaterial({ color: '#80808a', roughness: 1 })
const SIDE_ROCK_DARK = new THREE.MeshStandardMaterial({ color: '#5d5d68', roughness: 1 })

const TOP_GRASS = new THREE.MeshStandardMaterial({ color: '#6cb14a', roughness: 0.92 })
const TOP_GRASS_DARK = new THREE.MeshStandardMaterial({ color: '#52923a', roughness: 0.92 })
const TOP_SAND = new THREE.MeshStandardMaterial({ color: '#e6cf94', roughness: 0.95 })
const TOP_FOREST = new THREE.MeshStandardMaterial({ color: '#3f8a3a', roughness: 0.95 })
const TOP_ROCK = new THREE.MeshStandardMaterial({ color: '#a8a8b0', roughness: 0.95, flatShading: true })

// Box face order: +x, -x, +y (top), -y (bottom), +z, -z
function matsFor(biome: Biome, height: number): THREE.Material[] {
  switch (biome) {
    case 'grass':
      return [SIDE_DIRT, SIDE_DIRT, TOP_GRASS, SIDE_DIRT_DARK, SIDE_DIRT, SIDE_DIRT]
    case 'forest':
      return [SIDE_DIRT, SIDE_DIRT, TOP_FOREST, SIDE_DIRT_DARK, SIDE_DIRT, SIDE_DIRT]
    case 'sand':
      return [SIDE_SAND, SIDE_SAND, TOP_SAND, SIDE_SAND_DARK, SIDE_SAND, SIDE_SAND]
    case 'rock':
      return [SIDE_ROCK, SIDE_ROCK, TOP_ROCK, SIDE_ROCK_DARK, SIDE_ROCK, SIDE_ROCK]
  }
  // Should never hit but TS exhaustive fallback
  void height
  return [SIDE_DIRT, SIDE_DIRT, TOP_GRASS, SIDE_DIRT_DARK, SIDE_DIRT, SIDE_DIRT]
}

const BOX_GEO = new THREE.BoxGeometry(1, 1, 1)

interface TilePos {
  x: number
  z: number
  h: number
}

interface InstancedTilesProps {
  positions: TilePos[]
  materials: THREE.Material[]
}

function InstancedTiles({ positions, materials }: InstancedTilesProps) {
  const ref = useRef<THREE.InstancedMesh>(null!)
  useEffect(() => {
    const dummy = new THREE.Object3D()
    positions.forEach((p, i) => {
      dummy.position.set(p.x + 0.5, p.h / 2, p.z + 0.5)
      dummy.scale.set(1, p.h, 1)
      dummy.rotation.set(0, 0, 0)
      dummy.updateMatrix()
      ref.current.setMatrixAt(i, dummy.matrix)
    })
    ref.current.instanceMatrix.needsUpdate = true
    ref.current.computeBoundingSphere()
  }, [positions])
  return (
    <instancedMesh
      ref={ref}
      args={[BOX_GEO, materials, positions.length]}
      castShadow
      receiveShadow
    />
  )
}

export function Terrain() {
  const groups = useMemo(() => {
    const tiles = buildTiles()
    // Bucket key: `${biome}-${height>=2?2:1}` — keeps grass-h2 distinct visually if used
    const buckets = new Map<string, { positions: TilePos[]; mats: THREE.Material[] }>()
    tiles.forEach((row, z) =>
      row.forEach((tile, x) => {
        if (!tile) return
        const h = Math.max(1, Math.round(tile.height))
        const key = `${tile.biome}-${h}`
        if (!buckets.has(key)) {
          const mats = matsFor(tile.biome, h)
          // Grass plateaus (height >= 2) use darker top to read as ridges.
          if (tile.biome === 'grass' && h >= 2) {
            mats[2] = TOP_GRASS_DARK
          }
          buckets.set(key, { positions: [], mats })
        }
        buckets.get(key)!.positions.push({ x, z, h })
      }),
    )
    return Array.from(buckets.values())
  }, [])

  return (
    <group>
      {groups.map((g, i) => (
        <InstancedTiles key={i} positions={g.positions} materials={g.mats} />
      ))}
    </group>
  )
}
