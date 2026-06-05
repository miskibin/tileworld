import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import { isFrozen } from './pauseStore'
import { getPlayer } from './playerStore'
import { getPhase } from './gameStore'
import { requestPrepSkip } from './waveStore'
import { INTERACT_DIST } from './cityPlan'
import { addShake } from './fxStore'
import { playWaveStart } from '../audio/sfx'

// The war bell stands in the castle courtyard. The day (prep phase) is a free
// roam window — ride out to the biomes and prepare — and the night (the wave)
// only begins when the player chooses. Ring the bell (walk up + E) during the day
// to summon the night early; otherwise the day runs its full timer. Same effect
// as the HUD "begin night" button (requestPrepSkip), but diegetic.

const WOOD = new THREE.MeshStandardMaterial({ color: '#4a3322', roughness: 1, flatShading: true })
const WOOD_DARK = new THREE.MeshStandardMaterial({ color: '#332417', roughness: 1, flatShading: true })
const BRONZE = new THREE.MeshStandardMaterial({ color: '#b9892f', roughness: 0.45, metalness: 0.7, flatShading: true })
const BRONZE_DARK = new THREE.MeshStandardMaterial({ color: '#7c5a1e', roughness: 0.5, metalness: 0.6, flatShading: true })

const POST_H = 1.6
const BEAM_Y = POST_H - 0.06

/** The bell + its A-frame, authored around the origin with the feet on y=0.
 *  `bellRef` (when given) lets the live component swing the bell on a ring. */
export function WarBellModel({ bellRef }: { bellRef?: React.Ref<THREE.Group> }) {
  return (
    <group>
      {/* Sill the posts stand on. */}
      <mesh position={[0, 0.07, 0]} castShadow receiveShadow material={WOOD_DARK}>
        <boxGeometry args={[1.5, 0.14, 0.5]} />
      </mesh>
      {/* Two angled A-frame posts. */}
      <mesh position={[-0.6, POST_H / 2, 0]} rotation={[0, 0, 0.12]} castShadow material={WOOD}>
        <boxGeometry args={[0.12, POST_H, 0.12]} />
      </mesh>
      <mesh position={[0.6, POST_H / 2, 0]} rotation={[0, 0, -0.12]} castShadow material={WOOD}>
        <boxGeometry args={[0.12, POST_H, 0.12]} />
      </mesh>
      {/* Crossbeam the bell hangs from. */}
      <mesh position={[0, BEAM_Y, 0]} castShadow material={WOOD}>
        <boxGeometry args={[1.5, 0.14, 0.16]} />
      </mesh>
      {/* Bell — swings about the beam. */}
      <group ref={bellRef} position={[0, BEAM_Y, 0]}>
        {/* Yoke connecting the bell crown to the beam. */}
        <mesh position={[0, -0.14, 0]} castShadow material={BRONZE_DARK}>
          <boxGeometry args={[0.1, 0.18, 0.1]} />
        </mesh>
        {/* Bell body — a flared (tapered) cylinder. */}
        <mesh position={[0, -0.5, 0]} castShadow material={BRONZE}>
          <cylinderGeometry args={[0.17, 0.36, 0.55, 12]} />
        </mesh>
        {/* Lip ring at the mouth. */}
        <mesh position={[0, -0.78, 0]} castShadow material={BRONZE_DARK}>
          <cylinderGeometry args={[0.37, 0.37, 0.07, 12]} />
        </mesh>
        {/* Clapper hanging inside. */}
        <mesh position={[0, -0.66, 0]} castShadow material={BRONZE_DARK}>
          <boxGeometry args={[0.08, 0.2, 0.08]} />
        </mesh>
      </group>
    </group>
  )
}

interface Props {
  position: [number, number, number]
  rotation?: number
  /** headless inspect: omit the drei <Text> prompt (troika can't mount). */
  inspect?: boolean
}

export function WarBell({ position, rotation = 0, inspect = false }: Props) {
  const bellRef = useRef<THREE.Group>(null!)
  const promptRef = useRef<THREE.Group>(null!)
  const inRangeRef = useRef(false)
  const ringPending = useRef(false) // set on ring; consumed in useFrame (shared clock)
  const swingUntil = useRef(0)

  useFrame(({ clock }) => {
    if (isFrozen()) return
    const now = clock.getElapsedTime()
    const isDay = getPhase() === 'prep'

    // Proximity prompt — only meaningful during the day (you summon the night).
    const p = getPlayer()
    const inRange = Math.hypot(p.x - position[0], p.z - position[2]) < INTERACT_DIST
    inRangeRef.current = inRange && isDay
    if (promptRef.current) promptRef.current.visible = inRangeRef.current

    // Stamp the swing in the SAME clock the swing is read in (a ring fires from a
    // keydown that has no access to this clock, so it just sets a pending flag).
    if (ringPending.current) {
      ringPending.current = false
      swingUntil.current = now + 1.4
    }
    // Bell swing after a ring, damping out.
    if (bellRef.current) {
      const left = swingUntil.current - now
      bellRef.current.rotation.x = left > 0 ? Math.sin(left * 22) * 0.5 * Math.min(1, left / 0.8) : 0
    }
  })

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'KeyE') return
      if (isFrozen()) return // never ring from behind a modal / hard pause
      if (!inRangeRef.current) return
      if (getPhase() !== 'prep') return
      requestPrepSkip() // summon the night
      playWaveStart()
      addShake(0.4)
      ringPending.current = true // useFrame stamps the swing in its own clock
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <WarBellModel bellRef={bellRef} />
      {!inspect && (
        <group ref={promptRef} position={[0, POST_H + 0.6, 0]} visible={false}>
          <Billboard>
            <Text fontSize={0.22} color="#fff5cc" anchorX="center" anchorY="middle" outlineColor="#000" outlineWidth={0.018}>
              Press E — ring the bell, begin the night
            </Text>
          </Billboard>
        </group>
      )}
    </group>
  )
}
