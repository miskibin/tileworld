import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard } from '@react-three/drei'
import * as THREE from 'three'
import { tileAt } from './tileMap'
import { obstacleCollidesAt } from './obstacles'
import { createDog, getDogs, resetDogs, type DogState } from './dogStore'
import { isCulled } from './cull'

const DOG_PALETTES: { body: string; dark: string }[] = [
  { body: '#8a5a3a', dark: '#5a3a22' },
  { body: '#c8a47a', dark: '#8a6a44' },
  { body: '#3a2a22', dark: '#1c1410' },
  { body: '#e8dec0', dark: '#a89878' },
]
const NOSE = new THREE.MeshStandardMaterial({ color: '#1a1410', roughness: 0.6 })
const EYE = new THREE.MeshStandardMaterial({ color: '#1a1410', roughness: 0.4 })

function makeMats(p: { body: string; dark: string }) {
  return {
    body: new THREE.MeshStandardMaterial({ color: p.body, roughness: 0.85 }),
    dark: new THREE.MeshStandardMaterial({ color: p.dark, roughness: 0.95 }),
  }
}

const DOG_MATS = DOG_PALETTES.map(makeMats)

// Health bar (shared mats / geos)
const HP_BAR_BG = new THREE.MeshBasicMaterial({ color: '#1a1410', toneMapped: false })
const HP_BAR_FG = new THREE.MeshBasicMaterial({ color: '#d63a3a', toneMapped: false })
const HP_BAR_GEO = new THREE.PlaneGeometry(1, 1)

const DOG_SPEED = 1.3
const DOG_RADIUS = 0.15
const HP_BAR_WIDTH = 0.5
const HP_BAR_HEIGHT = 0.06

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return a + d * t
}

function randomNearbyLand(x: number, z: number, range: number, rand: () => number): { x: number; z: number } | null {
  for (let tries = 0; tries < 12; tries++) {
    const a = rand() * Math.PI * 2
    const r = 1.5 + rand() * range
    const nx = x + Math.cos(a) * r
    const nz = z + Math.sin(a) * r
    const tile = tileAt(Math.floor(nx), Math.floor(nz))
    if (tile && tile.height < 2 && tile.biome !== 'rock') return { x: nx, z: nz }
  }
  return null
}

interface DogViewProps {
  state: DogState
}

