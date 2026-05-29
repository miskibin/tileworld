import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text, Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import { isPaused } from './pauseStore'
import { getPlayer, spendGold } from './playerStore'
import { openShop, closeShop, isShopOpen, type ShopItem } from './shopStore'
import { addItem } from './inventoryStore'
import { getUnlockedWeapons } from './weaponUnlockStore'

interface ShopProps {
  /** village grid-space anchor */
  position: [number, number, number]
  rotation?: number
}

const WALL_W = 2.8
const WALL_H = 1.5
const WALL_D = 2.2
const FOUND_H = 0.2

const WALL_MAT = new THREE.MeshStandardMaterial({ color: '#cdb78d', roughness: 0.95, flatShading: true })
const ROOF_MAT = new THREE.MeshStandardMaterial({ color: '#3a5f4a', roughness: 0.85, flatShading: true })
const STONE_MAT = new THREE.MeshStandardMaterial({ color: '#6e6e76', roughness: 0.95 })
const FRAME_MAT = new THREE.MeshStandardMaterial({ color: '#5a3a22', roughness: 1 })
const COUNTER_MAT = new THREE.MeshStandardMaterial({ color: '#7a5a3a', roughness: 1 })
const SIGN_MAT = new THREE.MeshStandardMaterial({ color: '#6b3322', roughness: 1 })
const GOLD_MAT = new THREE.MeshStandardMaterial({
  color: '#e0b04a',
  emissive: '#5a3a18',
  emissiveIntensity: 0.4,
  roughness: 0.6,
  metalness: 0.6,
  toneMapped: false,
})

const INTERACT_DIST = 2.6

// Buying adds the item to the player's hotbar (right-click to consume → heal).
// apply() fails if the player can't afford it or the bag is full.
function buy(price: number, itemId: string): boolean {
  if (!spendGold(price)) return false
  if (!addItem(itemId)) {
    // Bag full — refund and reject so gold isn't lost.
    spendGold(-price)
    return false
  }
  return true
}

const SHOP_ITEMS: ShopItem[] = [
  { id: 'bread', name: 'Bread', icon: '🍞', price: 4, apply: () => buy(4, 'bread') },
  { id: 'potion', name: 'Health Potion', icon: '🧪', price: 12, apply: () => buy(12, 'potion') },
  { id: 'feast', name: 'Tavern Feast', icon: '🍖', price: 28, apply: () => buy(28, 'feast') },
]

// Weapons that the Arsenal upgrade branch can unlock for sale. Added to the
// shop list at open-time only once their id is in weaponUnlockStore.
const WEAPON_CATALOG: Record<string, { name: string; icon: string; price: number }> = {
  axe: { name: 'Battle Axe', icon: '🪓', price: 45 },
  sword_gold: { name: 'Golden Blade', icon: '🗡️', price: 80 },
}

/** Base consumables plus any weapons the Arsenal branch has unlocked. */
function buildShopItems(): ShopItem[] {
  const items = [...SHOP_ITEMS]
  for (const id of getUnlockedWeapons()) {
    const def = WEAPON_CATALOG[id]
    if (def) items.push({ id, name: def.name, icon: def.icon, price: def.price, apply: () => buy(def.price, id) })
  }
  return items
}

