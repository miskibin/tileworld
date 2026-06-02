import { useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { COLS, ROWS, CENTER_X, CENTER_Z } from './tileMap'
import { isPaused } from './pauseStore'
import { waterTexture } from './textures'

// Wide open ocean ring around the island. A big plane fading into the horizon
// fog reads as the open sea; the margin is generous so the distant mountain
// backdrop (see DistantMountains) sits well out on the water, not at the edge.
const W = COLS + 280
const H = ROWS + 280

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
      color: map ? '#5aa6e0' : '#2780c9',
      map: map ?? undefined,
      roughness: 0.3,
      metalness: 0.15,
      transparent: true,
      opacity: 0.9,
    })
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 }
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
    }
    return m
  }, [])

  useFrame(({ clock }, dt) => {
    if (isPaused()) return
    const shader = mat.userData.shader as { uniforms: { uTime: { value: number } } } | undefined
    if (shader) shader.uniforms.uTime.value = clock.getElapsedTime()
    // Drift the ripple texture so the surface looks like it's flowing.
    if (mat.map) {
      mat.map.offset.x = (mat.map.offset.x + dt * 0.015) % 1
      mat.map.offset.y = (mat.map.offset.y + dt * 0.024) % 1
    }
  })

  return <mesh geometry={geo} material={mat} position={[0, 0.05, 0]} receiveShadow />
}

// Solid darker floor under water so transparent areas don't reveal sky.
export function WaterFloor() {
  return (
    <mesh
      position={[0, -0.2, 0]}
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
