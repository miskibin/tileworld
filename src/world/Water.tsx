import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COLS, ROWS, CENTER_X, CENTER_Z } from './tileMap'
import { isPaused } from './pauseStore'
import { waterTexture } from './textures'
import { getDay, sunDirAt } from './timeStore'

// Wide open ocean ring around the island. A big plane fading into the horizon
// fog reads as the open sea; the margin is generous so the distant mountain
// backdrop (see DistantMountains) sits well out on the water, not at the edge.
const W = COLS + 280
const H = ROWS + 280

// Live-tunable water look (the leva 'Water' folder in DebugBindings mutates this).
// Applied to the material + shader uniforms each frame in useFrame — all of these
// are live-settable without a shader recompile (color/metalness/roughness are
// material uniforms; sky/sun strengths are float uniforms). Tune the look in-game.
// Default: vivid blue, near-zero metalness (high metalness reflected the dim,
// AgX-desaturated sky and washed the water out to grey), with a sky sheen + sun
// glint doing the "reflective" read instead.
export const waterTunables = {
  color: '#3aa6e0',
  metalness: 0.05,
  roughness: 0.3,
  skyStrength: 0.45, // broad fresnel sky-sheen
  sunStrength: 1.6, // sun glint
}

export function Water() {
  const geo = useMemo(() => {
    const g = new THREE.PlaneGeometry(W, H, 56, 48)
    g.rotateX(-Math.PI / 2)
    return g
  }, [])

  // The ripple used to be a per-frame CPU pass: loop all 2,793 vertices, rewrite
  // the position buffer, re-upload it to the GPU, and recompute normals. That was
  // the top game-logic cost in the profile. It's now a vertex-shader displacement
  // (same sin/cos formula + an analytic normal so the shading matches) driven by a
  // single uTime uniform — the CPU does nothing per frame but bump one float.
  const mat = useMemo(() => {
    const map = waterTexture('#2780c9', 7)
    const m = new THREE.MeshStandardMaterial({
      color: waterTunables.color,
      map: map ?? undefined,
      roughness: waterTunables.roughness,
      metalness: waterTunables.metalness,
      transparent: true,
      opacity: 0.9,
    })
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 }
      shader.uniforms.uSunDir = { value: new THREE.Vector3(0.3, 0.6, 0.5) }
      shader.uniforms.uSkyColor = { value: new THREE.Color('#bcd8f0') }
      shader.uniforms.uSunColor = { value: new THREE.Color('#fff0cc') }
      shader.uniforms.uSkyStrength = { value: waterTunables.skyStrength }
      shader.uniforms.uSunStrength = { value: waterTunables.sunStrength }
      m.userData.shader = shader
      shader.vertexShader = `uniform float uTime;\n${shader.vertexShader}`
        // Displace height (matches the old CPU formula exactly).
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           transformed.y += sin(position.x * 0.55 + uTime * 0.9) * 0.05
                          + cos(position.z * 0.7 + uTime * 1.1) * 0.05;`,
        )
        // Analytic surface normal of that height field (partial derivatives), so
        // the ripple catches light like the old per-frame computeVertexNormals.
        .replace(
          '#include <beginnormal_vertex>',
          `#include <beginnormal_vertex>
           objectNormal = normalize(vec3(
             -cos(position.x * 0.55 + uTime * 0.9) * 0.55 * 0.05,
             1.0,
              sin(position.z * 0.7 + uTime * 1.1) * 0.7 * 0.05));`,
        )
      shader.fragmentShader = `uniform vec3 uSunDir;
uniform vec3 uSkyColor;
uniform vec3 uSunColor;
uniform float uSkyStrength;
uniform float uSunStrength;
${shader.fragmentShader}`.replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
         // Stylized water reflectivity (cheap, no extra pass): a broad sky sheen +
         // an animated sun glint, on top of the PBR env reflection (metalness).
         // Added as emissive so it flows through the normal tonemap + fog.
         // normal/vViewPosition/viewMatrix are provided by MeshStandardMaterial;
         // the ripple's analytic normal feeds 'normal'.
         vec3 wsN = normalize(normal);
         vec3 viewDir = normalize(vViewPosition);
         // Soft fresnel (low exponent so the sky tint reads even at the steep RTS
         // camera angle, not just at grazing edges) + a constant base sheen.
         float fres = 0.18 + pow(1.0 - max(dot(wsN, viewDir), 0.0), 1.6) * 0.82;
         totalEmissiveRadiance += uSkyColor * fres * uSkyStrength;
         vec3 sunView = normalize(mat3(viewMatrix) * uSunDir);
         vec3 sunRefl = reflect(-sunView, wsN);
         // Tight glint + a broader soft sheen so the sun reads across more of the surface.
         float spec = pow(max(dot(sunRefl, viewDir), 0.0), 90.0);
         float sheen = pow(max(dot(sunRefl, viewDir), 0.0), 16.0);
         totalEmissiveRadiance += uSunColor * (spec * uSunStrength + sheen * uSunStrength * 0.2);`,
      )
    }
    return m
  }, [])

  useFrame(({ clock }, dt) => {
    if (isPaused()) return
    const shader = mat.userData.shader as
      | {
          uniforms: {
            uTime: { value: number }
            uSunDir: { value: THREE.Vector3 }
            uSkyStrength: { value: number }
            uSunStrength: { value: number }
          }
        }
      | undefined
    if (shader) {
      shader.uniforms.uTime.value = clock.getElapsedTime()
      sunDirAt(getDay().t, shader.uniforms.uSunDir.value)
      shader.uniforms.uSkyStrength.value = waterTunables.skyStrength
      shader.uniforms.uSunStrength.value = waterTunables.sunStrength
    }
    // Live (leva-tunable) surface look — color/metalness/roughness update without a
    // recompile (they're material uniforms).
    mat.color.set(waterTunables.color)
    mat.metalness = waterTunables.metalness
    mat.roughness = waterTunables.roughness
    // Drift the ripple texture so the surface looks like it's flowing.
    if (mat.map) {
      mat.map.offset.x = (mat.map.offset.x + dt * 0.015) % 1
      mat.map.offset.y = (mat.map.offset.y + dt * 0.024) % 1
    }
  })

  // Surface sits at y≈0.9 — just below the land top (height-1 tiles top out at
  // y=1.0), so lakes/rivers read as nearly flush with the shore with only a thin
  // lip of bank showing, instead of a 1-unit-deep sunken pit. The ±0.05 ripple
  // displacement still never crests the shore (0.95 < 1.0).
  return <mesh geometry={geo} material={mat} position={[0, 0.9, 0]} receiveShadow />
}

// Solid darker floor under water so transparent areas don't reveal sky. Raised
// to just under the surface (which now sits at y≈0.9) so the shallow lakes/rivers
// don't read as a bottomless void through the semi-transparent water.
export function WaterFloor() {
  return (
    <mesh
      position={[0, 0.65, 0]}
      rotation={[-Math.PI / 2, 0, 0]}
      receiveShadow
    >
      <planeGeometry args={[W + 4, H + 4]} />
      <meshStandardMaterial color="#0d3a66" roughness={1} />
    </mesh>
  )
}

// Re-export for World.tsx convenience.
export const WATER_CENTER: [number, number, number] = [
  -CENTER_X + COLS / 2,
  0,
  -CENTER_Z + ROWS / 2,
]
