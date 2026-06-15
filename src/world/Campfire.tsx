import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { PositionalAudio, Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import { useAudioEnabled } from '../audio/useAudioEnabled'
import { asset } from '../asset'

interface CampfireProps {
  position: [number, number, number]
  seed?: number
}

const STONE_COLOR = '#6e6e76'
const LOG_DARK = '#3a2a1a'
const LOG_LIGHT = '#7a4a26'
const FLAME_OUTER = '#ff8a30'
const FLAME_CORE = '#ffd56a'

// Module singletons
const STONE_GEO = new THREE.IcosahedronGeometry(0.13, 0)
const STONE_MAT = new THREE.MeshStandardMaterial({
  color: STONE_COLOR,
  roughness: 0.95,
  flatShading: true,
})
const LOG_GEO = new THREE.CylinderGeometry(0.045, 0.045, 0.72, 6)
const LOG_LIGHT_MAT = new THREE.MeshStandardMaterial({ color: LOG_LIGHT, roughness: 1 })
const LOG_DARK_MAT = new THREE.MeshStandardMaterial({ color: LOG_DARK, roughness: 1 })
const FLAME_OUTER_GEO = new THREE.ConeGeometry(0.17, 0.55, 10)
const FLAME_INNER_GEO = new THREE.ConeGeometry(0.09, 0.35, 8)
const FLAME_OUTER_MAT = new THREE.MeshBasicMaterial({
  color: new THREE.Color(FLAME_OUTER).multiplyScalar(2.4),
  transparent: true,
  opacity: 0.85,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
})
const FLAME_INNER_MAT = new THREE.MeshBasicMaterial({
  color: new THREE.Color(FLAME_CORE).multiplyScalar(2.8),
  transparent: true,
  opacity: 0.95,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  toneMapped: false,
})

export function Campfire({ position, seed = 0 }: CampfireProps) {
  const outerRef = useRef<THREE.Mesh>(null!)
  const innerRef = useRef<THREE.Mesh>(null!)
  const lightRef = useRef<THREE.PointLight>(null!)
  const stoneRef = useRef<THREE.InstancedMesh>(null!)
  const audioEnabled = useAudioEnabled()

  const stones = useMemo(() => {
    const s: { x: number; z: number; rot: number; scale: number }[] = []
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2 + seed * 0.3
      s.push({
        x: Math.cos(a) * 0.42,
        z: Math.sin(a) * 0.42,
        rot: a + i * 0.7,
        scale: 0.8 + ((i * 13) % 7) / 20,
      })
    }
    return s
  }, [seed])

  // Bake stone instances once
  useEffect(() => {
    const m = stoneRef.current
    if (!m) return
    const dummy = new THREE.Object3D()
    stones.forEach((s, i) => {
      dummy.position.set(s.x, 0.07, s.z)
      dummy.rotation.set(0, s.rot, 0)
      dummy.scale.setScalar(s.scale)
      dummy.updateMatrix()
      m.setMatrixAt(i, dummy.matrix)
    })
    m.instanceMatrix.needsUpdate = true
    m.computeBoundingSphere()
  }, [stones])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + seed
    const f = 1 + Math.sin(t * 7) * 0.1 + Math.sin(t * 14.3) * 0.06
    if (outerRef.current) outerRef.current.scale.set(f, 1 + Math.sin(t * 9.5) * 0.18, f)
    if (innerRef.current) innerRef.current.scale.set(1, 1 + Math.sin(t * 12) * 0.12, 1)
    if (lightRef.current) lightRef.current.intensity = 2.6 + Math.sin(t * 8) * 0.7
  })

  return (
    <group position={position}>
      <instancedMesh
        ref={stoneRef}
        args={[STONE_GEO, STONE_MAT, stones.length]}
        castShadow
        receiveShadow
      />
      <mesh
        position={[0, 0.07, 0]}
        rotation={[Math.PI / 2, 0, Math.PI / 4]}
        castShadow
        material={LOG_LIGHT_MAT}
        geometry={LOG_GEO}
      />
      <mesh
        position={[0, 0.13, 0]}
        rotation={[Math.PI / 2, 0, -Math.PI / 4]}
        castShadow
        material={LOG_DARK_MAT}
        geometry={LOG_GEO}
      />
      <mesh ref={outerRef} position={[0, 0.34, 0]} material={FLAME_OUTER_MAT} geometry={FLAME_OUTER_GEO} />
      <mesh ref={innerRef} position={[0, 0.28, 0]} material={FLAME_INNER_MAT} geometry={FLAME_INNER_GEO} />
      <Sparkles
        position={[0, 0.7, 0]}
        count={14}
        scale={[0.55, 1.1, 0.55]}
        size={2.4}
        speed={0.6}
        opacity={0.9}
        color={'#ffb060'}
        noise={1.2}
      />
      <pointLight
        ref={lightRef}
        color={FLAME_OUTER}
        intensity={2.6}
        distance={6}
        decay={2}
        position={[0, 0.45, 0]}
      />
      {audioEnabled && (
        <PositionalAudio
          url={asset('/audio/campfire-loop.mp3')}
          autoplay
          loop
          distance={2.5}
          ref={(a) => { a?.setVolume(0.1) }}
        />
      )}
    </group>
  )
}
