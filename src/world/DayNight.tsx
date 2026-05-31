import { type ComponentRef, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Sky } from '@react-three/drei'
import * as THREE from 'three'
import {
  getDay,
  makeDaySample,
  notifyDay,
  sampleDay,
  sunDirAt,
  DAY_START_T,
} from './timeStore'
import { isFrozen } from './pauseStore'
import { subscribePhase } from './gameStore'

// How far out the sun glow sphere + moon sit (matches the old SUN_FAR).
const SUN_FAR = 700
// Notify subscribers (the leva slider) at most this often while the clock runs.
const NOTIFY_INTERVAL = 0.2

// Phase-driven day/night: waves fall at night and the night holds for the whole
// 'wave' phase (which only ends when every ork is dead); the breather/menu/end
// are daytime. The clock eases toward the target instead of free-running.
const NIGHT_T = 0.0 // midnight — deepest dark while a wave is live
const DAY_T = DAY_START_T // golden-hour daytime
const DAY_LERP_RATE = 0.7 // ease speed toward target time (≈ a few-second dusk/dawn)

interface Props {
  /** Daytime baseline intensities from the leva panel (the noon values). */
  lights: { ambient: number; hemi: number; dir: number }
  /** Bubble the sun glow mesh up to World so GodRays can ray out from it. */
  onSunMesh: (m: THREE.Mesh | null) => void
}

