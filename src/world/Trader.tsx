import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'
import type { TraderState, TraderStateName } from './traderStore'
import { nearestTrader, subscribeTraders } from './traderStore'
import { isFrozen, isPaused } from './pauseStore'
import { findPath } from './pathfinding'
import { getPlayer } from './playerStore'
import { cullVisible, isCulled } from './cull'
import { openShop, closeShop, isShopOpen } from './shopStore'
import { buildShopItems } from './shopCatalog'
import { hasItem } from './inventoryStore'
import { recruitTrader, RECRUIT_ITEM } from './recruit'
import { spawnFloat } from './fxStore'
import { playLevelUp } from '../audio/sfx'

// Merchant NPCs: same body rig as a villager (so the wander animation is shared)
// but a distinct palette + apron/satchel/headwrap so they read as traders, not
// townsfolk. They never fight — no guard/combat path here.

const SKIN_TONES = ['#dca78a', '#c08866', '#a36b4a']
// Rich dyed robes (vs. the villagers' plain tunics) — a trader looks prosperous.
const ROBE_COLORS = ['#2f6f6a', '#7a2f3a', '#3a4a8a', '#6a4a8a']
const APRON_COLOR = '#b9925a'
const PANT_COLOR = '#2a2418'
const WRAP_COLORS = ['#c87a2a', '#9a3a2a', '#caa23a']
const HAIR_COLOR = '#2a1c12'
const PACK_COLOR = '#5a3a22'
const POUCH_COLOR = '#caa23a'

const SKIN_MATS = SKIN_TONES.map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true }),
)
const ROBE_MATS = ROBE_COLORS.map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.85, flatShading: true }),
)
const WRAP_MATS = WRAP_COLORS.map(
  (c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true }),
)
const APRON_MAT = new THREE.MeshStandardMaterial({ color: APRON_COLOR, roughness: 1, flatShading: true })
const PANT_MAT = new THREE.MeshStandardMaterial({ color: PANT_COLOR, roughness: 1 })
const HAIR_MAT = new THREE.MeshStandardMaterial({ color: HAIR_COLOR, roughness: 0.85 })
const PACK_MAT = new THREE.MeshStandardMaterial({ color: PACK_COLOR, roughness: 1, flatShading: true })
const POUCH_MAT = new THREE.MeshStandardMaterial({
  color: POUCH_COLOR,
  roughness: 0.5,
  metalness: 0.5,
  flatShading: true,
})

const SPEED = 1.4
const WANDER_RADIUS = 2.2
const ARRIVE_DIST = 0.35
const WAYPOINT_DIST = 0.4
const PATH_RECOMPUTE = 0.9
const INTERACT_DIST = 2.6

interface Props {
  state: TraderState
  /** headless inspector flag — omits the drei <Text> prompt (troika needs a canvas) */
  inspect?: boolean
}

/** Pick the trader's current loiter mode from the time of day — they hang around
 *  the stall, alternating between minding the counter (tend) and a short stroll. */
function scheduledMode(t: number): TraderStateName {
  const phase = (t / 22) % 1
  return phase < 0.55 ? 'tend' : 'wander'
}

function enterState(s: TraderState, name: TraderStateName, t: number, duration: number) {
  s.state = name
  s.stateSince = t
  s.stateUntil = t + duration
  s.path = []
  s.pathIndex = 0
  s.pathRecomputeAt = 0
}

function tickStateMachine(s: TraderState, t: number): void {
  if (t < s.stateUntil) return
  const want = scheduledMode(t)
  if (want === 'tend') {
    // Stand at the counter (the garden anchor doubles as the stall front).
    s.targetX = s.gardenX + Math.sin(s.seed + t * 0.4) * 0.25
    s.targetZ = s.gardenZ + Math.cos(s.seed + t * 0.6) * 0.25
    enterState(s, 'tend', t, 4 + Math.abs(Math.sin(s.seed * 7)) * 3)
  } else {
    const ang = (Math.sin(s.id * 12.9898 + t * 0.29) * 43758.5453) % (Math.PI * 2)
    const r = WANDER_RADIUS * (0.4 + Math.abs(Math.sin(t * 0.15 + s.id)) * 0.6)
    s.targetX = s.homeX + Math.cos(ang) * r
    s.targetZ = s.homeZ + Math.sin(ang) * r
    enterState(s, 'wander', t, 3.5 + Math.abs(Math.cos(s.seed * 5)) * 3)
  }
}

