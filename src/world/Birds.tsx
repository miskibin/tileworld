import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { isPaused } from './pauseStore'
import { CENTER_X, CENTER_Z } from './tileMap'

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
  { cx: -22, cy: 7.0, cz: 14, radius: 7, count: 8, speed: 0.42, phase: 0.0 },
  { cx: 10, cy: 8.5, cz: -18, radius: 9, count: 7, speed: 0.32, phase: 1.5 },
  { cx: 22, cy: 7.0, cz: 18, radius: 6, count: 6, speed: 0.48, phase: 3.2 },
  { cx: -10, cy: 9.0, cz: -8, radius: 8, count: 7, speed: 0.36, phase: 4.8 },
]
const TOTAL = FLOCKS.reduce((s, f) => s + f.count, 0)

const BIRD_GEO = new THREE.IcosahedronGeometry(0.18, 0)
BIRD_GEO.scale(1.7, 0.55, 1.05)
const BIRD_MAT = new THREE.MeshStandardMaterial({
  color: '#181b22',
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
      const cyc = (t + m.diveAt) % 32
      const diveAmt =
        cyc > m.diveAt && cyc < m.diveAt + m.diveDuration
          ? Math.sin(((cyc - m.diveAt) / m.diveDuration) * Math.PI)
          : 0
      const baseY = f.cy + m.ringY + Math.sin(t * 1.6 + m.ii) * 0.25
      // If scared by a cat, bird shoots up and stays high.
      const live = liveBirds[idx]
      const scared = t < live.scaredUntil
      const y = scared
        ? baseY + 2.5
        : baseY - diveAmt * (baseY - 1.0)
      live.x = x
      live.y = y
      live.z = z
      dummy.position.set(x, y, z)
      dummy.rotation.set(
        Math.sin(t * 9 + m.ii) * 0.18,
        ang + Math.PI / 2,
        0,
      )
      dummy.scale.setScalar(0.7)
      dummy.updateMatrix()
      ref.current.setMatrixAt(idx, dummy.matrix)
    }
    ref.current.instanceMatrix.needsUpdate = true
  })

  return <instancedMesh ref={ref} args={[BIRD_GEO, BIRD_MAT, TOTAL]} castShadow />
}

// Re-export CENTER consts so other components can convert grid → world.
export const _birdsCenter = { x: CENTER_X, z: CENTER_Z }
