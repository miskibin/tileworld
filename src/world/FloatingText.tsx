import { useEffect, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import { getFloats, subscribeFloats, FLOAT_LIFETIME, type FloatText } from './fxStore'
import { isPaused } from './pauseStore'

// Renders active floating combat text (damage numbers, +gold, +XP). Items rise
// and fade over their lifetime. Lives inside the grid-offset group, so float
// coords are in world-grid space like the rest of the scene.

function Float({ f }: { f: FloatText }) {
  const ref = useRef<THREE.Group>(null!)
  const matRef = useRef<THREE.MeshBasicMaterial>(null!)
  useFrame(() => {
    if (isPaused()) return
    const k = Math.min(1, (performance.now() * 0.001 - f.born) / FLOAT_LIFETIME)
    if (ref.current) ref.current.position.y = f.y + k * 1.3
    if (matRef.current) matRef.current.opacity = 1 - k * k
  })
  return (
    <group ref={ref} position={[f.x, f.y, f.z]}>
      <Billboard>
        <Text fontSize={0.55} anchorX="center" anchorY="middle" outlineWidth={0.045} outlineColor="#000000">
          {f.text}
          <meshBasicMaterial ref={matRef} attach="material" transparent toneMapped={false} color={f.color} />
        </Text>
      </Billboard>
    </group>
  )
}

export function FloatingText() {
  const [floats, setFloats] = useState<FloatText[]>([])

  // Re-snapshot on each spawn (which also prunes expired items), and schedule a
  // cleanup pass so the final items disappear after their lifetime — no
  // per-frame React churn.
  useEffect(() => {
    let timer = 0
    const refresh = () => {
      const live = [...getFloats(performance.now() * 0.001)]
      setFloats(live)
      window.clearTimeout(timer)
      if (live.length > 0) {
        timer = window.setTimeout(refresh, FLOAT_LIFETIME * 1000 + 50)
      }
    }
    const unsub = subscribeFloats(refresh)
    return () => {
      unsub()
      window.clearTimeout(timer)
    }
  }, [])

  return (
    <group>
      {floats.map((f) => (
        <Float key={f.id} f={f} />
      ))}
    </group>
  )
}