export function TraderView({ state, inspect = false }: Props) {
  const ref = useRef<THREE.Group>(null!)
  const bodyRef = useRef<THREE.Group>(null!)
  const headRef = useRef<THREE.Group>(null!)
  const armRRef = useRef<THREE.Group>(null!)
  const armLRef = useRef<THREE.Group>(null!)
  const legRRef = useRef<THREE.Group>(null!)
  const legLRef = useRef<THREE.Group>(null!)
  const promptRef = useRef<THREE.Group>(null!)
  const recruitLineRef = useRef<THREE.Group>(null!)

  const skinMat = useMemo(() => SKIN_MATS[state.paletteIndex % SKIN_MATS.length], [state.paletteIndex])
  const robeMat = useMemo(() => ROBE_MATS[state.paletteIndex % ROBE_MATS.length], [state.paletteIndex])
  const wrapMat = useMemo(() => WRAP_MATS[state.paletteIndex % WRAP_MATS.length], [state.paletteIndex])

  const walkPhase = useRef(0)

  useFrame(({ clock }, dt) => {
    if (isFrozen()) return
    const tNow = clock.getElapsedTime()

    // Distance cull: far traders are fog-hidden — hide AND freeze their matrix
    // (cullVisible flips matrixWorldAutoUpdate off so three skips the subtree).
    if (ref.current && isCulled(state.x, state.z)) {
      cullVisible(ref.current, true)
      return
    }
    if (ref.current) cullVisible(ref.current, false)

    tickStateMachine(state, tNow)

    // Refresh A* path on a timer or when stale.
    if (
      tNow >= state.pathRecomputeAt ||
      state.path.length === 0 ||
      state.pathIndex >= state.path.length
    ) {
      state.path = findPath({ x: state.x, z: state.z }, { x: state.targetX, z: state.targetZ })
      state.pathIndex = 0
      state.pathRecomputeAt = tNow + PATH_RECOMPUTE
    }
    while (state.pathIndex < state.path.length) {
      const wp = state.path[state.pathIndex]
      if (Math.hypot(wp.x - state.x, wp.z - state.z) < WAYPOINT_DIST) state.pathIndex++
      else break
    }

    let stepTargetX = state.targetX
    let stepTargetZ = state.targetZ
    if (state.pathIndex < state.path.length) {
      stepTargetX = state.path[state.pathIndex].x
      stepTargetZ = state.path[state.pathIndex].z
    }

    let moving = false
    const distFinal = Math.hypot(state.targetX - state.x, state.targetZ - state.z)
    if (distFinal > ARRIVE_DIST) {
      const dx = stepTargetX - state.x
      const dz = stepTargetZ - state.z
      const dist = Math.hypot(dx, dz)
      if (dist > 0.0001) {
        const step = Math.min(SPEED * dt, dist)
        state.x += (dx / dist) * step
        state.z += (dz / dist) * step
        const targetFacing = Math.atan2(dx, dz)
        let d = targetFacing - state.facing
        while (d > Math.PI) d -= 2 * Math.PI
        while (d < -Math.PI) d += 2 * Math.PI
        state.facing += d * Math.min(1, dt * 8)
        moving = true
      }
    }

    // Face the player when they're close and we're standing still (for trading).
    const p = getPlayer()
    const pd = Math.hypot(p.x - state.x, p.z - state.z)
    const near = pd < INTERACT_DIST
    if (!moving && near) {
      const targetFacing = Math.atan2(p.x - state.x, p.z - state.z)
      let d = targetFacing - state.facing
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      state.facing += d * Math.min(1, dt * 6)
    }

    walkPhase.current += dt * (moving ? 8 : 0)
    const wp = walkPhase.current
    let armSwing = Math.sin(wp) * 0.5
    let legSwing = Math.sin(wp) * 0.55
    if (!moving) {
      armSwing = Math.sin(tNow * 1.3 + state.seed) * 0.08
      legSwing = 0
    }

    if (ref.current) {
      ref.current.position.set(state.x, state.y, state.z)
      ref.current.rotation.y = state.facing
    }
    if (legRRef.current) legRRef.current.rotation.x = legSwing
    if (legLRef.current) legLRef.current.rotation.x = -legSwing
    if (armRRef.current) armRRef.current.rotation.x = -armSwing
    if (armLRef.current) armLRef.current.rotation.x = armSwing
    if (headRef.current) headRef.current.rotation.y = near ? 0 : Math.sin(tNow * 0.6 + state.seed) * 0.18 * (moving ? 0 : 1)

    // Prompt: visible only on the single nearest in-range trader, and not while a
    // shop panel is already open. The recruit line shows only if a contract is held.
    if (promptRef.current) {
      const active = near && !isShopOpen() && nearestTrader(p.x, p.z, INTERACT_DIST)?.id === state.id
      promptRef.current.visible = active
      if (recruitLineRef.current) recruitLineRef.current.visible = active && hasItem(RECRUIT_ITEM)
    }
  })

  return (
    <group ref={ref} position={[state.x, state.y, state.z]} rotation={[0, state.facing, 0]} scale={0.55}>
      {/* Legs */}
      <group ref={legRRef} position={[0.11, 0.34, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow material={PANT_MAT}>
          <boxGeometry args={[0.16, 0.36, 0.18]} />
        </mesh>
      </group>
      <group ref={legLRef} position={[-0.11, 0.34, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow material={PANT_MAT}>
          <boxGeometry args={[0.16, 0.36, 0.18]} />
        </mesh>
      </group>

      {/* Torso (long robe) + apron + back satchel + belt pouch */}
      <group ref={bodyRef} position={[0, 0.7, 0]}>
        <mesh castShadow material={robeMat}>
          <boxGeometry args={[0.44, 0.52, 0.28]} />
        </mesh>
        {/* Leather apron over the robe front */}
        <mesh position={[0, -0.04, 0.15]} castShadow material={APRON_MAT}>
          <boxGeometry args={[0.36, 0.48, 0.04]} />
        </mesh>
        {/* Coin pouch on the belt */}
        <mesh position={[0.16, -0.18, 0.16]} castShadow material={POUCH_MAT}>
          <boxGeometry args={[0.1, 0.12, 0.08]} />
        </mesh>
        {/* Satchel/pack slung on the back */}
        <mesh position={[0, 0.0, -0.18]} castShadow material={PACK_MAT}>
          <boxGeometry args={[0.34, 0.36, 0.16]} />
        </mesh>
        <mesh position={[0, 0.12, -0.1]} castShadow material={PACK_MAT}>
          <boxGeometry args={[0.06, 0.34, 0.16]} />
        </mesh>
      </group>

      {/* Arms (robe sleeves) */}
      <group ref={armRRef} position={[0.28, 0.92, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow material={robeMat}>
          <boxGeometry args={[0.13, 0.36, 0.22]} />
        </mesh>
        <mesh position={[0, -0.42, 0]} castShadow material={skinMat}>
          <boxGeometry args={[0.12, 0.1, 0.2]} />
        </mesh>
      </group>
      <group ref={armLRef} position={[-0.28, 0.92, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow material={robeMat}>
          <boxGeometry args={[0.13, 0.36, 0.22]} />
        </mesh>
        <mesh position={[0, -0.42, 0]} castShadow material={skinMat}>
          <boxGeometry args={[0.12, 0.1, 0.2]} />
        </mesh>
      </group>

      {/* Head + headwrap (turban) with a small top knot */}
      <group ref={headRef} position={[0, 1.14, 0]}>
        <mesh castShadow material={skinMat}>
          <boxGeometry args={[0.3, 0.3, 0.3]} />
        </mesh>
        <mesh position={[0, -0.04, 0.16]} material={HAIR_MAT}>
          <boxGeometry args={[0.26, 0.06, 0.02]} />
        </mesh>
        <mesh position={[0, 0.14, 0]} castShadow material={wrapMat}>
          <boxGeometry args={[0.34, 0.18, 0.34]} />
        </mesh>
        <mesh position={[0.04, 0.26, 0]} castShadow material={wrapMat}>
          <boxGeometry args={[0.12, 0.1, 0.12]} />
        </mesh>
        {/* eyes */}
        <mesh position={[-0.07, 0.0, 0.16]} material={HAIR_MAT}>
          <boxGeometry args={[0.04, 0.04, 0.005]} />
        </mesh>
        <mesh position={[0.07, 0.0, 0.16]} material={HAIR_MAT}>
          <boxGeometry args={[0.04, 0.04, 0.005]} />
        </mesh>
      </group>

      {/* Interaction prompt (omitted headless). Scaled up to counter the 0.55 root. */}
      {!inspect && (
        <group ref={promptRef} position={[0, 2.4, 0]} visible={false} scale={1.8}>
          <Text fontSize={0.22} color="#fff5cc" anchorX="center" anchorY="middle" outlineColor="#000" outlineWidth={0.02}>
            Press E to trade
          </Text>
          <group ref={recruitLineRef} position={[0, -0.3, 0]} visible={false}>
            <Text fontSize={0.2} color="#9be88a" anchorX="center" anchorY="middle" outlineColor="#000" outlineWidth={0.02}>
              Press R to recruit 📜
            </Text>
          </group>
        </group>
      )}
    </group>
  )
}

/** Renders all traders from the shared store + owns the single E/R key listener.
 *  Drop once in World. */
export function TraderCrowd() {
  const [list, setList] = useState<TraderState[]>([])

  useEffect(() => {
    const unsub = subscribeTraders((l) => setList([...l]))
    return unsub
  }, [])

  // E = trade with the nearest in-range trader (toggles the shop closed if open).
  // R = recruit that trader, spending a Mercenary Contract.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isPaused()) return
      const p = getPlayer()
      if (e.code === 'KeyE') {
        if (isShopOpen()) {
          closeShop()
          return
        }
        const t = nearestTrader(p.x, p.z, INTERACT_DIST)
        if (!t) return
        openShop({ id: `trader-${t.id}`, title: t.name, items: buildShopItems() })
      } else if (e.code === 'KeyR') {
        if (isShopOpen()) return
        const t = nearestTrader(p.x, p.z, INTERACT_DIST)
        if (!t || !hasItem(RECRUIT_ITEM)) return
        const v = recruitTrader(t)
        if (v) {
          playLevelUp()
          spawnFloat('Recruited!', '#9be88a', t.x, t.y + 2.6, t.z)
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <group>
      {list.map((t) => (
        <TraderView key={t.id} state={t} />
      ))}
    </group>
  )
}
