import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { getSoul, subscribeSoul, SUCCESSION_DURATION, type Soul } from './successionStore'
import { isFrozen } from './pauseStore'

// The hero's spirit in flight: a warm wisp that arcs from the fallen body to
// the heir who will rise as the new hero. Mounts only while a transfer is in
// progress (Character.tsx drives the timing + clears it on arrival). Drawn
// inside World's offset group, so it reads the soul's grid coords directly.

const SOUL_COLOR = '#ffd27a'
const ARC_HEIGHT = 1.4

export function SoulWisp() {
  const [soul, setSoul] = useState<Soul | null>(() => getSoul())
  useEffect(() => subscribeSoul(setSoul), [])

  const group = useRef<THREE.Group>(null)
  const light = useRef<THREE.PointLight>(null)
  const core = useRef<THREE.Mesh>(null)

  const coreMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: SOUL_COLOR,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  )
  const haloMat = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: SOUL_COLOR,
        transparent: true,
        opacity: 0.35,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      }),
    [],
  )

  useFrame(() => {
    if (isFrozen()) return
    const s = getSoul()
    if (!s || !group.current) return
    const now = performance.now() * 0.001
    const t = Math.min(1, Math.max(0, (now - s.startAt) / SUCCESSION_DURATION))
    // Ease-in-out along the straight line, plus a parabolic vertical arc.
    const e = t * t * (3 - 2 * t)
    const x = s.fromX + (s.toX - s.fromX) * e
    const z = s.fromZ + (s.toZ - s.fromZ) * e
    const baseY = s.fromY + (s.toY - s.fromY) * e + 0.9
    const y = baseY + Math.sin(t * Math.PI) * ARC_HEIGHT
    group.current.position.set(x, y, z)

    // Gentle flicker; the wisp also swells at the apex of its arc.
    const flick = 0.85 + Math.sin(now * 22) * 0.12
    const scale = (0.7 + Math.sin(t * Math.PI) * 0.5) * flick
    if (core.current) core.current.scale.setScalar(scale)
    if (light.current) light.current.intensity = 5 * flick
  })

  if (!soul) return null

  return (
    <group ref={group}>
      <pointLight ref={light} color={SOUL_COLOR} intensity={5} distance={6} decay={2} />
      <mesh ref={core} material={coreMat}>
        <sphereGeometry args={[0.22, 16, 16]} />
      </mesh>
      <mesh material={haloMat} scale={2.2}>
        <sphereGeometry args={[0.22, 16, 16]} />
      </mesh>
    </group>
  )
}
