import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { useControls, folder } from 'leva'
import * as THREE from 'three'
import {
  viewMaxDarkenUniform,
  viewRadiusUniform,
  viewFalloffUniform,
} from './vision'
import { setDayFrozen, setDayTime, subscribeDay } from './timeStore'
import { audioMix, applyLoopVolumes } from '../audio/audio'

interface Props {
  onLights: (l: {
    ambient: number
    hemi: number
    dir: number
  }) => void
}

/**
 * Wires the leva debug panel to scene-level things that can't easily live
 * as JSX props (fog uniform, scene background, vision shader uniforms).
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
      fogDensity: { value: 0.025, min: 0, max: 0.1, step: 0.001, label: 'density' },
    }),
    lights: folder({
      ambient: { value: 0.22, min: 0, max: 2, step: 0.05 },
      hemi: { value: 0.4, min: 0, max: 2, step: 0.05 },
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
      value: true,
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

  const vis = useControls('Vision (fog of war)', {
    radius: { value: viewRadiusUniform.value, min: 0, max: 60, step: 0.5 },
    falloff: { value: viewFalloffUniform.value, min: 0, max: 60, step: 0.5 },
    maxDarken: { value: viewMaxDarkenUniform.value, min: 0, max: 1, step: 0.01 },
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

  useEffect(() => {
    viewRadiusUniform.value = vis.radius
    viewFalloffUniform.value = vis.falloff
    viewMaxDarkenUniform.value = vis.maxDarken
  }, [vis.radius, vis.falloff, vis.maxDarken])

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
