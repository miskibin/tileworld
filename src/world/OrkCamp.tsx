import { useCallback, useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { Tent } from './Tent'
import { Campfire } from './Campfire'
import { createOrk, getAliveOrks } from './orkStore'
import type { OrkVariant } from './orkConfig'
import { FACTION_COLOR } from './orkConfig'
import type { OrkFaction } from './factions'
import { findSpawnNear } from './obstacles'
import { getPlayer } from './playerStore'
import { isFrozen } from './pauseStore'

// After a camp is cleared, its warband returns after this cooldown — but only
// while the player is far enough away that the respawn happens out of sight (the
// cage stays emptied, so rescued heirs never come back; this is combat content).
const CAMP_RESPAWN_DELAY = 60 // seconds
const CAMP_RESPAWN_FAR = 40 // tiles from the camp centre (just past the fog line)

interface Props {
  position: [number, number, number]
  rotation?: number
  seed?: number
  /** warband — orks from opposing factions fight each other */
  faction?: OrkFaction
}

const POLE_GEO = new THREE.CylinderGeometry(0.025, 0.025, 0.8, 5)
const SKULL_GEO = new THREE.BoxGeometry(0.12, 0.13, 0.13)
const POLE_MAT = new THREE.MeshStandardMaterial({ color: '#3a2a1a', roughness: 1 })
const SKULL_MAT = new THREE.MeshStandardMaterial({ color: '#e0d8c0', roughness: 0.85 })

const SPIKES = [
  { x: -0.9, z: 1.4, rot: 0.4 },
  { x: 1.6, z: 1.2, rot: -0.6 },
]

// Local-to-camp ork spawns. A mixed warband: line grunts, a fast scout, a
// berserker, and a support shaman. World coords resolved via camp rotation.
const ORK_SPAWNS: {
  lx: number
  lz: number
  localFacing: number
  variant: OrkVariant
  seedOff: number
}[] = [
  { lx: -0.6, lz: 1.0, localFacing: -1.3, variant: 'grunt', seedOff: 0.5 },
  { lx: 2.6, lz: 1.4, localFacing: 1.0, variant: 'scout', seedOff: 3.4 },
  { lx: -2.0, lz: -0.6, localFacing: -0.5, variant: 'berserker', seedOff: 4.6 },
  { lx: 0.3, lz: 2.4, localFacing: 0.1, variant: 'shaman', seedOff: 5.8 },
]

export function OrkCamp({ position, rotation = 0, seed = 0, faction = 'red' }: Props) {
  const poleRef = useRef<THREE.InstancedMesh>(null!)
  const skullRef = useRef<THREE.InstancedMesh>(null!)
  const spawnedOnce = useRef(false)
  const clearedAt = useRef<number | null>(null)

  // Spawn the camp's warband at world (offset-group) grid coords. Each ork is
  // anchored (home) to the camp centre so it guards here instead of marching on
  // the keep — the player has to ride out to fight it. Shared by the initial mount
  // and the respawn loop below.
  const spawnOrks = useCallback(() => {
    const cos = Math.cos(rotation)
    const sin = Math.sin(rotation)
    for (const s of ORK_SPAWNS) {
      const wx = position[0] + s.lx * cos - s.lz * sin
      const wz = position[2] + s.lx * sin + s.lz * cos
      // Snap to the nearest standable, prop-free tile so orks never spawn on water
      // or wedged inside a tree.
      const spawn = findSpawnNear(wx, wz)
      createOrk(spawn.x, spawn.z, rotation + s.localFacing, s.variant, faction, seed + s.seedOff, {
        x: position[0],
        z: position[2],
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position[0], position[1], position[2], rotation, seed, faction])

  // Initial spawn on mount. NB: depend on primitives, not the `position` array —
  // a fresh array literal each World re-render would re-run this (no cleanup) and
  // stack the camp's orks (the "16 / 8 remaining" bug).
  useEffect(() => {
    spawnOrks()
    spawnedOnce.current = true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [position[0], position[1], position[2], rotation, seed, faction])

  // Respawn loop: once the camp is cleared, wait the cooldown and re-arm the
  // warband — but only while the player is far, so it re-populates out of sight.
  // The cage (CampCage) has already latched `freed`, so heirs never come back;
  // this is renewable combat content so the map isn't stripped after a few nights.
  useFrame(({ clock }) => {
    if (isFrozen() || !spawnedOnce.current) return
    let alive = 0
    for (const o of getAliveOrks()) {
      if (o.home && o.home.x === position[0] && o.home.z === position[2]) alive++
    }
    if (alive > 0) {
      clearedAt.current = null
      return
    }
    const now = clock.getElapsedTime()
    if (clearedAt.current === null) {
      clearedAt.current = now
      return
    }
    const p = getPlayer()
    const far = Math.hypot(p.x - position[0], p.z - position[2]) > CAMP_RESPAWN_FAR
    if (now - clearedAt.current >= CAMP_RESPAWN_DELAY && far) {
      spawnOrks()
      clearedAt.current = null
    }
  })

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

  // Tents tinted toward the warband colour so rival camps read at a glance.
  const tentA = faction === 'blue' ? '#3a4a6a' : '#5a4a38'
  const tentB = faction === 'blue' ? '#2e3a56' : '#4a3a26'

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <Tent position={[-1.1, 0, -0.6]} rotation={0.3} color={tentA} />
      <Tent position={[1.3, 0, 0.4]} rotation={-0.4} color={tentB} />
      <Campfire position={[0.2, 0, 0]} seed={seed + 0.5} />

      {/* Warband banner */}
      <mesh position={[0, 1.5, -1.4]} castShadow material={POLE_MAT}>
        <cylinderGeometry args={[0.03, 0.03, 3, 6]} />
      </mesh>
      <mesh position={[0.45, 2.5, -1.4]}>
        <boxGeometry args={[0.8, 0.5, 0.02]} />
        <meshStandardMaterial color={FACTION_COLOR[faction]} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>

      <instancedMesh ref={poleRef} args={[POLE_GEO, POLE_MAT, SPIKES.length]} castShadow />
      <instancedMesh ref={skullRef} args={[SKULL_GEO, SKULL_MAT, SPIKES.length]} castShadow />
    </group>
  )
}
