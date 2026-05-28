import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import * as THREE from 'three'

interface HouseProps {
  position: [number, number, number]
  rotation?: number
  seed?: number
  wallColor?: string
  roofColor?: string
}

// House dimensions — keep these explicit so the parts line up.
const WALL_W = 2.6
const WALL_H = 1.4
const WALL_D = 2.0
const ROOF_OVERHANG_X = 0.15
const ROOF_OVERHANG_Z = 0.15
const ROOF_RISE = 0.7
const FOUND_H = 0.2

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
  const windowMatRef = useRef<THREE.MeshStandardMaterial | null>(null)

  const wallMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.95, flatShading: true }),
    [wallColor],
  )
  const roofMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: roofColor, roughness: 0.85, flatShading: true }),
    [roofColor],
  )
  const frameMat = useMemo(() => new THREE.MeshStandardMaterial({ color: FRAME, roughness: 1 }), [])
  const doorMat = useMemo(() => new THREE.MeshStandardMaterial({ color: DOOR_COLOR, roughness: 1 }), [])
  const stoneMat = useMemo(() => new THREE.MeshStandardMaterial({ color: STONE_BASE, roughness: 0.9 }), [])
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

  const roofGeo = useMemo(() => {
    const halfWidth = WALL_D / 2 + ROOF_OVERHANG_Z
    const shape = new THREE.Shape()
    shape.moveTo(-halfWidth, 0)
    shape.lineTo(halfWidth, 0)
    shape.lineTo(0, ROOF_RISE)
    shape.closePath()
    const depth = WALL_W + ROOF_OVERHANG_X * 2
    return new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false })
  }, [])

  useEffect(() => {
    windowMatRef.current = windowMat
  }, [windowMat])

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + seed
    const cyc = (t * 0.18) % 1
    let openAmt = 0
    if (cyc < 0.15) openAmt = cyc / 0.15
    else if (cyc < 0.5) openAmt = 1
    else if (cyc < 0.7) openAmt = 1 - (cyc - 0.5) / 0.2
    if (doorRef.current) doorRef.current.rotation.y = -openAmt * (Math.PI / 2.2)

    if (windowMatRef.current) {
      const f = 0.45 + Math.sin(t * 4.7) * 0.08 + Math.sin(t * 11.3) * 0.05
      windowMatRef.current.emissiveIntensity = f
    }
  })

  const wallTopY = FOUND_H + WALL_H

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      <mesh position={[0, FOUND_H / 2, 0]} castShadow receiveShadow material={stoneMat}>
        <boxGeometry args={[WALL_W + 0.2, FOUND_H, WALL_D + 0.2]} />
      </mesh>

      <mesh
        position={[0, FOUND_H + WALL_H / 2, 0]}
        castShadow
        receiveShadow
        material={wallMat}
      >
        <boxGeometry args={[WALL_W, WALL_H, WALL_D]} />
      </mesh>

      <mesh position={[-0.55, FOUND_H + 0.5, WALL_D / 2 + 0.005]} material={frameMat}>
        <boxGeometry args={[0.5, 1.0, 0.04]} />
      </mesh>

      <group ref={doorRef} position={[-0.78, FOUND_H + 0.5, WALL_D / 2 + 0.015]}>
        <mesh position={[0.22, 0, 0]} castShadow material={doorMat}>
          <boxGeometry args={[0.44, 0.92, 0.06]} />
        </mesh>
        <mesh position={[0.4, -0.04, 0.03]} material={frameMat}>
          <sphereGeometry args={[0.025, 8, 6]} />
        </mesh>
      </group>

      <mesh position={[0.4, FOUND_H + 0.9, WALL_D / 2 + 0.005]} material={windowMat}>
        <boxGeometry args={[0.42, 0.42, 0.02]} />
      </mesh>
      <mesh position={[0.4, FOUND_H + 0.9, WALL_D / 2 + 0.015]} material={frameMat}>
        <boxGeometry args={[0.46, 0.04, 0.01]} />
      </mesh>
      <mesh position={[0.4, FOUND_H + 0.9, WALL_D / 2 + 0.015]} material={frameMat}>
        <boxGeometry args={[0.04, 0.46, 0.01]} />
      </mesh>

      <group position={[0, wallTopY, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh
          position={[0, 0, -(WALL_W + ROOF_OVERHANG_X * 2) / 2]}
          castShadow
          receiveShadow
          material={roofMat}
          geometry={roofGeo}
        />
      </group>

      <mesh position={[WALL_W / 2 - 0.4, wallTopY + 0.35, 0.25]} castShadow material={stoneMat}>
        <boxGeometry args={[0.24, 0.7, 0.24]} />
      </mesh>
      <mesh position={[WALL_W / 2 - 0.4, wallTopY + 0.7, 0.25]} material={frameMat}>
        <boxGeometry args={[0.3, 0.06, 0.3]} />
      </mesh>

      <Sparkles
        position={[WALL_W / 2 - 0.4, wallTopY + 1.2, 0.25]}
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
