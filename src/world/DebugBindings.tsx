import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { useControls, folder } from 'leva'
import * as THREE from 'three'
import { setDayFrozen, setDayTime, subscribeDay } from './timeStore'
import { audioMix, applyLoopVolumes } from '../audio/audio'
import { gradeTunables, dofTunables } from './gradeStore'
import { fovTunables } from './fxStore'
import { windStrength, windSpeed } from './wind'
import { waterTunables } from './Water'

interface Props {
  onLights: (l: {
    ambient: number
    hemi: number
    dir: number
  }) => void
}

/**
 * Wires the leva debug panel to scene-level things that can't easily live
 * as JSX props (fog density, scene background, shared shader uniforms).
 * Light intensities are reported up to the parent so it can render
 * `<ambientLight intensity={…}>` directly — light JSX props can't be
 * mutated from outside.
 */
export function DebugBindings({ onLights }: Props) {
  const scene = useThree((s) => s.scene)

  const env = useControls('Environment', {
    fog: folder({
      // Fog colour is now driven by the day/night cycle (see DayNight.tsx);
      // only its density stays manually tunable here.
      fogDensity: { value: 0.02, min: 0, max: 0.1, step: 0.001, label: 'density' },
    }),
    lights: folder({
      ambient: { value: 0.13, min: 0, max: 2, step: 0.05 },
      hemi: { value: 0.24, min: 0, max: 2, step: 0.05 },
      dir: { value: 2.1, min: 0, max: 4, step: 0.05 },
    }),
  })

  // Day/night clock. The slider scrubs the time of day; the toggle freezes the
  // day shift. `onChange` only writes to the store on real user input
  // (`fromPanel`) so the subscribeDay → set() sync below can't feed back.
  const [, setDayUi] = useControls('Time of day', () => ({
    hour: {
      value: 7.2, // DAY_START_T (0.30) × 24
      min: 0,
      max: 24,
      step: 0.1,
      onChange: (v: number, _p, ctx: { fromPanel?: boolean }) => {
        if (ctx.fromPanel) setDayTime(v / 24)
      },
    },
    frozen: {
      value: false, // matches timeStore default (clock runs); panel no longer boots checked
      onChange: (v: boolean, _p, ctx: { fromPanel?: boolean }) => {
        if (ctx.fromPanel) setDayFrozen(v)
      },
    },
  }))

  // Listener: keep the panel in sync with the running clock (and any external
  // changes). Throttled notifies from the driver move the slider as time flows.
  useEffect(
    () => subscribeDay((s) => setDayUi({ hour: s.t * 24, frozen: s.frozen })),
    [setDayUi],
  )

  // Reactive screen grade (ReactiveGrade in World.tsx reads gradeTunables live).
  const grade = useControls('Reactive grade', {
    base: folder({
      baseDarkness: { value: gradeTunables.baseDarkness, min: 0, max: 1, step: 0.01, label: 'vignette' },
      baseSaturation: { value: gradeTunables.baseSaturation, min: -0.5, max: 0.5, step: 0.01, label: 'saturation' },
    }),
    lowHp: folder({
      lowThreshold: { value: gradeTunables.lowThreshold, min: 0, max: 0.6, step: 0.01, label: 'threshold' },
      lowDarken: { value: gradeTunables.lowDarken, min: 0, max: 0.6, step: 0.01, label: 'darken' },
      lowDesat: { value: gradeTunables.lowDesat, min: 0, max: 1, step: 0.01, label: 'desat' },
      heartbeat: { value: gradeTunables.heartbeat, min: 0, max: 0.2, step: 0.01, label: 'throb' },
    }),
    onHit: folder({
      winceDarken: { value: gradeTunables.winceDarken, min: 0, max: 0.6, step: 0.01, label: 'darken' },
      winceDesat: { value: gradeTunables.winceDesat, min: 0, max: 1, step: 0.01, label: 'desat' },
    }),
  })

  // Foliage wind sway (wind.ts shared uniforms; read in the foliage vertex shader).
  const wind = useControls('Foliage wind', {
    strength: { value: windStrength.value, min: 0, max: 3, step: 0.05 },
    speed: { value: windSpeed.value, min: 0, max: 4, step: 0.05 },
  })

  // Camera FOV punch (fxStore.fovTunables; read at the Character.tsx call sites).
  const fov = useControls('Camera FOV punch', {
    kill: { value: fovTunables.kill, min: 0, max: 8, step: 0.1 },
    hit: { value: fovTunables.hit, min: 0, max: 8, step: 0.1 },
    land: { value: fovTunables.land, min: 0, max: 8, step: 0.1 },
    max: { value: fovTunables.max, min: 1, max: 12, step: 0.5, label: 'cap' },
    decay: { value: fovTunables.decay, min: 4, max: 60, step: 1, label: 'ease-out' },
  })

  // Depth of field — soft background blur. Mutates the dofTunables holder (read
  // each frame by DofDriver via a ref to the effect), so dragging these NEVER
  // re-renders World / rebuilds the post stack. bokehScale 0 = off.
  const dof = useControls('Depth of field', {
    blurAmount: { value: 7, min: 0, max: 12, step: 0.5, label: 'blur amount' },
    sharpRange: { value: 70, min: 2, max: 120, step: 1, label: 'sharp range' },
  })

  // Water look — mutates waterTunables; the Water component applies it each frame
  // (color/metalness/roughness + sky-sheen / sun-glint strengths). All live, no
  // recompile.
  const water = useControls('Water', {
    color: { value: waterTunables.color, label: 'color' },
    metalness: { value: waterTunables.metalness, min: 0, max: 1, step: 0.01 },
    roughness: { value: waterTunables.roughness, min: 0, max: 1, step: 0.01 },
    skyStrength: { value: waterTunables.skyStrength, min: 0, max: 2, step: 0.05, label: 'sky sheen' },
    sunStrength: { value: waterTunables.sunStrength, min: 0, max: 4, step: 0.1, label: 'sun glint' },
  })

  const audio = useControls('Audio', {
    sfx: { value: audioMix.sfx, min: 0, max: 1, step: 0.01, label: 'combat sfx' },
    voice: { value: audioMix.voice, min: 0, max: 1, step: 0.01, label: 'creature voices' },
    range: { value: audioMix.range, min: 4, max: 46, step: 1, label: 'voice range' },
    music: { value: audioMix.music, min: 0, max: 1, step: 0.01, label: 'music' },
    ambient: { value: audioMix.ambient, min: 0, max: 1, step: 0.01, label: 'ambient' },
  })

  // Push fog density to the scene when it changes (colour is cycle-driven).
  useEffect(() => {
    if (scene.fog && 'density' in scene.fog) {
      ;(scene.fog as THREE.FogExp2).density = env.fogDensity
    }
  }, [env.fogDensity, scene])

  useEffect(() => {
    onLights({ ambient: env.ambient, hemi: env.hemi, dir: env.dir })
  }, [env.ambient, env.hemi, env.dir, onLights])

  // Reactive grade → live holder (read each frame by ReactiveGrade).
  useEffect(() => {
    gradeTunables.baseDarkness = grade.baseDarkness
    gradeTunables.baseSaturation = grade.baseSaturation
    gradeTunables.lowThreshold = grade.lowThreshold
    gradeTunables.lowDarken = grade.lowDarken
    gradeTunables.lowDesat = grade.lowDesat
    gradeTunables.heartbeat = grade.heartbeat
    gradeTunables.winceDarken = grade.winceDarken
    gradeTunables.winceDesat = grade.winceDesat
  }, [
    grade.baseDarkness,
    grade.baseSaturation,
    grade.lowThreshold,
    grade.lowDarken,
    grade.lowDesat,
    grade.heartbeat,
    grade.winceDarken,
    grade.winceDesat,
  ])

  // Wind → shared uniforms (read in the foliage vertex shader).
  useEffect(() => {
    windStrength.value = wind.strength
    windSpeed.value = wind.speed
  }, [wind.strength, wind.speed])

  // FOV punch → live holder (read at the Character call sites / camera).
  useEffect(() => {
    fovTunables.kill = fov.kill
    fovTunables.hit = fov.hit
    fovTunables.land = fov.land
    fovTunables.max = fov.max
    fovTunables.decay = fov.decay
  }, [fov.kill, fov.hit, fov.land, fov.max, fov.decay])

  // Depth of field → live holder (read each frame by DofDriver via the effect ref).
  useEffect(() => {
    dofTunables.bokehScale = dof.blurAmount
    dofTunables.focusRange = dof.sharpRange
  }, [dof.blurAmount, dof.sharpRange])

  // Water → live holder (read each frame by the Water component).
  useEffect(() => {
    waterTunables.color = water.color
    waterTunables.metalness = water.metalness
    waterTunables.roughness = water.roughness
    waterTunables.skyStrength = water.skyStrength
    waterTunables.sunStrength = water.sunStrength
  }, [water.color, water.metalness, water.roughness, water.skyStrength, water.sunStrength])

  // Audio mix → live holder. sfx/voice/range are read live by the players;
  // music/ambient are pushed onto the running loop nodes.
  useEffect(() => {
    audioMix.sfx = audio.sfx
    audioMix.voice = audio.voice
    audioMix.range = audio.range
    audioMix.music = audio.music
    audioMix.ambient = audio.ambient
    applyLoopVolumes()
  }, [audio.sfx, audio.voice, audio.range, audio.music, audio.ambient])

  return null
}
