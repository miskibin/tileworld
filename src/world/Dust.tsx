import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getDust, resetDust, stepDust } from './dustStore'
import { isFrozen } from './pauseStore'
import { getTimeScale } from './hitStopStore'

// Renders + drives the ground-dust mote pool. Motes live in grid coords, so this
// must mount inside World's offset group (next to Impacts). One instanced mesh of
// soft low-poly blobs: semi-transparent, depthWrite off, toneMapped ON (so dust
// stays dull and never catches the Bloom pass — the opposite of a combat spark).
// Per-mote colour via instanceColor so a snow puff and a desert puff share the
// pool. Fade is faked by scale (grow in, shrink out), like Impacts.

const MAX = 160
const GEO = new THREE.IcosahedronGeometry(0.22, 0)
const MAT = new THREE.MeshBasicMaterial({
  transparent: true,
  opacity: 0.42,
  depthWrite: false,
})

export function Dust() {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const dummy = useRef(new THREE.Object3D())
  const col = useRef(new THREE.Color())

  useEffect(() => () => resetDust(), [])

  useFrame((_, dtFrame) => {
    if (isFrozen()) return
    stepDust(Math.min(0.05, dtFrame) * getTimeScale())
    const m = ref.current
    if (!m) return
    const motes = getDust()
    const d = dummy.current
    let n = 0
    for (let i = 0; i < motes.length && n < MAX; i++) {
      const s = motes[i]
      const k = s.age / s.life
      // Puff blooms quickly (first 20% of life) then shrinks away — reads as a
      // soft fade without per-instance opacity.
      const grow = Math.min(1, k / 0.2)
      const out = 1 - k
      const scale = Math.max(0.0001, s.size * 0.55 * grow * out)
      d.position.set(s.x, s.y, s.z)
      d.scale.setScalar(scale)
      // Lazy tumble so the blobs don't look like identical static spheres.
      d.rotation.set(s.x + s.age, s.z + s.age * 0.6, 0)
      d.updateMatrix()
      m.setMatrixAt(n, d.matrix)
      col.current.setRGB(s.r, s.g, s.b)
      m.setColorAt(n, col.current)
      n++
    }
    m.count = n
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[GEO, MAT, MAX]} frustumCulled={false} />
}