export function Shop({ position, rotation = 0 }: ShopProps) {
  const promptRef = useRef<THREE.Group>(null!)
  const inRangeRef = useRef(false)

  const promptText = useMemo(() => 'Press E to shop', [])

  // Keep an up-to-date "in range" flag; key handler reads it.
  useFrame(() => {
    if (isPaused()) return
    const p = getPlayer()
    const dx = p.x - position[0]
    const dz = p.z - position[2]
    const inRange = Math.hypot(dx, dz) < INTERACT_DIST
    inRangeRef.current = inRange
    if (promptRef.current) promptRef.current.visible = inRange && !isShopOpen()
  })

  // E to open / close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE') return
      if (isShopOpen()) {
        closeShop()
        return
      }
      if (!inRangeRef.current) return
      openShop({ id: `${position[0]},${position[2]}`, title: 'Wandering Merchant', items: buildShopItems() })
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [position])

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Foundation */}
      <mesh position={[0, FOUND_H / 2, 0]} castShadow receiveShadow material={STONE_MAT}>
        <boxGeometry args={[WALL_W + 0.2, FOUND_H, WALL_D + 0.2]} />
      </mesh>
      {/* Back wall */}
      <mesh position={[0, FOUND_H + WALL_H / 2, -WALL_D / 2 + 0.05]} castShadow receiveShadow material={WALL_MAT}>
        <boxGeometry args={[WALL_W, WALL_H, 0.1]} />
      </mesh>
      {/* Side walls */}
      <mesh position={[-WALL_W / 2 + 0.05, FOUND_H + WALL_H / 2, 0]} castShadow receiveShadow material={WALL_MAT}>
        <boxGeometry args={[0.1, WALL_H, WALL_D]} />
      </mesh>
      <mesh position={[WALL_W / 2 - 0.05, FOUND_H + WALL_H / 2, 0]} castShadow receiveShadow material={WALL_MAT}>
        <boxGeometry args={[0.1, WALL_H, WALL_D]} />
      </mesh>
      {/* Counter on the open (+Z) side */}
      <mesh position={[0, FOUND_H + 0.55, WALL_D / 2 - 0.1]} castShadow material={COUNTER_MAT}>
        <boxGeometry args={[WALL_W - 0.2, 0.55, 0.18]} />
      </mesh>
      {/* Counter posts — full height to carry the roof's front edge */}
      <mesh position={[-WALL_W / 2 + 0.12, FOUND_H + WALL_H / 2, WALL_D / 2 - 0.1]} castShadow material={FRAME_MAT}>
        <boxGeometry args={[0.12, WALL_H, 0.12]} />
      </mesh>
      <mesh position={[WALL_W / 2 - 0.12, FOUND_H + WALL_H / 2, WALL_D / 2 - 0.1]} castShadow material={FRAME_MAT}>
        <boxGeometry args={[0.12, WALL_H, 0.12]} />
      </mesh>
      {/* Front header beam — closes the gap between counter and roof so the
          stall reads as a solid structure rather than a floating roof. */}
      <mesh position={[0, FOUND_H + WALL_H - 0.06, WALL_D / 2 - 0.1]} castShadow material={FRAME_MAT}>
        <boxGeometry args={[WALL_W - 0.1, 0.18, 0.12]} />
      </mesh>
      {/* A few gold coin piles on the counter for flavour */}
      <mesh position={[-0.6, FOUND_H + 0.86, WALL_D / 2 - 0.1]} castShadow material={GOLD_MAT}>
        <cylinderGeometry args={[0.07, 0.07, 0.06, 8]} />
      </mesh>
      <mesh position={[0.55, FOUND_H + 0.86, WALL_D / 2 - 0.1]} castShadow material={GOLD_MAT}>
        <cylinderGeometry args={[0.08, 0.08, 0.08, 8]} />
      </mesh>
      <mesh position={[0.55, FOUND_H + 0.94, WALL_D / 2 - 0.1]} material={GOLD_MAT}>
        <cylinderGeometry args={[0.05, 0.05, 0.04, 8]} />
      </mesh>
      {/* Roof — gently pitched slab seated on the walls + header beam, with a
          modest eave overhang (no longer a steep detached slab). */}
      <mesh position={[0, FOUND_H + WALL_H + 0.12, 0]} rotation={[0.18, 0, 0]} castShadow material={ROOF_MAT}>
        <boxGeometry args={[WALL_W + 0.3, 0.1, WALL_D + 0.5]} />
      </mesh>
      {/* Sign post + sign board */}
      <mesh position={[WALL_W / 2 + 0.3, FOUND_H + 0.9, WALL_D / 2 - 0.1]} castShadow material={FRAME_MAT}>
        <boxGeometry args={[0.06, 1.6, 0.06]} />
      </mesh>
      <mesh position={[WALL_W / 2 + 0.3, FOUND_H + 1.45, WALL_D / 2 - 0.1]} castShadow material={SIGN_MAT}>
        <boxGeometry args={[0.7, 0.32, 0.05]} />
      </mesh>
      <Text
        position={[WALL_W / 2 + 0.3, FOUND_H + 1.45, WALL_D / 2 - 0.07]}
        fontSize={0.16}
        color="#f3e2b6"
        anchorX="center"
        anchorY="middle"
      >
        SHOP
      </Text>
      {/* Gentle gold sparkle above the counter */}
      <Sparkles
        position={[0, FOUND_H + 1.0, WALL_D / 2 - 0.1]}
        scale={[1.2, 0.4, 0.3]}
        count={10}
        size={3}
        speed={0.2}
        opacity={0.5}
        color={'#ffd58c'}
        noise={1.0}
      />

      {/* "Press E" prompt floating above the sign */}
      <group ref={promptRef} position={[0, FOUND_H + 2.2, 0]} visible={false}>
        <Text fontSize={0.22} color="#fff5cc" anchorX="center" anchorY="middle" outlineColor="#000" outlineWidth={0.02}>
          {promptText}
        </Text>
      </group>
    </group>
  )
}
