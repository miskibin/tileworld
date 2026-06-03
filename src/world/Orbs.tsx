import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getOrbs, resetOrbs, stepOrbs } from './orbStore'
import { isFrozen } from './pauseStore'
import { getTimeScale } from './hitStopStore'

// Renders + drives the reward-orb pool. Orbs live in grid coords, so this mounts
// inside World's offset group. One instanced mesh; per-orb colour via
// instanceColor (warm gold vs XP cyan). toneMapped:false keeps them hot enough
// to catch the Bloom pass so they read as little glowing motes.

const MAX = 160
// Octahedron (a little faceted gem) + small size + warm-gold / lime-green keeps
// these visually clear of the round purple/cyan magic bolts and the orange ork
// ember glow — so a reward never reads as an incoming attack.
const GEO = new THREE.OctahedronGeometry(0.11, 0)
const MAT = new THREE.MeshBasicMaterial({ toneMapped: false })
const GOLD = new THREE.Color('#ffe27a')
const XP = new THREE.Color('#74ff8b')

export function Orbs() {
  const ref = useRef<THREE.InstancedMesh>(null!)
  const dummy = useRef(new THREE.Object3D())

  useEffect(() => () => resetOrbs(), [])

  useFrame((_, dtFrame) => {
    if (isFrozen()) return
    stepOrbs(Math.min(0.05, dtFrame) * getTimeScale())
    const m = ref.current
    if (!m) return
    const orbs = getOrbs()
    const d = dummy.current
    let n = 0
    for (let i = 0; i < orbs.length && n < MAX; i++) {
      const o = orbs[i]
      // Fast spin + twinkle so it reads as loot, not a projectile.
      const twinkle = 0.8 + Math.sin(o.age * 26 + i) * 0.2
      d.position.set(o.x, o.y, o.z)
      d.scale.setScalar((o.kind === 'xp' ? 0.85 : 1.0) * twinkle)
      d.rotation.set(o.age * 11, o.age * 13, o.age * 7)
      d.updateMatrix()
      m.setMatrixAt(n, d.matrix)
      m.setColorAt(n, o.kind === 'gold' ? GOLD : XP)
      n++
    }
    m.count = n
    m.instanceMatrix.needsUpdate = true
    if (m.instanceColor) m.instanceColor.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[GEO, MAT, MAX]} frustumCulled={false} />
}
