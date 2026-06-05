import { useEffect, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { findSpawnNear } from './obstacles'
import { isFrozen } from './pauseStore'
import { cullVisible, isCulled } from './cull'
import { getPlayer } from './playerStore'
import { addItem } from './inventoryStore'
import { spawnFloat } from './fxStore'
import { playGold } from '../audio/sfx'
import type { ForageStore, ForageState } from './forageStore'

// One generic forage field drives every walk-up-to-gather resource (marsh herbs,
// forest apples): deterministic placement + tile-snap, gentle idle sway, distance
// culling (matrix-frozen, not just hidden), and proximity pickup. Each resource
// supplies only its model, item, float, reach, sway and store via ForageConfig —
// so adding a new foragable is a config, not another copy of this loop.

export interface ForageConfig {
  /** the plant mesh (authored with its base on y=0) */
  Model: ComponentType
  /** inventory item id granted on pickup */
  item: string
  /** the module-level ForageStore instance backing this resource */
  store: ForageStore
  /** pickup reach in tiles */
  harvestR: number
  /** floating "+item" pickup text */
  float: { text: string; color: string; y: number }
  /** idle sway tuning (rad/s, rad) */
  sway: { freq: number; amp: number }
  /** grid-space spawn points; each is snapped onto a standable tile */
  spawns: () => Array<{ x: number; z: number; seed: number }>
}

function ForageView({ state, config }: { state: ForageState; config: ForageConfig }) {
  const groupRef = useRef<THREE.Group>(null!)
  const [taken, setTaken] = useState(false)
  const { Model, item, store, float, sway } = config
  const r2 = config.harvestR * config.harvestR

  useFrame(({ clock }) => {
    if (isFrozen()) return
    const g = groupRef.current
    if (!g) return
    if (taken) return
    // Freeze the (static) plant's matrix while far — cullVisible flips
    // matrixWorldAutoUpdate off so three skips the subtree, not just hide it.
    const culled = isCulled(state.x, state.z)
    cullVisible(g, culled)
    if (culled) return
    g.rotation.z = Math.sin(clock.getElapsedTime() * sway.freq + state.seed * 6) * sway.amp

    // Forage on proximity (no swing needed).
    const p = getPlayer()
    const dx = p.x - state.x
    const dz = p.z - state.z
    if (dx * dx + dz * dz < r2) {
      if (addItem(item, 1)) {
        store.collect(state)
        // 0.7 (not the crit-sized 1.3): the label is long ("+🌿 Marsh Herb") and
        // world-space, so it spawns right under the camera on pickup — at 1.3 it
        // filled a third of the screen. Smaller keeps it readable, not a banner.
        spawnFloat(float.text, float.color, state.x, state.y + float.y, state.z, 0.7)
        playGold()
        setTaken(true)
      }
    }
  })

  if (taken) return null
  return (
    <group ref={groupRef} position={[state.x, state.y, state.z]}>
      <Model />
    </group>
  )
}

export function ForageField({ config }: { config: ForageConfig }) {
  const [plants, setPlants] = useState<ForageState[]>([])
  useEffect(() => {
    const handle = requestAnimationFrame(() => {
      config.store.reset()
      setPlants(
        config.spawns().map((s) => {
          const snapped = findSpawnNear(s.x, s.z)
          return config.store.create(snapped.x, snapped.z, s.seed)
        }),
      )
    })
    return () => {
      cancelAnimationFrame(handle)
      config.store.reset()
    }
    // config is a stable module-level literal; place once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <group>
      {plants.map((pl) => (
        <ForageView key={pl.id} state={pl} config={config} />
      ))}
    </group>
  )
}
