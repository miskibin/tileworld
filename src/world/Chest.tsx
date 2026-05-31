import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import { isPaused } from './pauseStore'
import { isShopOpen } from './shopStore'
import { getPlayer, addGold } from './playerStore'
import { addItem } from './inventoryStore'
import { spawnFloat } from './fxStore'
import { playChestOpen } from '../audio/sfx'
import { findSpawnNear } from './obstacles'
import { tileAt, tileTopY } from './tileMap'

interface ChestProps {
  position: [number, number, number]
  rotation?: number
  /** items granted when opened (item ids from ITEM_DEFS) */
  loot?: string[]
  /** gold granted when opened */
  gold?: number
}

const WOOD = new THREE.MeshStandardMaterial({ color: '#7a4a24', roughness: 0.9, flatShading: true })
const WOOD_DARK = new THREE.MeshStandardMaterial({ color: '#5a3418', roughness: 1, flatShading: true })
const IRON = new THREE.MeshStandardMaterial({ color: '#b8b8c0', roughness: 0.5, metalness: 0.7 })
const LOCK = new THREE.MeshStandardMaterial({ color: '#e0b04a', roughness: 0.5, metalness: 0.6, toneMapped: false })

const INTERACT_DIST = 2.2

export function Chest({ position, rotation = 0, loot = [], gold = 0 }: ChestProps) {
  // Snap to valid land so chests placed in the expanded coastline can't float
  // on water. Resolved once from the requested spot.
  const pos = useMemo<[number, number, number]>(() => {
    const s = findSpawnNear(position[0], position[2])
    const tile = tileAt(Math.floor(s.x), Math.floor(s.z))
    return [s.x, tile ? tileTopY(Math.floor(s.x), Math.floor(s.z)) : position[1], s.z]
  }, [position])

  const lidRef = useRef<THREE.Group>(null!)
  const promptRef = useRef<THREE.Group>(null!)
  const glowRef = useRef<THREE.PointLight>(null!)
  const inRange = useRef(false)
  const [opened, setOpened] = useState(false)
  const lidAngle = useRef(0)

  useFrame(() => {
    if (isPaused()) return
    const p = getPlayer()
    const near = Math.hypot(p.x - pos[0], p.z - pos[2]) < INTERACT_DIST
    inRange.current = near
    if (promptRef.current) promptRef.current.visible = near && !opened && !isShopOpen()

    // Animate the lid opening (ease toward target angle).
    const target = opened ? -Math.PI * 0.6 : 0
    lidAngle.current += (target - lidAngle.current) * 0.15
    if (lidRef.current) lidRef.current.rotation.x = lidAngle.current
    if (glowRef.current) glowRef.current.intensity = opened ? 0.6 : 0
  })

  // F to open when in range.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyF' || opened || !inRange.current || isShopOpen() || isPaused()) return
      setOpened(true)
      playChestOpen()
      if (gold > 0) {
        addGold(gold)
        spawnFloat(`+${gold} ★`, '#ffd58c', pos[0], pos[1] + 1.6, pos[2])
      }
      loot.forEach((id, i) => {
        const ok = addItem(id)
        if (ok) spawnFloat('+1 item', '#9be88a', pos[0] + (i - loot.length / 2) * 0.4, pos[1] + 1.2 + i * 0.3, pos[2])
      })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [opened, gold, loot, pos])

  return (
    <group position={pos} rotation={[0, rotation, 0]}>
      {/* Base box */}
      <mesh position={[0, 0.18, 0]} castShadow receiveShadow material={WOOD}>
        <boxGeometry args={[0.7, 0.36, 0.5]} />
      </mesh>
      {/* Iron bands on the base */}
      <mesh position={[-0.22, 0.18, 0]} material={WOOD_DARK}>
        <boxGeometry args={[0.06, 0.38, 0.52]} />
      </mesh>
      <mesh position={[0.22, 0.18, 0]} material={WOOD_DARK}>
        <boxGeometry args={[0.06, 0.38, 0.52]} />
      </mesh>
      {/* Lid — pivots at the back-top edge */}
      <group ref={lidRef} position={[0, 0.36, -0.25]}>
        <mesh position={[0, 0.08, 0.25]} castShadow material={WOOD}>
          <boxGeometry args={[0.7, 0.18, 0.5]} />
        </mesh>
        <mesh position={[-0.22, 0.08, 0.25]} material={WOOD_DARK}>
          <boxGeometry args={[0.06, 0.2, 0.52]} />
        </mesh>
        <mesh position={[0.22, 0.08, 0.25]} material={WOOD_DARK}>
          <boxGeometry args={[0.06, 0.2, 0.52]} />
        </mesh>
        {/* Latch */}
        <mesh position={[0, 0.0, 0.5]} material={LOCK}>
          <boxGeometry args={[0.12, 0.12, 0.04]} />
        </mesh>
      </group>
      {/* Front lock plate */}
      <mesh position={[0, 0.2, 0.255]} material={IRON}>
        <boxGeometry args={[0.1, 0.14, 0.02]} />
      </mesh>

      {/* Treasure glow once opened */}
      <pointLight ref={glowRef} position={[0, 0.4, 0]} color="#ffd58c" intensity={0} distance={3} />

      {/* "Press F" prompt */}
      <group ref={promptRef} position={[0, 1.1, 0]} visible={false}>
        <Text fontSize={0.2} color="#fff5cc" anchorX="center" anchorY="middle" outlineColor="#000" outlineWidth={0.02}>
          Press F to open
        </Text>
      </group>
    </group>
  )
}
