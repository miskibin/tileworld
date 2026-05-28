import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { isPaused } from './pauseStore'
import { getBirds } from './Birds'
import { CENTER_X, CENTER_Z } from './tileMap'

type CatMode = 'idle' | 'walk' | 'sit' | 'stalk'

interface CatProps {
  /** village grid-space anchor that the cat wanders around */
  home: [number, number, number]
  seed?: number
}

const SHARED = (() => {
  const body = new THREE.BoxGeometry(0.26, 0.16, 0.5)
  const head = new THREE.BoxGeometry(0.22, 0.2, 0.2)
  const ear = new THREE.ConeGeometry(0.05, 0.1, 4)
  const tail = new THREE.CylinderGeometry(0.025, 0.025, 0.4, 6)
  const leg = new THREE.BoxGeometry(0.06, 0.16, 0.06)
  const eye = new THREE.BoxGeometry(0.03, 0.025, 0.005)
  const fur = new THREE.MeshStandardMaterial({ color: '#a0816a', roughness: 0.95, flatShading: true })
  const furDark = new THREE.MeshStandardMaterial({ color: '#6b5240', roughness: 0.95 })
  const eyeMat = new THREE.MeshStandardMaterial({ color: '#1b3a1b', roughness: 0.4, emissive: '#244022', emissiveIntensity: 0.5, toneMapped: false })
  return { body, head, ear, tail, leg, eye, fur, furDark, eyeMat }
})()

const CAT_SPEED_WALK = 1.0
const CAT_SPEED_STALK = 1.7
const STALK_RANGE = 5
const POUNCE_RANGE = 1.0
const WANDER_RADIUS = 3.2

function pseudoRand(seed: number, n: number): number {
  const x = Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453
  return x - Math.floor(x)
}

