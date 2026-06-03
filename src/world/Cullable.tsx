import { useRef, type ReactNode } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getPlayer } from './playerStore'

// Distance-cull for whole STATIC STRUCTURES (camps, outlying villages, chests,
// the shop, …) — hide their meshes + freeze their matrices once the player is far
// (fog hides everything past ~45 units anyway), and re-enable on approach.
//
// CRITICAL detail: we must NOT hide the structure's POINT LIGHTS (chests + camp
// campfires each carry one). three bakes the scene's light COUNT into every
// material's shader; toggling a light's visibility changes that count and forces
// a recompile of EVERY material — and a GPU profile showed exactly that
// (getProgramInfoLog at 93% while travelling, as chests culled in/out). So lights
// stay visible (a stable count = compile once; they're ~free on any real GPU),
// while only the meshes hide. Matrices still freeze — the lights don't move, so
// their frozen world transform stays correct.
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
    const near = dx * dx + dz * dz < DIST_SQ
    if (near === shown.current) return
    shown.current = near
    // Hide every mesh but keep lights visible so the scene light count is stable.
    g.traverse((o) => {
      if (o === g) return
      o.visible = (o as THREE.Light).isLight ? true : near
    })
    // The group itself stays visible (so its lights are always gathered); freeze
    // its matrices while far since nothing in it moves.
    g.matrixWorldAutoUpdate = near
    if (near) g.updateMatrixWorld(true)
  })

  return <group ref={ref}>{children}</group>
}
