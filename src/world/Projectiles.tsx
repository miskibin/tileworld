import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getBolts, resetBolts, stepProjectiles } from './projectileStore'
import { isFrozen } from './pauseStore'
import { getTimeScale } from './hitStopStore'

// Renders + drives the bolt pool. Bolts live in grid coords, so this must mount
// inside World's offset group. Two instanced meshes — one per team — so ork
// arcane bolts (purple) read distinctly from defender tower/archer bolts (cyan).

const MAX = 32
const GEO = new THREE.IcosahedronGeometry(0.14, 0)
const ORK_MAT = new THREE.MeshStandardMaterial({
  color: '#c89cff',
  emissive: '#7a3aff',
  emissiveIntensity: 1.6,
  roughness: 0.3,
  toneMapped: false,
})
const DEFENDER_MAT = new THREE.MeshStandardMaterial({
  color: '#bfeeff',
  emissive: '#2aa6ff',
  emissiveIntensity: 1.8,
  roughness: 0.3,
  toneMapped: false,
})

export function Projectiles() {
  const orkRef = useRef<THREE.InstancedMesh>(null!)
  const defRef = useRef<THREE.InstancedMesh>(null!)
  const dummy = useRef(new THREE.Object3D())

  useEffect(() => () => resetBolts(), [])

  useFrame(({ clock }, dtFrame) => {
    if (isFrozen()) return
    // Scale by the hit-stop time factor so bolts hang in the air during the
    // freeze, matching orks / bears / orbs / impacts (else a bolt flies through
    // a target that's frozen mid-animation).
    stepProjectiles(Math.min(0.05, dtFrame) * getTimeScale(), clock.getElapsedTime())
    const ork = orkRef.current
    const def = defRef.current
    if (!ork || !def) return
    const bolts = getBolts()
    const d = dummy.current
    const pulse = 1 + Math.sin(clock.getElapsedTime() * 18) * 0.15

    let orkN = 0
    let defN = 0
    for (let i = 0; i < bolts.length; i++) {
      const b = bolts[i]
      const isOrk = b.team !== 'defender'
      if (isOrk ? orkN >= MAX : defN >= MAX) continue
      d.position.set(b.x, b.y, b.z)
      d.scale.setScalar(pulse)
      d.updateMatrix()
      if (isOrk) ork.setMatrixAt(orkN++, d.matrix)
      else def.setMatrixAt(defN++, d.matrix)
    }
    ork.count = orkN
    def.count = defN
    ork.instanceMatrix.needsUpdate = true
    def.instanceMatrix.needsUpdate = true
  })

  return (
    <>
      <instancedMesh ref={orkRef} args={[GEO, ORK_MAT, MAX]} frustumCulled={false} />
      <instancedMesh ref={defRef} args={[GEO, DEFENDER_MAT, MAX]} frustumCulled={false} />
    </>
  )
}
