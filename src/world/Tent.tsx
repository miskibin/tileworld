import { useMemo } from 'react'
import * as THREE from 'three'

interface TentProps {
  position: [number, number, number]
  rotation?: number
  color?: string
}

const CANVAS_DEFAULT = '#c8784c'
const CANVAS_DARK = '#7a4628'
const POLE = '#3a2a1a'

// Module-level geometries — shared across every Tent instance.
const BODY_GEO = (() => {
  const shape = new THREE.Shape()
  const w = 0.7
  const h = 0.95
  shape.moveTo(-w, 0)
  shape.lineTo(w, 0)
  shape.lineTo(0, h)
  shape.closePath()
  const g = new THREE.ExtrudeGeometry(shape, { depth: 1.4, bevelEnabled: false })
  g.translate(0, 0, -0.7)
  return g
})()

const DOOR_GEO = (() => {
  const shape = new THREE.Shape()
  const w = 0.3
  const h = 0.55
  shape.moveTo(-w, 0)
  shape.lineTo(w, 0)
  shape.lineTo(0, h)
  shape.closePath()
  return new THREE.ShapeGeometry(shape)
})()

const RIDGE_GEO = new THREE.CylinderGeometry(0.025, 0.025, 1.55, 6)

const POLE_MAT = new THREE.MeshStandardMaterial({ color: POLE, roughness: 1 })
const CANVAS_DARK_MAT = new THREE.MeshStandardMaterial({
  color: CANVAS_DARK,
  roughness: 1,
  side: THREE.DoubleSide,
})

export function Tent({ position, rotation = 0, color = CANVAS_DEFAULT }: TentProps) {
  // Canvas mat is per-color (memoized so re-using the same color reuses the material instance).
  const canvasMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color,
        roughness: 0.95,
        side: THREE.DoubleSide,
        flatShading: true,
      }),
    [color],
  )

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh geometry={BODY_GEO} material={canvasMat} castShadow receiveShadow />
      <mesh position={[0, 0.001, 0.701]} geometry={DOOR_GEO} material={CANVAS_DARK_MAT} />
      <mesh
        position={[0, 0.95, 0]}
        rotation={[Math.PI / 2, 0, 0]}
        castShadow
        material={POLE_MAT}
        geometry={RIDGE_GEO}
      />
    </group>
  )
}
