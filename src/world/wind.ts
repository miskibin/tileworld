import * as THREE from 'three'

// Foliage wind sway — a vertex-shader displacement injected once into the shared
// foliage materials (Scatter.tsx). Trees/bushes/reeds/grass bend on a sine gust,
// height-weighted so trunks stay planted and only the canopy moves.
//
// PERF / SAFETY: this is set up ONCE per material via onBeforeCompile, and only a
// single time uniform updates per frame. It does NOT add or remove point lights
// and does NOT change any material define — so it never triggers the
// light-count shader-recompile churn the codebase guards against. The sway runs
// entirely on the GPU vertex stage; CPU cost is one float write per frame.
//
// Shared uniform objects: the same reference is bound into every windy material's
// shader, so mutating `.value` here updates them all at once.
export const windTime = { value: 0 } // raw elapsed seconds (driven by WindDriver)
export const windStrength = { value: 1 } // global amplitude multiplier (leva-tunable)
export const windSpeed = { value: 1 } // global frequency multiplier (leva-tunable)

const WIND_VERT_HEAD = 'uniform float uWindTime;\nuniform float uWindStrength;\nuniform float uWindSpeed;\n'

// Injected right after <begin_vertex>, where `transformed` is the raw local
// position (instanceMatrix is applied later in <project_vertex>). Guarded on
// USE_INSTANCING so the same material is still safe if ever used non-instanced.
const WIND_VERT_BODY = /* glsl */ `
#ifdef USE_INSTANCING
{
  float t = uWindTime * uWindSpeed;
  // Per-instance phase from the instance's translation so neighbours don't sway
  // in lockstep.
  float phase = instanceMatrix[3].x * 0.7 + instanceMatrix[3].z * 0.55;
  // Square the local height so the base barely moves and the crown swings most.
  float h = max(transformed.y, 0.0);
  float k = h * h;
  transformed.x += (sin(t * 1.5 + phase) + 0.4 * sin(t * 3.1 + phase * 1.7)) * 0.045 * k * uWindStrength;
  transformed.z += cos(t * 1.2 + phase * 1.1) * 0.035 * k * uWindStrength;
}
#endif
`

/**
 * Inject the wind sway into a material's vertex shader (call once, at material
 * creation). Returns the same material for chaining. The shared uniforms above
 * are bound in, so a single per-frame write to windTime animates every material.
 */
export function applyWind<T extends THREE.Material>(mat: T): T {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = windTime
    shader.uniforms.uWindStrength = windStrength
    shader.uniforms.uWindSpeed = windSpeed
    shader.vertexShader =
      WIND_VERT_HEAD +
      shader.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>' + WIND_VERT_BODY)
  }
  // Keep windy materials in their own program-cache bucket so they can never
  // collide with a non-windy lookalike (same built-in params) elsewhere.
  mat.customProgramCacheKey = () => 'foliage-wind'
  return mat
}