// Deterministic star field on the upper hemisphere — own <points> so the fade
// is fully under our control (drei <Stars> has no opacity handle).
function buildStarField(count: number, radius: number): THREE.BufferGeometry {
  const pos = new Float32Array(count * 3)
  const frac = (x: number) => x - Math.floor(x)
  for (let i = 0; i < count; i++) {
    const theta = frac(Math.sin(i * 12.9898) * 43758.5453) * Math.PI * 2
    const phi = Math.acos(frac(Math.sin(i * 78.233) * 43758.5453)) // [0, π/2] → upper
    const r = Math.sin(phi) * radius
    pos[i * 3] = Math.cos(theta) * r
    pos[i * 3 + 1] = Math.cos(phi) * radius + 40
    pos[i * 3 + 2] = Math.sin(theta) * r
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  return g
}

/**
 * The day/night cycle. Owns the world-space sky dome, the sun glow sphere, the
 * moon, the star field and the position-independent fill lights, and runs the
 * single per-frame driver that advances the clock and re-skins all of them from
 * the current time of day. The shadow-casting sun lives separately in SunShadow
 * (it follows the player) and reads the same `timeStore`.
 */
export function DayNight({ lights, onSunMesh }: Props) {
  const scene = useThree((s) => s.scene)

  const skyRef = useRef<ComponentRef<typeof Sky>>(null!)
  const sunRef = useRef<THREE.Mesh>(null!)
  const moonRef = useRef<THREE.Mesh>(null!)
  const moonMatRef = useRef<THREE.MeshBasicMaterial>(null!)
  const starsRef = useRef<THREE.Points>(null!)
  const starMatRef = useRef<THREE.PointsMaterial>(null!)
  const hemiRef = useRef<THREE.HemisphereLight>(null!)
  const ambRef = useRef<THREE.AmbientLight>(null!)

  const sample = useMemo(() => makeDaySample(), [])
  const sunDir = useMemo(() => new THREE.Vector3(), [])
  const starGeo = useMemo(() => buildStarField(420, 600), [])
  // Baseline at the frozen start so the StartScreen shows golden hour.
  const startPos = useMemo(
    () => sunDirAt(DAY_START_T, new THREE.Vector3()).multiplyScalar(SUN_FAR),
    [],
  )
  const notifyAcc = useRef(0)
  // Time-of-day the current game phase wants the clock to ease toward.
  const dayTarget = useRef(DAY_T)

  // Drive time of day from the game phase: night while a wave is live, day
  // otherwise. useFrame eases the clock toward this target each frame.
  useEffect(
    () =>
      subscribePhase((p) => {
        dayTarget.current = p === 'wave' ? NIGHT_T : DAY_T
      }),
    [],
  )

  // Bubble the sun mesh once it exists (GodRays needs it).
  useEffect(() => {
    onSunMesh(sunRef.current)
    return () => onSunMesh(null)
  }, [onSunMesh])

  // Free the star geometry on unmount.
  useEffect(() => () => starGeo.dispose(), [starGeo])

  useFrame((_, dt) => {
    const day = getDay()

    // Ease the clock toward the phase's target time (night for waves, day
    // otherwise) so dusk/dawn fall smoothly when a wave starts/ends. Held still
    // behind a pause/menu (visuals below still apply, so the look is correct).
    if (!isFrozen()) {
      day.t += (dayTarget.current - day.t) * Math.min(1, dt * DAY_LERP_RATE)
      notifyAcc.current += dt
      if (notifyAcc.current >= NOTIFY_INTERVAL) {
        notifyAcc.current = 0
        notifyDay() // keep the leva slider tracking the clock
      }
    }

    sunDirAt(day.t, sunDir)
    sampleDay(day.t, sample)

    // Sky scattering: feed the sun direction into the dome's shader uniform.
    skyRef.current.material.uniforms.sunPosition.value.copy(sunDir)

    // Sun glow sphere (bloom + GodRays origin) rides the sun direction.
    sunRef.current.position.copy(sunDir).multiplyScalar(SUN_FAR)

    // Moon sits anti-sun, fading in at night.
    moonRef.current.position.copy(sunDir).multiplyScalar(-SUN_FAR)
    moonMatRef.current.opacity = sample.nightAmount
    moonRef.current.visible = sample.nightAmount > 0.01

    // Stars fade with the night.
    starMatRef.current.opacity = sample.nightAmount
    starsRef.current.visible = sample.nightAmount > 0.01

    // Fill lights scaled off the leva baselines by the time-of-day curve.
    hemiRef.current.intensity = lights.hemi * sample.hemiScale
    hemiRef.current.color.copy(sample.hemiSky)
    hemiRef.current.groundColor.copy(sample.hemiGround)
    ambRef.current.intensity = lights.ambient * sample.ambientScale
    ambRef.current.color.copy(sample.ambientColor)

    // Fog colour tracks the sky (density stays leva-tunable).
    if (scene.fog) scene.fog.color.copy(sample.fogColor)
  })

  return (
    <>
      {/* Atmospheric sky dome — sunPosition is mutated each frame above. */}
      <Sky
        ref={skyRef}
        distance={4000}
        sunPosition={startPos}
        turbidity={9}
        rayleigh={2.4}
        mieCoefficient={0.006}
        mieDirectionalG={0.82}
      />

      {/* Far emissive sun glow (blooms; GodRays origin). */}
      <mesh ref={sunRef} position={startPos}>
        <sphereGeometry args={[46, 24, 24]} />
        <meshBasicMaterial color="#fff0cc" toneMapped={false} fog={false} />
      </mesh>

      {/* Moon — pale, anti-sun, fades in at night. */}
      <mesh ref={moonRef} visible={false}>
        <sphereGeometry args={[34, 20, 20]} />
        <meshBasicMaterial
          ref={moonMatRef}
          color="#cdd6e8"
          toneMapped={false}
          fog={false}
          transparent
          opacity={0}
        />
      </mesh>

      {/* Star field — custom points so opacity can crossfade with night. */}
      <points ref={starsRef} geometry={starGeo} visible={false}>
        <pointsMaterial
          ref={starMatRef}
          color="#cdd6e8"
          size={2}
          sizeAttenuation={false}
          transparent
          opacity={0}
          depthWrite={false}
          fog={false}
          toneMapped={false}
        />
      </points>

      {/* Position-independent fills (intensity + colour driven each frame). */}
      <hemisphereLight ref={hemiRef} args={['#e7eef8', '#5a6a44', lights.hemi]} />
      <ambientLight ref={ambRef} intensity={lights.ambient} />
    </>
  )
}
