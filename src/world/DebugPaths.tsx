import { useEffect, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html, Line } from '@react-three/drei'
import { getOrks } from './orkStore'
import { getVillagers } from './villagerStore'
import { isShowPaths, subscribeShowPaths } from './debugStore'

const PATH_Y = 0.12

export function DebugPaths() {
  const [show, setShow] = useState<boolean>(isShowPaths())
  const [, setTick] = useState(0)

  useEffect(() => subscribeShowPaths(setShow), [])

  // Throttled re-render so the Line components pick up updated paths
  // without redrawing every frame.
  useFrame(({ clock }) => {
    if (!show) return
    const t = clock.getElapsedTime()
    setTick(Math.floor(t * 8))
  })

  if (!show) return null
  const orks = getOrks().filter((o) => o.hp > 0 && o.path.length > 0)
  const villagers = getVillagers()

  return (
    <group>
      {/* Ork chase paths — red */}
      {orks.map((o) => {
        const remaining = o.path.slice(o.pathIndex)
        const points: [number, number, number][] = [
          [o.x, PATH_Y, o.z],
          ...remaining.map((p) => [p.x, PATH_Y, p.z] as [number, number, number]),
        ]
        return (
          <Line
            key={`ork-${o.id}`}
            points={points}
            color="#ff4444"
            lineWidth={2}
            depthTest={false}
            transparent
            opacity={0.85}
          />
        )
      })}

      {/* Villager paths — cyan; plus current target marker */}
      {villagers.map((v) => {
        const remaining = v.path.slice(v.pathIndex)
        const points: [number, number, number][] = [
          [v.x, PATH_Y, v.z],
          ...remaining.map((p) => [p.x, PATH_Y, p.z] as [number, number, number]),
          [v.targetX, PATH_Y, v.targetZ],
        ]
        return (
          <group key={`vil-${v.id}`}>
            {points.length > 1 && (
              <Line
                points={points}
                color="#42d6ff"
                lineWidth={2}
                depthTest={false}
                transparent
                opacity={0.85}
              />
            )}
            {/* State label above the villager's head */}
            <Html
              position={[v.x, v.y + 1.8, v.z]}
              center
              style={{
                pointerEvents: 'none',
                background: 'rgba(20,26,38,0.78)',
                color: '#fff',
                padding: '2px 6px',
                borderRadius: 4,
                fontFamily: 'Inter, system-ui, sans-serif',
                fontSize: 10,
                letterSpacing: '0.08em',
                fontWeight: 600,
                border: '1px solid rgba(255,255,255,0.1)',
                whiteSpace: 'nowrap',
              }}
            >
              {v.state.toUpperCase()}
            </Html>
          </group>
        )
      })}
    </group>
  )
}
