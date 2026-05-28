import * as THREE from 'three'

/**
 * Player-centred "fog of war" — terrain darkens with distance from the
 * player position. Mimics the LoL-style sight radius.
 *
 * The uniforms below are shared across every patched material so a single
 * write per frame updates the whole world.
 */
export const playerPosUniform = { value: new THREE.Vector3(0, 0, 0) }
// Player-centric darkening is disabled by default — daylight + the
// camera-centric FogExp2 already handle distance. Bump
// viewMaxDarkenUniform.value to something > 0 if you ever want a
// LoL-style sight bubble back.
export const viewRadiusUniform = { value: 18 }
export const viewFalloffUniform = { value: 22 }
export const viewMaxDarkenUniform = { value: 0 }

export function setVisionPlayerPos(x: number, y: number, z: number): void {
  playerPosUniform.value.set(x, y, z)
}

/**
 * Inject the darkening pass into a MeshStandardMaterial (or compatible).
 * Safe to call multiple times — only patches once per material instance.
 */
export function applyVisionShader(material: THREE.Material): void {
  const m = material as THREE.Material & { __visionPatched?: boolean }
  if (m.__visionPatched) return
  m.__visionPatched = true

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPlayerPos = playerPosUniform
    shader.uniforms.uViewRadius = viewRadiusUniform
    shader.uniforms.uViewFalloff = viewFalloffUniform
    shader.uniforms.uViewMaxDarken = viewMaxDarkenUniform

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nvarying vec3 vFogOfWarWorldPos;',
      )
      .replace(
        '#include <project_vertex>',
        'vFogOfWarWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#include <project_vertex>',
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uPlayerPos;
         uniform float uViewRadius;
         uniform float uViewFalloff;
         uniform float uViewMaxDarken;
         varying vec3 vFogOfWarWorldPos;`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         float fowD = length(vFogOfWarWorldPos.xz - uPlayerPos.xz);
         float fowDark = smoothstep(uViewRadius, uViewRadius + uViewFalloff, fowD) * uViewMaxDarken;
         // Fade toward a dark cool tint, not pure black — keeps the look moody
         // and matches the atmospheric fog colour, so distant terrain reads as
         // "far away" rather than "desaturated".
         gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.04, 0.05, 0.10), fowDark);`,
      )
  }
  material.needsUpdate = true
}
