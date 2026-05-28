import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import * as THREE from 'three'

interface HouseProps {
  position: [number, number, number]
  rotation?: number
  /** swing the door open/close cycle by this offset (so houses aren't synced) */
  seed?: number
  wallColor?: string
  roofColor?: string
}

const DEFAULT_WALL = '#d3b78b'
const DEFAULT_ROOF = '#6b3322'
const FRAME = '#5a3a22'
const WINDOW_GLOW = '#ffd58c'
const DOOR_COLOR = '#3a2618'
const STONE_BASE = '#6e6e76'

export function House({
  position,
  rotation = 0,
  seed = 0,
  wallColor = DEFAULT_WALL,
  roofColor = DEFAULT_ROOF,
}: HouseProps) {
  const doorRef = useRef<THREE.Group>(null!)
  const windowRef = useRef<THREE.MeshStandardMaterial>(null!)

  const wallMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.95, flatShading: true }),
    [wallColor],
  )
  const roofMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.85, flatShading: true }),
    [roofColor],
  )
  const frameMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: FRAME, roughness: 1 }),
    [],
  )
  const doorMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: DOOR_COLOR, roughness: 1 }),
    [],
  )
  const stoneMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: STONE_BASE, roughness: 0.9 }),
    [],
  )
  const windowMat = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        color: WINDOW_GLOW,
        emissive: WINDOW_GLOW,
        emissiveIntensity: 0.6,
        roughness: 0.4,
        toneMapped: false,
      }),
    [],
  )

  // expose window mat ref for flicker
  useEffect(() => {
    windowRef.current = windowMat
  }, [windowMat])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + seed
    // Slow door swing: open for ~3s, closed for ~4s, looped.
    const cyc = (t * 0.18) % 1
    let openAmt = 0
    if (cyc < 0.15) openAmt = cyc / 0.15
    else if (cyc < 0.5) openAmt = 1
    else if (cyc < 0.7) openAmt = 1 - (cyc - 0.5) / 0.2
    if (doorRef.current) doorRef.current.rotation.y = -openAmt * (Math.PI / 2.2)

    // Window flicker
    if (windowRef.current) {
      const f = 0.45 + Math.sin(t * 4.7) * 0.08 + Math.sin(t * 11.3) * 0.05
      windowRef.current.emissiveIntensity = f
    }
  })

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Stone foundation */}
      <mesh position={[0, 0.1, 0]} castShadow receiveShadow material={stoneMat}>
        <boxGeometry args={[2.6, 0.2, 2.0]} />
      </mesh>

      {/* Walls — single block; door + window are inset on front face */}
      <mesh position={[0, 0.95, 0]} castShadow receiveShadow material={wallMat}>
        <boxGeometry args={[2.4, 1.3, 1.8]} />
      </mesh>

      {/* Door frame (slightly inset) */}
      <mesh position={[-0.55, 0.65, 0.91]} material={frameMat}>
        <boxGeometry args={[0.5, 1.0, 0.04]} />
      </mesh>
      {/* Door — pivots at its left edge */}
      <group ref={doorRef} position={[-0.78, 0.65, 0.92]}>
        <mesh position={[0.22, 0, 0]} castShadow material={doorMat}>
          <boxGeometry args={[0.44, 0.92, 0.06]} />
        </mesh>
        {/* Tiny doorknob */}
        <mesh position={[0.4, -0.04, 0.03]} material={frameMat}>
          <sphereGeometry args={[0.025, 8, 6]} />
        </mesh>
      </group>

      {/* Window (right of door) */}
      <mesh position={[0.4, 1.05, 0.91]} material={windowMat}>
        <boxGeometry args={[0.42, 0.42, 0.02]} />
      </mesh>
      {/* Window cross */}
      <mesh position={[0.4, 1.05, 0.93]} material={frameMat}>
        <boxGeometry args={[0.46, 0.04, 0.01]} />
      </mesh>
      <mesh position={[0.4, 1.05, 0.93]} material={frameMat}>
        <boxGeometry args={[0.04, 0.46, 0.01]} />
      </mesh>

      {/* Roof: two slanted slabs forming a ridge along X */}
      <mesh position={[0, 1.85, 0.5]} rotation={[Math.PI / 4, 0, 0]} castShadow material={roofMat}>
        <boxGeometry args={[2.7, 1.45, 0.06]} />
      </mesh>
      <mesh position={[0, 1.85, -0.5]} rotation={[-Math.PI / 4, 0, 0]} castShadow material={roofMat}>
        <boxGeometry args={[2.7, 1.45, 0.06]} />
      </mesh>
      {/* Triangular gable ends so the wall doesn't poke through */}
      <mesh position={[-1.34, 1.85, 0]} rotation={[0, Math.PI / 2, 0]} material={wallMat}>
        <coneGeometry args={[1.05, 0.9, 3]} />
      </mesh>
      <mesh position={[1.34, 1.85, 0]} rotation={[0, Math.PI / 2, 0]} material={wallMat}>
        <coneGeometry args={[1.05, 0.9, 3]} />
      </mesh>

      {/* Chimney */}
      <mesh position={[0.85, 2.35, 0.35]} castShadow material={stoneMat}>
        <boxGeometry args={[0.24, 0.5, 0.24]} />
      </mesh>
      <mesh position={[0.85, 2.6, 0.35]} material={frameMat}>
        <boxGeometry args={[0.3, 0.06, 0.3]} />
      </mesh>

      {/* Drifting chimney smoke */}
      <Sparkles
        position={[0.85, 3.0, 0.35]}
        scale={[0.35, 1.2, 0.35]}
        count={14}
        size={6}
        speed={0.4}
        opacity={0.35}
        color={'#c9cdd4'}
        noise={1.6}
      />
    </group>
  )
}
