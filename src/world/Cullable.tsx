import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getPlayer } from './playerStore'
import { isWarming } from './warmupStore'

// Distance-cull for whole STATIC STRUCTURES (camps, outlying villages, chests,
// the shop, …) — hide their meshes + freeze their matrices once the player is far
// (fog hides everything past ~45 units anyway), and re-enable on approach.
//
// CRITICAL detail: we must NOT drop the structure's POINT LIGHTS (chests + camp
// campfires each carry one) from the scene. three bakes the scene's light COUNT
// into every material's shader; changing that count forces a recompile of EVERY
// material — a GPU profile pinned the travel stutter to exactly this (shader
// linking at >90% while chests crossed the cull radius).
//
// And keeping the light visible is NOT enough on its own: three's projectObject
// bails on the FIRST invisible ancestor (`if (object.visible === false) return`),
// so a visible light under a hidden parent group is still never gathered — the
// count drops anyway. So we hide only LEAF RENDERABLES (meshes/points/lines) and
// leave every GROUP and every LIGHT visible, keeping each light's whole ancestor
// chain intact. Empty groups cost ~nothing to traverse; a recompile costs frames.
// Matrices still freeze — the lights don't move, so their frozen transform holds.
//
// Cheap: one squared-distance compare per structure per frame; the per-child
// visibility flip only fires on the in↔out transition.
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
    // During the at-load warm-up everything stays shown so the loop renders it.
    const near = isWarming() || dx * dx + dz * dz < DIST_SQ
    if (near === shown.current) return
    shown.current = near
    // Hide only leaf renderables; keep groups + lights visible (see header) so the
    // scene light count — baked into every shader — never changes.
    g.traverse((o) => {
      if (o === g) return
      const r = o as THREE.Mesh & THREE.Points & THREE.Line & THREE.Sprite
      const renderable = r.isMesh || r.isPoints || r.isLine || r.isSprite
      o.visible = renderable ? near : true
    })
    // The group itself stays visible (so its lights are always gathered); freeze
    // its matrices while far since nothing in it moves.
    g.matrixWorldAutoUpdate = near
    if (near) g.updateMatrixWorld(true)
  })

  return <group ref={ref}>{children}</group>
}
