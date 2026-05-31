import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getBolts, resetBolts, stepProjectiles } from './projectileStore'
import { isFrozen } from './pauseStore'

// Renders + drives the shaman bolt pool. Bolts live in grid coords, so this
// must mount inside World's offset group. One instanced mesh, capped pool.

const MAX = 32
const GEO = new THREE.IcosahedronGeometry(0.14, 0)
const MAT = new THREE.MeshStandardMaterial({
  color: '#c89cff',
  emissive: '#7a3aff',
  emissiveIntensity: 1.6,
  roughness: 0.3,
  toneMapped: false,
})

export function Projectiles() {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const dummy = useRef(new THREE.Object3D())

  useEffect(() => () => resetBolts(), [])

  useFrame(({ clock }, dtFrame) => {
    if (isFrozen()) return
    stepProjectiles(Math.min(0.05, dtFrame), clock.getElapsedTime())
    const im = ref.current
    if (!im) return
    const bolts = getBolts()
    const n = Math.min(bolts.length, MAX)
    const d = dummy.current
    const pulse = 1 + Math.sin(clock.getElapsedTime() * 18) * 0.15
    for (let i = 0; i < n; i++) {
      d.position.set(bolts[i].x, bolts[i].y, bolts[i].z)
      d.scale.setScalar(pulse)
      d.updateMatrix()
      im.setMatrixAt(i, d.matrix)
    }
    im.count = n
    im.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[GEO, MAT, MAX]} frustumCulled={false} />
}
