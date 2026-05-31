import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

// Far-off mountain range ringing the island, way out on the open sea. Pure
// backdrop scenery — no collision, no pathing, placed in world space (outside
// the grid group) like Birds/Ships. Fog is disabled on the materials so the
// peaks stay visible on the horizon instead of dissolving into the exponential
// fog; the muted hazy colour does the "distance" work instead. Every peak is
// merged into ONE geometry per material, so the whole range is two draw calls.

const BODY_MAT = new THREE.MeshStandardMaterial({
  color: '#9aa0a6',
  roughness: 1,
  flatShading: true,
  fog: false,
})
const SNOW_MAT = new THREE.MeshStandardMaterial({
  color: '#dfe4e9',
  roughness: 0.85,
  flatShading: true,
  fog: false,
})

const frac = (x: number) => x - Math.floor(x)
// Cheap deterministic hash so the range is identical every load (no seed dep).
const hash = (i: number, s: number) => frac(Math.sin(i * 127.1 + s * 311.7) * 43758.5453)

const RING = (() => {
  const bodies: THREE.BufferGeometry[] = []
  const caps: THREE.BufferGeometry[] = []
  const N = 42
  for (let i = 0; i < N; i++) {
    const a = (i / N) * Math.PI * 2 + (hash(i, 1) - 0.5) * 0.14
    const r = 168 + hash(i, 2) * 80 // distance from island centre — far offshore
    const h = 15 + hash(i, 3) * 30 // peak height — low so they read as distant
    const br = h * (0.42 + hash(i, 4) * 0.2) // base radius
    const sides = 5 + (i % 3) // 5..7 — chunky low-poly
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const base = -4 // sink the base under the sea so peaks rise from the water

    const body = new THREE.ConeGeometry(br, h, sides)
    body.translate(x, base + h / 2, z)
    bodies.push(body)

    // Snow cap on the taller peaks — a smaller cone hugging the summit.
    if (h > 34) {
      const capH = h * 0.3
      const capR = (br * capH) / h
      const cap = new THREE.ConeGeometry(capR, capH, sides)
      cap.translate(x, base + h - capH / 2, z)
      caps.push(cap)
    }
  }
  return {
    body: mergeGeometries(bodies, false) as THREE.BufferGeometry,
    snow: mergeGeometries(caps, false) as THREE.BufferGeometry,
  }
})()

export function DistantMountains() {
  return (
    <group>
      <mesh geometry={RING.body} material={BODY_MAT} />
      <mesh geometry={RING.snow} material={SNOW_MAT} />
    </group>
  )
}
