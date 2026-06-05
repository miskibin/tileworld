import * as THREE from 'three'

/**
 * Terrain shader injection — two effects share one onBeforeCompile pass:
 *
 *  1. Per-fragment detail: world-space value-noise mottle, large-scale
 *     hue/value variation (the cure for "flat green"), and an optional tiling
 *     detail texture sampled in continuous world-XZ UVs (so the 1×1 grid never
 *     shows). Strength is tunable per material via `opts`.
 *  2. Player-centred "fog of war": terrain darkens with distance from the
 *     player (LoL-style sight bubble). Disabled by default (maxDarken 0).
 *
 * World position is computed *including* instanceMatrix, so the instanced
 * terrain tiles actually vary per tile — without this the noise repeats
 * identically inside every 1×1 box and the ground looks uniform.
 *
 * The fog-of-war uniforms are shared across every patched material so a single
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

export interface TerrainShaderOpts {
  /** tiling detail texture sampled in world-XZ; only applied to up-facing faces */
  detail?: THREE.Texture | null
  /** world units → detail UV multiplier (0.2 ≈ one texture per 5 tiles) */
  detailScale?: number
  /** detail blend strength (0..1) */
  detailStrength?: number
  /** mean luminance of the detail texture (for imprint normalisation) */
  detailMean?: number
  /** large-scale hue/value variation strength (0..1+) */
  variation?: number
  /** feather the mesh border by discarding low-`aCoverage` fragments with a
   *  noisy cut — softens the hard road/grass seam (needs an `aCoverage` vertex
   *  attribute, 1 = solid interior, →0 at the open edge) */
  edgeAlpha?: boolean
  /** with `edgeAlpha`: fade the border via smooth ALPHA instead of a binary
   *  discard, so the overlay blends gradually into the base below (no dither
   *  holes). Used for the sand↔grass seam, where a discard fray shows green
   *  between the sand bits and reads as a different, mottled "texture". The
   *  material must be set `transparent` + `depthWrite:false` by the caller. */
  alphaFray?: boolean
}

/**
 * Inject the terrain detail + darkening pass into a MeshStandardMaterial (or
 * compatible). Safe to call multiple times — only patches once per material.
 */
