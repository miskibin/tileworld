import { useMemo } from 'react'
import * as THREE from 'three'
import { tileAt } from './tileMap'
import { getRoadDirt, getRoadBridges } from './roads'
import { Bridge } from './Bridge'
import { applyVisionShader } from './vision'
import { getDetailTextures } from './terrainDetail'

/**
 * Grid-based dirt roads. Each road tile is a full 1×1 quad sitting just above
 * the terrain (no rotation / odd angles). River crossings render as bridges so
 * a road is never left without one.
 */

const Y_OFFSET = 0.04
const PATH_MAT = new THREE.MeshStandardMaterial({ color: '#8a6d44', roughness: 1 })
const PATH_GEO = new THREE.PlaneGeometry(1, 1)

// Trampled-dirt look: soil-grain detail in world-XZ + variation so the trail
// reads as worn ground, not a flat brown quad. Shares the shader with terrain.
{
  const dirt = getDetailTextures().dirt
  applyVisionShader(PATH_MAT, {
    detail: dirt,
    detailMean: dirt.userData.mean as number,
    detailScale: 0.35,
    detailStrength: 0.7,
    variation: 0.5,
  })
}

function tileHeightAt(x: number, z: number): number {
  const t = tileAt(x, z)
  return t ? t.height : 1
}

export function Paths() {
  const dirt = useMemo(() => getRoadDirt(), [])
  const bridges = useMemo(() => getRoadBridges(), [])

  return (
    <group>
      {dirt.map(({ x, z }) => (
        <mesh
          key={`${x},${z}`}
          position={[x + 0.5, tileHeightAt(x, z) + Y_OFFSET, z + 0.5]}
          rotation={[-Math.PI / 2, 0, 0]}
          receiveShadow
          material={PATH_MAT}
          geometry={PATH_GEO}
        />
      ))}
      {bridges.map((b, i) => (
        <Bridge key={`b${i}`} from={[b.fromX, b.fromZ]} to={[b.toX, b.toZ]} y={1.0} />
      ))}
    </group>
  )
}
