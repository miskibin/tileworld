import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getPickups, removePickup, resetPickups } from './pickupStore'
import { isFrozen } from './pauseStore'
import { getPlayer } from './playerStore'
import { addItem, ITEM_DEFS } from './inventoryStore'
import { spawnFloat } from './fxStore'
import { playGoldPickup } from '../audio/sfx'

// Renders + drives the ground-loot pool. Tokens live in grid coords, so this
// must mount inside World's offset group. Each token is a small spinning/bobbing
// box tinted per item; walking within COLLECT_DIST adds it to the hotbar. If the
// bag is full, addItem returns false and the token stays put (no silent loss).

const COLLECT_DIST = 0.9
const BOX = new THREE.BoxGeometry(0.22, 0.22, 0.22)

// Per-item tint so drops read apart at a glance (no <Text>, so it inspects clean
// and survives capture mode).
const TINT: Record<string, string> = {
  fur: '#d8c8a0',
  venom: '#7ad24a',
  goat_charm: '#e0b04a',
  croc_steak: '#b05a4a',
  elk_jerky: '#8a5a34',
  stone_maul: '#9aa0a8',
}

export function Pickups() {
  const groupRef = useRef<THREE.Group>(null!)
  const mats = useMemo(() => {
    const m: Record<string, THREE.MeshStandardMaterial> = {}
    for (const id of Object.keys(TINT)) {
      m[id] = new THREE.MeshStandardMaterial({ color: TINT[id], roughness: 0.5, metalness: 0.2, emissive: TINT[id], emissiveIntensity: 0.25, toneMapped: false })
    }
    return m
  }, [])

  useEffect(() => () => resetPickups(), [])

  useFrame(({ clock }) => {
    if (isFrozen()) return
    const grp = groupRef.current
    if (!grp) return
    const tNow = clock.getElapsedTime()
    const list = getPickups()
    const p = getPlayer()

    // Reconcile children to the pool (cheap — pool is tiny, max 64).
    while (grp.children.length > list.length) grp.remove(grp.children[grp.children.length - 1])
    while (grp.children.length < list.length) {
      const mesh = new THREE.Mesh(BOX, mats.fur)
      mesh.castShadow = true
      grp.add(mesh)
    }

    for (let i = list.length - 1; i >= 0; i--) {
      const pk = list[i]
      const mesh = grp.children[i] as THREE.Mesh
      mesh.material = mats[pk.itemId] ?? mats.fur
      const phase = tNow - pk.born
      mesh.position.set(pk.x, pk.y + 0.45 + Math.sin(phase * 2.5) * 0.08, pk.z)
      mesh.rotation.y = phase * 1.6
      // Collect when the player is close enough.
      if (Math.hypot(p.x - pk.x, p.z - pk.z) < COLLECT_DIST) {
        if (addItem(pk.itemId)) {
          const def = ITEM_DEFS[pk.itemId]
          spawnFloat(`+${def?.name ?? 'Item'}`, '#9be88a', pk.x, pk.y + 1.4, pk.z)
          playGoldPickup()
          removePickup(pk.id)
        }
        // else: bag full → leave it on the ground.
      }
    }
  })

  return <group ref={groupRef} />
}