export function applyVisionShader(
  material: THREE.Material,
  opts: TerrainShaderOpts = {},
): void {
  const m = material as THREE.Material & { __visionPatched?: boolean }
  if (m.__visionPatched) return
  m.__visionPatched = true

  const hasDetail = !!opts.detail
  const edgeAlpha = !!opts.edgeAlpha
  const alphaFray = !!opts.alphaFray

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uPlayerPos = playerPosUniform
    shader.uniforms.uViewRadius = viewRadiusUniform
    shader.uniforms.uViewFalloff = viewFalloffUniform
    shader.uniforms.uViewMaxDarken = viewMaxDarkenUniform
    shader.uniforms.uVariation = { value: opts.variation ?? 0.6 }
    if (hasDetail) {
      shader.uniforms.uDetailMap = { value: opts.detail }
      shader.uniforms.uDetailScale = { value: opts.detailScale ?? 0.22 }
      shader.uniforms.uDetailStrength = { value: opts.detailStrength ?? 0.55 }
      shader.uniforms.uDetailMean = { value: opts.detailMean ?? 0.5 }
    }

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
         varying vec3 vTerrainWorldPos;
         varying float vTerrainUp;
         ${edgeAlpha ? 'attribute float aCoverage;\nvarying float vCoverage;' : ''}`,
      )
      .replace(
        '#include <project_vertex>',
        `#ifdef USE_INSTANCING
           vec4 vtWorld = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
           vTerrainUp = (modelMatrix * instanceMatrix * vec4(normal, 0.0)).y;
         #else
           vec4 vtWorld = modelMatrix * vec4(transformed, 1.0);
           vTerrainUp = (modelMatrix * vec4(normal, 0.0)).y;
         #endif
         vTerrainWorldPos = vtWorld.xyz;
         ${edgeAlpha ? 'vCoverage = aCoverage;' : ''}
         #include <project_vertex>`,
      )

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
         uniform vec3 uPlayerPos;
         uniform float uViewRadius;
         uniform float uViewFalloff;
         uniform float uViewMaxDarken;
         uniform float uVariation;
         ${hasDetail ? 'uniform sampler2D uDetailMap;\nuniform float uDetailScale;\nuniform float uDetailStrength;\nuniform float uDetailMean;' : ''}
         ${edgeAlpha ? 'varying float vCoverage;' : ''}
         varying vec3 vTerrainWorldPos;
         varying float vTerrainUp;
         float terHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
         float terNoise(vec2 p){
           vec2 i = floor(p); vec2 f = fract(p);
           float a = terHash(i), b = terHash(i + vec2(1.0, 0.0));
           float c = terHash(i + vec2(0.0, 1.0)), d = terHash(i + vec2(1.0, 1.0));
           vec2 u = f * f * (3.0 - 2.0 * f);
           return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
         }`,
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
         vec2 terWp = vTerrainWorldPos.xz;

         ${edgeAlpha ? `
         // (0) noisy border feather. The solid interior (vCoverage ≈ 1) is never
         //     touched; only the open edge frays.
         float terCovN = terNoise(terWp * 3.0) * 0.6 + terNoise(terWp * 9.0) * 0.4;
         ${alphaFray ? `
         // Smooth ALPHA fade (sand↔grass): the overlay blends gradually into the
         //     grass base over the seam tile instead of a binary discard, so no
         //     green shows BETWEEN sand bits — the edge stays one solid sand
         //     texture that just fades out. A faint noise keeps the fade line
         //     irregular, not a clean contour.
         float terFade = smoothstep(0.30, 0.82, vCoverage + (terCovN - 0.5) * 0.34);
         gl_FragColor.a *= terFade;
         if (gl_FragColor.a < 0.02) discard;
         ` : `
         // Binary ragged-discard (roads + other seams): dirt frays into grass on
         //     a clean tile line.
         if (vCoverage + (terCovN - 0.5) * 0.5 < 0.62) discard;
         `}
         ` : ''}

         // (1) fine value mottle — three octaves break the flat per-tile colour.
         float terM = terNoise(terWp * 0.5) * 0.55 + terNoise(terWp * 1.7) * 0.30 + terNoise(terWp * 5.5) * 0.15;
         gl_FragColor.rgb *= 0.80 + terM * 0.40;

         // (2) analytic large-scale hue + value variation. Computed per fragment
         //     from world position (no texture minification), so it survives the
         //     RTS camera distance — this is the real cure for "flat green":
         //     broad patches drift warm yellow-green ↔ cool deep-green and
         //     lighten/darken like real ground cover.
         float terBig = terNoise(terWp * 0.05) * 0.6 + terNoise(terWp * 0.14) * 0.4;
         float terHue = terNoise(terWp * 0.028 + 11.0);
         gl_FragColor.rgb += (terBig - 0.5) * uVariation * vec3(0.22, 0.14, -0.14);
         gl_FragColor.rgb *= 1.0 + (terHue - 0.5) * uVariation * 0.40;

         ${hasDetail ? `
         // (3) tiling detail texture imprint (up-facing faces only). Normalised by
         //     its mean so it modulates around 1.0 — keeps the biome's base colour
         //     but stamps the grain/clumps on top.
         float terTop = step(0.5, vTerrainUp);
         vec3 terDet = texture2D(uDetailMap, terWp * uDetailScale).rgb / max(uDetailMean, 0.01);
         gl_FragColor.rgb *= mix(vec3(1.0), terDet, uDetailStrength * terTop);
         ` : ''}

         // (4) player-centred darkening (fog of war), disabled when maxDarken = 0.
         float terD = length(vTerrainWorldPos.xz - uPlayerPos.xz);
         float terDark = smoothstep(uViewRadius, uViewRadius + uViewFalloff, terD) * uViewMaxDarken;
         gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.04, 0.05, 0.10), terDark);`,
      )
  }
  material.needsUpdate = true
}