export function Cat({ home, seed = 0 }: CatProps) {
  const ref = useRef<THREE.Group>(null!)
  const tailRef = useRef<THREE.Mesh>(null!)
  const bodyRef = useRef<THREE.Group>(null!)

  const s = useRef({
    x: home[0],
    z: home[2],
    y: home[1],
    facing: 0,
    mode: 'idle' as CatMode,
    stateUntil: 0,
    targetX: home[0],
    targetZ: home[2],
    walkPhase: 0,
  })

  // World-space anchor (offset removed) so we can compare to bird positions.
  const worldHome = useMemo(
    () => ({ x: home[0] - CENTER_X, z: home[2] - CENTER_Z }),
    [home],
  )

  useFrame(({ clock }, dt) => {
    if (isPaused()) return
    const t = clock.getElapsedTime()
    const st = s.current

    // ── State machine ───────────────────────────────────────────
    const worldX = st.x - CENTER_X
    const worldZ = st.z - CENTER_Z

    // Look for a nearby low-flying bird → stalk.
    if (st.mode !== 'stalk') {
      const birds = getBirds()
      for (const b of birds) {
        if (b.y > 2.0) continue
        const dx = b.x - worldX
        const dz = b.z - worldZ
        const d = Math.hypot(dx, dz)
        if (d < STALK_RANGE) {
          st.mode = 'stalk'
          st.stateUntil = t + 4
          break
        }
      }
    }

    if (st.mode === 'stalk') {
      // Steer toward nearest low bird.
      const birds = getBirds()
      let best = null as typeof birds[number] | null
      let bestD = Infinity
      for (const b of birds) {
        if (b.y > 2.5) continue
        const dx = b.x - worldX
        const dz = b.z - worldZ
        const d = Math.hypot(dx, dz)
        if (d < bestD) {
          bestD = d
          best = b
        }
      }
      if (!best || t > st.stateUntil) {
        st.mode = 'walk'
        st.stateUntil = t + 2
        st.targetX = home[0] + (pseudoRand(seed, t | 0) - 0.5) * WANDER_RADIUS * 2
        st.targetZ = home[2] + (pseudoRand(seed + 1, t | 0) - 0.5) * WANDER_RADIUS * 2
      } else {
        st.targetX = best.x + CENTER_X
        st.targetZ = best.z + CENTER_Z
        // Pounce → scare the bird up.
        if (bestD < POUNCE_RANGE) {
          best.scaredUntil = t + 6
          st.mode = 'idle'
          st.stateUntil = t + 1.2
        }
      }
    } else if (t > st.stateUntil) {
      // Re-roll between idle / walk / sit.
      const r = pseudoRand(seed, t | 0)
      if (r < 0.35) {
        st.mode = 'sit'
        st.stateUntil = t + 2.5 + pseudoRand(seed + 2, t | 0) * 3
      } else if (r < 0.45) {
        st.mode = 'idle'
        st.stateUntil = t + 1 + pseudoRand(seed + 3, t | 0) * 1.5
      } else {
        st.mode = 'walk'
        st.targetX = home[0] + (pseudoRand(seed + 4, t | 0) - 0.5) * WANDER_RADIUS * 2
        st.targetZ = home[2] + (pseudoRand(seed + 5, t | 0) - 0.5) * WANDER_RADIUS * 2
        st.stateUntil = t + 2.5 + pseudoRand(seed + 6, t | 0) * 2.5
      }
    }

    // ── Movement ────────────────────────────────────────────────
    const moving = st.mode === 'walk' || st.mode === 'stalk'
    if (moving) {
      const dx = st.targetX - st.x
      const dz = st.targetZ - st.z
      const d = Math.hypot(dx, dz)
      if (d > 0.05) {
        const speed = st.mode === 'stalk' ? CAT_SPEED_STALK : CAT_SPEED_WALK
        const step = Math.min(speed * dt, d)
        st.x += (dx / d) * step
        st.z += (dz / d) * step
        const targetFacing = Math.atan2(dx, dz)
        let dF = targetFacing - st.facing
        while (dF > Math.PI) dF -= 2 * Math.PI
        while (dF < -Math.PI) dF += 2 * Math.PI
        st.facing += dF * Math.min(1, dt * 8)
      }
    }

    st.walkPhase += dt * (moving ? 10 : 0)
    void worldHome // silence unused if needed

    // ── Apply transforms ───────────────────────────────────────
    if (ref.current) {
      ref.current.position.set(st.x, st.y, st.z)
      ref.current.rotation.y = st.facing
    }
    if (bodyRef.current) {
      // Lower body when sitting/stalking.
      const crouch =
        st.mode === 'sit' ? -0.04 : st.mode === 'stalk' ? -0.05 : 0
      bodyRef.current.position.y = crouch
    }
    if (tailRef.current) {
      // Tail wag — fast during stalk, slow flick at idle.
      const f = st.mode === 'stalk' ? 12 : st.mode === 'sit' ? 1.6 : 3.5
      tailRef.current.rotation.x = Math.sin(t * f + seed) * 0.45 + 0.6
    }
  })

  return (
    <group ref={ref} position={home} scale={0.85}>
      <group ref={bodyRef}>
        <mesh position={[0, 0.18, 0]} castShadow material={SHARED.fur} geometry={SHARED.body} />
        <mesh position={[0, 0.24, 0.3]} castShadow material={SHARED.fur} geometry={SHARED.head} />
        {/* Ears */}
        <mesh position={[-0.07, 0.36, 0.3]} castShadow material={SHARED.fur} geometry={SHARED.ear} />
        <mesh position={[0.07, 0.36, 0.3]} castShadow material={SHARED.fur} geometry={SHARED.ear} />
        {/* Eyes */}
        <mesh position={[-0.05, 0.26, 0.402]} material={SHARED.eyeMat} geometry={SHARED.eye} />
        <mesh position={[0.05, 0.26, 0.402]} material={SHARED.eyeMat} geometry={SHARED.eye} />
        {/* Legs */}
        <mesh position={[-0.08, 0.08, 0.15]} castShadow material={SHARED.furDark} geometry={SHARED.leg} />
        <mesh position={[0.08, 0.08, 0.15]} castShadow material={SHARED.furDark} geometry={SHARED.leg} />
        <mesh position={[-0.08, 0.08, -0.15]} castShadow material={SHARED.furDark} geometry={SHARED.leg} />
        <mesh position={[0.08, 0.08, -0.15]} castShadow material={SHARED.furDark} geometry={SHARED.leg} />
        {/* Tail — pivots at base */}
        <group position={[0, 0.22, -0.28]} rotation={[0.6, 0, 0]}>
          <mesh ref={tailRef} position={[0, 0.18, 0]} castShadow material={SHARED.fur} geometry={SHARED.tail} />
        </group>
      </group>
    </group>
  )
}