function DogView({ state }: DogViewProps) {
  const mats = DOG_MATS[state.paletteIndex % DOG_MATS.length]
  const groupRef = useRef<THREE.Group>(null!)
  const tailRef = useRef<THREE.Group>(null!)
  const headRef = useRef<THREE.Group>(null!)
  const lfRef = useRef<THREE.Group>(null!)
  const rfRef = useRef<THREE.Group>(null!)
  const lbRef = useRef<THREE.Group>(null!)
  const rbRef = useRef<THREE.Group>(null!)
  const hpFgRef = useRef<THREE.Mesh>(null!)
  const billboardGroupRef = useRef<THREE.Group>(null!)

  // Per-dog rng
  const rand = useMemo(() => {
    let s = Math.floor(state.seed * 1337) >>> 0
    return () => {
      s = (s + 0x6d2b79f5) >>> 0
      let t = s
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
  }, [state.seed])

  // Death fade
  const [visible, setVisible] = useState(true)
  const deadFadeFrom = useRef<number | null>(null)

  useFrame(({ clock }, dt) => {
    const t = clock.getElapsedTime()
    const s = state

    // Distance cull: far dogs are fog-hidden — hide + skip AI/animation work.
    const grp = groupRef.current
    if (s.hp > 0 && grp && isCulled(s.x, s.z)) {
      if (grp.visible) grp.visible = false
      return
    } else if (grp && !grp.visible) {
      grp.visible = true
    }

    // Dead-fade
    if (s.hp <= 0) {
      if (deadFadeFrom.current === null) deadFadeFrom.current = t
      const elapsed = t - deadFadeFrom.current
      const opacity = Math.max(0, 1 - elapsed / 1.2)
      const sink = Math.min(0.3, elapsed * 0.25)
      if (groupRef.current) {
        groupRef.current.position.y = s.y - sink
        groupRef.current.rotation.z = Math.min(Math.PI / 2, elapsed * 2.5)
      }
      // crude fade — toggle visible off after fade-out
      if (opacity <= 0 && visible) setVisible(false)
      return
    }

    // AI: pick target if idle expired
    if (!s.target && t >= s.idleUntil) {
      s.target = randomNearbyLand(s.x, s.z, 6, rand)
    }

    let moving = false
    if (s.target) {
      const dx = s.target.x - s.x
      const dz = s.target.z - s.z
      const d = Math.hypot(dx, dz)
      if (d < 0.25) {
        s.target = null
        s.idleUntil = t + 1.5 + rand() * 3.5
      } else {
        moving = true
        const step = DOG_SPEED * dt
        const stepX = (dx / d) * step
        const stepZ = (dz / d) * step
        const nx = s.x + stepX
        const nz = s.z + stepZ
        const tNX = tileAt(Math.floor(nx), Math.floor(s.z))
        const tNZ = tileAt(Math.floor(s.x), Math.floor(nz))
        if (tNX && tNX.height < 2 && !obstacleCollidesAt(nx, s.z, DOG_RADIUS)) s.x = nx
        if (tNZ && tNZ.height < 2 && !obstacleCollidesAt(s.x, nz, DOG_RADIUS)) s.z = nz
        s.facing = lerpAngle(s.facing, Math.atan2(stepX, stepZ), Math.min(1, dt * 8))
      }
    }
    s.moving = moving

    const tile = tileAt(Math.floor(s.x), Math.floor(s.z))
    s.y = tile ? tile.height : 1

    if (groupRef.current) {
      groupRef.current.position.set(s.x, s.y, s.z)
      groupRef.current.rotation.y = s.facing
    }
    if (tailRef.current) tailRef.current.rotation.y = Math.sin(t * (moving ? 14 : 6) + s.seed) * 0.6
    if (headRef.current) headRef.current.rotation.y = moving ? 0 : Math.sin(t * 1.2 + s.seed) * 0.35

    const swing = moving ? Math.sin(t * 12 + s.seed) * 0.65 : 0
    if (lfRef.current) lfRef.current.rotation.x = swing
    if (rfRef.current) rfRef.current.rotation.x = -swing
    if (lbRef.current) lbRef.current.rotation.x = -swing
    if (rbRef.current) rbRef.current.rotation.x = swing

    // HP bar update
    if (billboardGroupRef.current) {
      const showBar = s.hp < s.maxHp
      billboardGroupRef.current.visible = showBar
      if (showBar && hpFgRef.current) {
        const ratio = Math.max(0, s.hp / s.maxHp)
        hpFgRef.current.scale.x = ratio
        // Anchor left edge: shift right by (1-ratio)/2 of bar width
        hpFgRef.current.position.x = -((1 - ratio) * HP_BAR_WIDTH) / 2
        // Flash color while hurt
        if (t < s.hurtFlashUntil) {
          ;(hpFgRef.current.material as THREE.MeshBasicMaterial).color.set('#ffaa20')
        } else {
          ;(hpFgRef.current.material as THREE.MeshBasicMaterial).color.set('#d63a3a')
        }
      }
    }
  })

  if (!visible) return null

  return (
    <group ref={groupRef} position={[state.x, state.y, state.z]} scale={0.4}>
      <mesh position={[0, 0.55, 0]} castShadow material={mats.body}>
        <boxGeometry args={[0.32, 0.3, 0.6]} />
      </mesh>
      <mesh position={[0, 0.71, 0]} castShadow material={mats.dark}>
        <boxGeometry args={[0.33, 0.04, 0.5]} />
      </mesh>
      <group ref={headRef} position={[0, 0.66, 0.34]}>
        <mesh castShadow material={mats.body}>
          <boxGeometry args={[0.3, 0.3, 0.28]} />
        </mesh>
        <mesh position={[0, -0.06, 0.18]} castShadow material={mats.body}>
          <boxGeometry args={[0.18, 0.16, 0.16]} />
        </mesh>
        <mesh position={[0, -0.06, 0.27]} material={NOSE}>
          <boxGeometry args={[0.07, 0.05, 0.04]} />
        </mesh>
        <mesh position={[-0.13, 0.04, -0.04]} rotation={[0.3, 0, -0.4]} castShadow material={mats.dark}>
          <boxGeometry args={[0.05, 0.18, 0.1]} />
        </mesh>
        <mesh position={[0.13, 0.04, -0.04]} rotation={[0.3, 0, 0.4]} castShadow material={mats.dark}>
          <boxGeometry args={[0.05, 0.18, 0.1]} />
        </mesh>
        <mesh position={[-0.08, 0.02, 0.145]} material={EYE}>
          <boxGeometry args={[0.03, 0.03, 0.008]} />
        </mesh>
        <mesh position={[0.08, 0.02, 0.145]} material={EYE}>
          <boxGeometry args={[0.03, 0.03, 0.008]} />
        </mesh>
      </group>
      <group ref={lfRef} position={[-0.11, 0.4, 0.2]}>
        <mesh position={[0, -0.2, 0]} castShadow material={mats.body}>
          <boxGeometry args={[0.08, 0.4, 0.08]} />
        </mesh>
      </group>
      <group ref={rfRef} position={[0.11, 0.4, 0.2]}>
        <mesh position={[0, -0.2, 0]} castShadow material={mats.body}>
          <boxGeometry args={[0.08, 0.4, 0.08]} />
        </mesh>
      </group>
      <group ref={lbRef} position={[-0.11, 0.4, -0.2]}>
        <mesh position={[0, -0.2, 0]} castShadow material={mats.body}>
          <boxGeometry args={[0.08, 0.4, 0.08]} />
        </mesh>
      </group>
      <group ref={rbRef} position={[0.11, 0.4, -0.2]}>
        <mesh position={[0, -0.2, 0]} castShadow material={mats.body}>
          <boxGeometry args={[0.08, 0.4, 0.08]} />
        </mesh>
      </group>
      <group ref={tailRef} position={[0, 0.62, -0.32]}>
        <mesh position={[0, 0.08, -0.06]} rotation={[0.5, 0, 0]} castShadow material={mats.body}>
          <cylinderGeometry args={[0.03, 0.022, 0.22, 5]} />
        </mesh>
      </group>

      {/* Health bar — billboard so it always faces camera */}
      <group ref={billboardGroupRef} position={[0, 2.6, 0]} visible={false}>
        <Billboard follow>
          <mesh material={HP_BAR_BG} geometry={HP_BAR_GEO} scale={[HP_BAR_WIDTH + 0.04, HP_BAR_HEIGHT + 0.025, 1]} />
          <mesh
            ref={hpFgRef}
            material={HP_BAR_FG}
            geometry={HP_BAR_GEO}
            position={[0, 0, 0.001]}
            scale={[HP_BAR_WIDTH, HP_BAR_HEIGHT, 1]}
          />
        </Billboard>
      </group>
    </group>
  )
}

const DOG_SPAWNS: Array<{ pos: [number, number]; palette: number; seed: number }> = [
  { pos: [34, 28], palette: 0, seed: 1.1 },
  { pos: [30, 30], palette: 1, seed: 2.3 },
  { pos: [38, 26], palette: 2, seed: 3.5 },
  { pos: [26, 24], palette: 3, seed: 4.7 },
  { pos: [40, 30], palette: 0, seed: 5.9 },
  { pos: [22, 28], palette: 1, seed: 7.2 },
]

export function Wildlife() {
  const [dogs, setDogs] = useState<DogState[]>([])

  useEffect(() => {
    resetDogs()
    const created = DOG_SPAWNS.map((d) => createDog(d.pos[0], d.pos[1], d.palette, d.seed))
    setDogs(created)
    return () => {
      // Leave state alive on hot-reload; reset on next mount.
    }
  }, [])

  // Touch getDogs to keep linter happy if needed
  void getDogs

  return (
    <group>
      {dogs.map((d) => (
        <DogView key={d.id} state={d} />
      ))}
    </group>
  )
}
