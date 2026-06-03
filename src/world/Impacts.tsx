import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getImpacts, resetImpacts, stepImpacts } from './impactStore'
import { isFrozen } from './pauseStore'
import { getTimeScale } from './hitStopStore'

// Renders + drives the hit-impact shard pool. Shards live in grid coords, so
// this must mount inside World's offset group. One instanced mesh; per-shard
// colour via instanceColor so a sword-spark (warm) and a gate-splinter (brown)
// can share the pool. toneMapped:false keeps the brightest shards hot enough to
// catch the Bloom pass.

const MAX = 240
const GEO = new THREE.TetrahedronGeometry(0.09, 0)
const MAT = new THREE.MeshBasicMaterial({ toneMapped: false })

export function Impacts() {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const dummy = useRef(new THREE.Object3D())
  const col = useRef(new THREE.Color())

  useEffect(() => () => resetImpacts(), [])

  useFrame((_, dtFrame) => {
    if (isFrozen()) return
    stepImpacts(Math.min(0.05, dtFrame) * getTimeScale())
    const m = ref.current
    if (!m) return
    const sparks = getImpacts()
    const d = dummy.current
    let n = 0
    for (let i = 0; i < sparks.length && n < MAX; i++) {
      const s = sparks[i]
      const k = s.age / s.life
      // Shrink to nothing over life — reads as a fade without per-instance opacity.
      const scale = s.size * 0.6 * (1 - k) * (1 - k)
      d.position.set(s.x, s.y, s.z)
      d.scale.setScalar(Math.max(0.0001, scale))
      const spin = s.age * 9
      d.rotation.set(s.x + spin, s.z + spin, spin)
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
