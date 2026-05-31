import { useEffect } from 'react'
import * as THREE from 'three'
import { registerBridge } from './bridges'
import { woodTexture } from './textures'

// Plank grain to match the gate/house timber. Map is null in headless
// (`npm run inspect`), where we fall back to the flat colour.
function woodMat(color: string, planks: number): THREE.MeshStandardMaterial {
  const map = woodTexture(color, 1, planks)
  return new THREE.MeshStandardMaterial({ color: map ? '#ffffff' : color, map, roughness: 1 })
}

const PLANK_LIGHT = woodMat('#8a5a32', 1)
const PLANK_DARK = woodMat('#6b4222', 1)
const RAIL = woodMat('#5a3a22', 2)

interface Props {
  /** Bridge start in grid coords inside the offset group. */
  from: [number, number]
  to: [number, number]
  y: number
}

export function Bridge({ from, to, y }: Props) {
  const dx = to[0] - from[0]
  const dz = to[1] - from[1]
  const len = Math.hypot(dx, dz)
  const angle = Math.atan2(dz, dx)
  const cx = (from[0] + to[0]) / 2
  const cz = (from[1] + to[1]) / 2
  const plankCount = Math.max(5, Math.round(len * 2.2))
  const plankSpan = len
  const plankDepth = plankSpan / plankCount
  const plankWidth = 0.85

  // Register the walkable span so Character collision can let the player cross.
  // Collision width is wider than the visual planks so the player isn't pushed
  // off by tiny perpendicular drift while crossing.
  useEffect(() => {
    registerBridge({
      fromX: from[0],
      fromZ: from[1],
      toX: to[0],
      toZ: to[1],
      width: 1.6,
      y,
    })
    // Depend on primitive coords, not the array props (fresh literals each
    // render), so the effect doesn't re-run needlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [from[0], from[1], to[0], to[1], y])

  return (
    <group position={[cx, y, cz]} rotation={[0, -angle, 0]}>
      {/* Plank deck */}
      {Array.from({ length: plankCount }).map((_, i) => {
        const t = (i + 0.5) / plankCount - 0.5
        const offset = t * plankSpan
        const mat = i % 2 === 0 ? PLANK_LIGHT : PLANK_DARK
        return (
          <mesh
            key={i}
            position={[offset, 0.05, 0]}
            castShadow
            receiveShadow
            material={mat}
          >
            <boxGeometry args={[plankDepth * 0.92, 0.06, plankWidth]} />
          </mesh>
        )
      })}
      {/* Underbeams */}
      <mesh position={[0, -0.02, 0.35]} castShadow material={RAIL}>
        <boxGeometry args={[plankSpan + 0.1, 0.08, 0.1]} />
      </mesh>
      <mesh position={[0, -0.02, -0.35]} castShadow material={RAIL}>
        <boxGeometry args={[plankSpan + 0.1, 0.08, 0.1]} />
      </mesh>
      {/* Support posts at each end */}
      <mesh position={[-plankSpan / 2 + 0.1, -0.2, 0.4]} castShadow material={RAIL}>
        <boxGeometry args={[0.1, 0.5, 0.1]} />
      </mesh>
      <mesh position={[-plankSpan / 2 + 0.1, -0.2, -0.4]} castShadow material={RAIL}>
        <boxGeometry args={[0.1, 0.5, 0.1]} />
      </mesh>
      <mesh position={[plankSpan / 2 - 0.1, -0.2, 0.4]} castShadow material={RAIL}>
        <boxGeometry args={[0.1, 0.5, 0.1]} />
      </mesh>
      <mesh position={[plankSpan / 2 - 0.1, -0.2, -0.4]} castShadow material={RAIL}>
        <boxGeometry args={[0.1, 0.5, 0.1]} />
      </mesh>
    </group>
  )
}
