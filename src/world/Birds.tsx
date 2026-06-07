import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { isPaused } from './pauseStore'

/**
 * Shared per-bird state — exposed for the cat to read so it can stalk
 * birds that have dipped near the ground.
 */
export interface BirdLive {
  x: number
  y: number
  z: number
  /** time (sec) after which the bird should resume normal altitude */
  scaredUntil: number
}
const liveBirds: BirdLive[] = []
export function getBirds(): BirdLive[] {
  return liveBirds
}

interface Flock {
  cx: number
  cy: number
  cz: number
  radius: number
  count: number
  speed: number
  phase: number
}
// Flock centres are in world coords (already offset by -CENTER_X/-CENTER_Z).
const FLOCKS: Flock[] = [
  { cx: -28, cy: 11, cz: 18, radius: 10, count: 5, speed: 0.32, phase: 0.0 },
  { cx: 24, cy: 12, cz: -22, radius: 12, count: 5, speed: 0.28, phase: 1.5 },
  { cx: 18, cy: 11, cz: 22, radius: 9, count: 4, speed: 0.36, phase: 3.2 },
  { cx: 6, cy: 13, cz: -2, radius: 13, count: 5, speed: 0.24, phase: 2.1 }, // over the castle
  { cx: -10, cy: 10, cz: -20, radius: 8, count: 4, speed: 0.4, phase: 4.6 },
]
const TOTAL = FLOCKS.reduce((s, f) => s + f.count, 0)

const BIRD_GEO = new THREE.IcosahedronGeometry(0.1, 0)
BIRD_GEO.scale(1.7, 0.55, 1.05)
const BIRD_MAT = new THREE.MeshStandardMaterial({
  color: '#4a4f5a',
  roughness: 0.85,
  flatShading: true,
})

export function Birds() {
  const ref = useRef<THREE.InstancedMesh>(null!)

  const meta = useMemo(() => {
    const list: {
      fi: number
      ii: number
      ringR: number
      ringY: number
      diveAt: number
      diveDuration: number
    }[] = []
    let liveIdx = 0
    FLOCKS.forEach((f, fi) => {
      for (let i = 0; i < f.count; i++) {
        const ringR = f.radius * (0.9 + (i % 3) * 0.06)
        const ringY = ((Math.sin(i * 1.7 + fi * 0.3) * 0.5 + 0.5) * 1.4 - 0.7)
        list.push({
          fi,
          ii: i,
          ringR,
          ringY,
          // Stagger dive timing so individual birds occasionally land.
          diveAt: 6 + (i * 4.7 + fi * 7.3) % 28,
          diveDuration: 3.5 + ((i * 3.1 + fi * 1.7) % 3),
        })
        // Reserve a live slot.
        liveBirds[liveIdx++] = { x: f.cx, y: f.cy, z: f.cz, scaredUntil: 0 }
      }
    })
    liveBirds.length = liveIdx
    return list
  }, [])

  useFrame(({ clock }) => {
    if (isPaused()) return
    const t = clock.getElapsedTime()
    const dummy = new THREE.Object3D()
    for (let idx = 0; idx < meta.length; idx++) {
      const m = meta[idx]
      const f = FLOCKS[m.fi]
      const ang = f.phase + t * f.speed + m.ii * ((Math.PI * 2) / f.count)
      const x = f.cx + Math.cos(ang) * m.ringR
      const z = f.cz + Math.sin(ang) * m.ringR
      // Diving cycle — each bird dips low for a few seconds, then back up.
      // Birds stay high — no more "dive to ground" behaviour. Just a gentle
      // vertical bob so the flock doesn't look flat.
      const baseY = f.cy + m.ringY + Math.sin(t * 1.6 + m.ii) * 0.4
      const live = liveBirds[idx]
      const y = baseY
      live.x = x
      live.y = y
      live.z = z
      dummy.position.set(x, y, z)
      dummy.rotation.set(
        Math.sin(t * 9 + m.ii) * 0.18,
        ang + Math.PI / 2,
        0,
      )
      dummy.scale.setScalar(0.5)
      dummy.updateMatrix()
      ref.current.setMatrixAt(idx, dummy.matrix)
    }
    ref.current.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[BIRD_GEO, BIRD_MAT, TOTAL]} castShadow />
}
