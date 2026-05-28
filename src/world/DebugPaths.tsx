import { useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Line } from '@react-three/drei'
import { getOrks } from './orkStore'
import { isShowPaths, subscribeShowPaths } from './debugStore'

const PATH_Y = 0.12

export function DebugPaths() {
  const [show, setShow] = useState<boolean>(isShowPaths())
  const [, setTick] = useState(0)

  useEffect(() => subscribeShowPaths(setShow), [])

  // Throttled re-render so the Line components pick up updated ork paths
  // without redrawing every frame.
  useFrame(({ clock }) => {
    if (!show) return
    const t = clock.getElapsedTime()
    setTick(Math.floor(t * 8))
  })

  if (!show) return null
  const orks = getOrks().filter((o) => o.hp > 0 && o.path.length > 0)

  return (
    <group>
      {orks.map((o) => {
        const remaining = o.path.slice(o.pathIndex)
        const points: [number, number, number][] = [
          [o.x, PATH_Y, o.z],
          ...remaining.map((p) => [p.x, PATH_Y, p.z] as [number, number, number]),
        ]
        return (
          <Line
            key={o.id}
            points={points}
            color="#ff4444"
            lineWidth={2}
            depthTest={false}
            transparent
            opacity={0.85}
          />
        )
      })}
    </group>
  )
}
