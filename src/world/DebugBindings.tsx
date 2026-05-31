import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import { useControls, folder } from 'leva'
import * as THREE from 'three'
import {
  viewMaxDarkenUniform,
  viewRadiusUniform,
  viewFalloffUniform,
} from './vision'

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
      fogColor: { value: '#d6c6a0', label: 'color' },
      fogDensity: { value: 0.02, min: 0, max: 0.1, step: 0.001, label: 'density' },
    }),
    lights: folder({
      ambient: { value: 0.22, min: 0, max: 2, step: 0.05 },
      hemi: { value: 0.4, min: 0, max: 2, step: 0.05 },
      dir: { value: 2.1, min: 0, max: 4, step: 0.05 },
    }),
  })

  const vis = useControls('Vision (fog of war)', {
    radius: { value: viewRadiusUniform.value, min: 0, max: 60, step: 0.5 },
    falloff: { value: viewFalloffUniform.value, min: 0, max: 60, step: 0.5 },
    maxDarken: { value: viewMaxDarkenUniform.value, min: 0, max: 1, step: 0.01 },
  })

  // Push fog colour + density and background to the scene each time they change.
  useEffect(() => {
    if (scene.fog && 'density' in scene.fog) {
      scene.fog.color.set(env.fogColor)
      ;(scene.fog as THREE.FogExp2).density = env.fogDensity
    }
    if (scene.background instanceof THREE.Color) {
      scene.background.set(env.fogColor)
    }
  }, [env.fogColor, env.fogDensity, scene])

  useEffect(() => {
    onLights({ ambient: env.ambient, hemi: env.hemi, dir: env.dir })
  }, [env.ambient, env.hemi, env.dir, onLights])

  useEffect(() => {
    viewRadiusUniform.value = vis.radius
    viewFalloffUniform.value = vis.falloff
    viewMaxDarkenUniform.value = vis.maxDarken
  }, [vis.radius, vis.falloff, vis.maxDarken])

  return null
}
