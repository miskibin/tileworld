import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { Tent } from './Tent'
import { Campfire } from './Campfire'
import { createOrk } from './orkStore'
import { findSpawnNear } from './obstacles'

interface Props {
  position: [number, number, number]
  rotation?: number
  seed?: number
}

const POLE_GEO = new THREE.CylinderGeometry(0.025, 0.025, 0.8, 5)
const SKULL_GEO = new THREE.BoxGeometry(0.12, 0.13, 0.13)
const POLE_MAT = new THREE.MeshStandardMaterial({ color: '#3a2a1a', roughness: 1 })
const SKULL_MAT = new THREE.MeshStandardMaterial({ color: '#e0d8c0', roughness: 0.85 })

const SPIKES = [
  { x: -0.9, z: 1.4, rot: 0.4 },
  { x: 1.6, z: 1.2, rot: -0.6 },
]

// Local-to-camp ork spawn positions. World coords resolved via camp rotation.
const ORK_SPAWNS = [
  { lx: -0.6, lz: 1.0, localFacing: -1.3, variant: 0, seedOff: 0.5 },
  { lx: 1.7, lz: -0.9, localFacing: 2.4, variant: 1, seedOff: 2.1 },
]

export function OrkCamp({ position, rotation = 0, seed = 0 }: Props) {
  const poleRef = useRef<THREE.InstancedMesh>(null!)
  const skullRef = useRef<THREE.InstancedMesh>(null!)

  // Register orks at world (offset-group) grid coords on mount.
  useEffect(() => {
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    for (const s of ORK_SPAWNS) {
      const wx = position[0] + s.lx * cos - s.lz * sin
      const wz = position[2] + s.lx * sin + s.lz * cos
      const wFacing = rotation + s.localFacing
      // Snap to the nearest standable, prop-free tile so orks never spawn on
      // water or wedged inside a tree.
      const spawn = findSpawnNear(wx, wz)
      createOrk(spawn.x, spawn.z, wFacing, s.variant, seed + s.seedOff)
    }
    // No cleanup here — Mobs handles a global reset on remount.
    // NB: depend on primitive values, not the `position` array — a fresh array
    // literal is passed on every World re-render, and an array dep would re-run
    // this effect (with no cleanup) and re-spawn the camp's orks each time,
    // stacking them (the "16 / 8 remaining" bug).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position[0], position[1], position[2], rotation, seed])

  useEffect(() => {
    const pm = poleRef.current
    const sm = skullRef.current
    if (!pm || !sm) return
    const dummy = new THREE.Object3D()
    SPIKES.forEach((s, i) => {
      dummy.position.set(s.x, 0.4, s.z)
      dummy.rotation.set(0, s.rot, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      pm.setMatrixAt(i, dummy.matrix)
      dummy.position.set(s.x, 0.85, s.z)
      dummy.updateMatrix()
      sm.setMatrixAt(i, dummy.matrix)
    })
    pm.instanceMatrix.needsUpdate = true
    sm.instanceMatrix.needsUpdate = true
  }, [])

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Tent position={[-1.1, 0, -0.6]} rotation={0.3} color="#5a4a38" />
      <Tent position={[1.3, 0, 0.4]} rotation={-0.4} color="#4a3a26" />
      <Campfire position={[0.2, 0, 0]} seed={seed + 0.5} />

      <instancedMesh ref={poleRef} args={[POLE_GEO, POLE_MAT, SPIKES.length]} castShadow />
      <instancedMesh ref={skullRef} args={[SKULL_GEO, SKULL_MAT, SPIKES.length]} castShadow />
    </group>
  )
}
