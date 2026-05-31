import { useMemo } from 'react'
import * as THREE from 'three'
import { tileAt, tileTopY } from './tileMap'
import { getRoadDirt, getRoadBridges, isRoadTile } from './roads'
import { Bridge } from './Bridge'
import { applyVisionShader } from './vision'
import { getDetailTextures } from './terrainDetail'

/**
 * Grid-based dirt roads, merged into ONE mesh (was a quad per tile → ~100 draw
 * calls). Each tile is a flat quad sitting just above the terrain. A per-corner
 * `aCoverage` attribute (1 = surrounded by road, →0 at the open border) drives a
 * noisy edge discard in the shared terrain shader, so the dirt frays into the
 * grass instead of ending on a hard tile line. River crossings render as
 * bridges so a road is never left without one.
 */

const Y_OFFSET = 0.04
const PATH_MAT = new THREE.MeshStandardMaterial({ color: '#8a6d44', roughness: 1 })

// Trampled-dirt look: soil-grain detail in world-XZ + variation so the trail
// reads as worn ground, not a flat brown quad; `edgeAlpha` feathers the border.
{
  const dirt = getDetailTextures().dirt
  applyVisionShader(PATH_MAT, {
    detail: dirt,
    detailMean: dirt.userData.mean as number,
    detailScale: 0.35,
    detailStrength: 0.7,
    variation: 0.5,
    edgeAlpha: true,
  })
}

function tileHeightAt(x: number, z: number): number {
  const t = tileAt(x, z)
  return t ? tileTopY(x, z) : 1
}

// Coverage at an integer corner = fraction of the four tiles meeting there that
// are road. Corners deep inside the road read 1; a corner on the outer edge
// reads 0.25–0.5, which the shader frays away.
function cornerCoverage(cx: number, cz: number): number {
  let n = 0
  if (isRoadTile(cx - 1, cz - 1)) n++
  if (isRoadTile(cx, cz - 1)) n++
  if (isRoadTile(cx - 1, cz)) n++
  if (isRoadTile(cx, cz)) n++
  return n / 4
}

function buildRoadGeometry(): THREE.BufferGeometry {
  const tiles = getRoadDirt()
  const positions = new Float32Array(tiles.length * 4 * 3)
  const normals = new Float32Array(tiles.length * 4 * 3)
  const coverage = new Float32Array(tiles.length * 4)
  const index = new Uint32Array(tiles.length * 6)
  let v = 0 // running vertex count
  let ii = 0
  for (const { x, z } of tiles) {
    const h = tileHeightAt(x, z) + Y_OFFSET
    const base = v
    // Corners CCW-from-above so the quad faces +Y (top face → gets detail).
    const corners = [
      [x, z],
      [x + 1, z],
      [x, z + 1],
      [x + 1, z + 1],
    ]
    for (const [px, pz] of corners) {
      positions[v * 3] = px
      positions[v * 3 + 1] = h
      positions[v * 3 + 2] = pz
      normals[v * 3 + 1] = 1
      coverage[v] = cornerCoverage(px, pz)
      v++
    }
    index[ii++] = base + 0
    index[ii++] = base + 2
    index[ii++] = base + 3
    index[ii++] = base + 0
    index[ii++] = base + 3
    index[ii++] = base + 1
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geo.setAttribute('aCoverage', new THREE.BufferAttribute(coverage, 1))
  geo.setIndex(new THREE.BufferAttribute(index, 1))
  return geo
}

export function Paths() {
  const geo = useMemo(() => buildRoadGeometry(), [])
  const bridges = useMemo(() => getRoadBridges(), [])

  return (
    <group>
      <mesh geometry={geo} material={PATH_MAT} receiveShadow />
      {bridges.map((b, i) => (
        <Bridge key={`b${i}`} from={[b.fromX, b.fromZ]} to={[b.toX, b.toZ]} y={1.0} />
      ))}
    </group>
  )
}
