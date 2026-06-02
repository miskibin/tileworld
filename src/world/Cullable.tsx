import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getPlayer } from './playerStore'

// Distance-cull for whole STATIC STRUCTURES (camps, outlying villages, chests,
// the shop, …). The profile's top cost is the three.js scene graph —
// updateMatrixWorld / compose / traverse — run every frame over the WHOLE map,
// including the dozens of structures the player can't see (fog hides everything
// past ~45 units). This wraps a structure in a group that, once the player is
// far, goes invisible AND stops three from updating its matrices or walking its
// subtree (matrixWorldAutoUpdate = false + visible = false). Walking back in
// range re-enables both and forces one matrix refresh, so doors/flames/HP-bars
// and any other animation resume exactly as before — nothing is permanently
// frozen, unlike a static-bake. The cull radius sits well past the fog so big
// props don't pop at the view edge.
//
// Cheap: one squared-distance compare per structure per frame, and the toggle
// only fires on the in↔out transition.
const DIST = 62
const DIST_SQ = DIST * DIST

export function Cullable({ x, z, children }: { x: number; z: number; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null!)
  const shown = useRef(true)

  useFrame(() => {
    const g = ref.current
    if (!g) return
    const p = getPlayer()
    const dx = x - p.x
    const dz = z - p.z
    const near = dx * dx + dz * dz < DIST_SQ
    if (near === shown.current) return
    shown.current = near
    g.visible = near
    g.matrixWorldAutoUpdate = near
    if (near) g.updateMatrixWorld(true) // refresh transforms on re-show
  })

  return <group ref={ref}>{children}</group>
}
