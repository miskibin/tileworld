import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Sparkles } from '@react-three/drei'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { getVillagers } from './villagerStore'
import { plasterTexture, shingleTexture, stoneTexture, woodTexture } from './textures'

interface HouseProps {
  position: [number, number, number]
  rotation?: number
  seed?: number
  wallColor?: string
  roofColor?: string
  /** villager whose `homeX`/`homeZ` triggers the door — used to know when
      to open it. */
  ownerVillagerHomeX?: number
  ownerVillagerHomeZ?: number
}

// House dimensions — keep these explicit so the parts line up.
const WALL_W = 2.6
const WALL_H = 1.15
const WALL_D = 2.0
const ROOF_OVERHANG_X = 0.15
const ROOF_OVERHANG_Z = 0.15
const ROOF_RISE = 0.58
const FOUND_H = 0.18
const wallTopY = FOUND_H + WALL_H

const DEFAULT_WALL = '#d3b78b'
const DEFAULT_ROOF = '#6b3322'
const FRAME = '#5a3a22'
const WINDOW_GLOW = '#ffd58c'
const DOOR_COLOR = '#3a2618'
const STONE_BASE = '#6e6e76'

function texMat(map: THREE.Texture | null, fallback: string, roughness: number): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color: map ? '#ffffff' : fallback,
    map: map ?? undefined,
    roughness,
    flatShading: !map,
  })
}

function box(w: number, h: number, d: number, x: number, y: number, z: number): THREE.BoxGeometry {
  const g = new THREE.BoxGeometry(w, h, d)
  g.translate(x, y, z)
  return g
}

// Static geometry shared by every house (one draw call each, instead of a mesh
// per part). Foundation + chimney stack share the stone material; the door
// frame, window cross-frames and chimney cap share the timber material.
const STONE_GEO = mergeGeometries(
  [
    box(WALL_W + 0.2, FOUND_H, WALL_D + 0.2, 0, FOUND_H / 2, 0),
    box(0.24, 0.7, 0.24, WALL_W / 2 - 0.4, wallTopY + 0.35, 0.25),
  ],
  false,
) as THREE.BufferGeometry

const FRAME_GEO = mergeGeometries(
  [
    box(0.5, 1.0, 0.04, -0.55, FOUND_H + 0.5, WALL_D / 2 + 0.005),
    box(0.46, 0.04, 0.01, 0.4, FOUND_H + 0.9, WALL_D / 2 + 0.015),
    box(0.04, 0.46, 0.01, 0.4, FOUND_H + 0.9, WALL_D / 2 + 0.015),
    box(0.3, 0.06, 0.3, WALL_W / 2 - 0.4, wallTopY + 0.7, 0.25),
  ],
  false,
) as THREE.BufferGeometry

export function House({
  position,
  rotation = 0,
  seed = 0,
  wallColor = DEFAULT_WALL,
  roofColor = DEFAULT_ROOF,
  ownerVillagerHomeX,
  ownerVillagerHomeZ,
}: HouseProps) {
  const doorRef = useRef<THREE.Group>(null!)
  const windowMatRef = useRef<THREE.MeshStandardMaterial | null>(null)

  const wallMat = useMemo(() => texMat(plasterTexture(wallColor, 2), wallColor, 0.95), [wallColor])
  const roofMat = useMemo(() => texMat(shingleTexture(roofColor, 2), roofColor, 0.85), [roofColor])
  const frameMat = useMemo(() => texMat(woodTexture(FRAME), FRAME, 1), [])
  const doorMat = useMemo(() => texMat(woodTexture(DOOR_COLOR, 1, 3), DOOR_COLOR, 1), [])
  const stoneMat = useMemo(() => texMat(stoneTexture(STONE_BASE), STONE_BASE, 0.9), [])
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

  // Smooth open-amount tracker so the door can ease open/closed.
  const doorOpenAmt = useRef(0)

  useFrame(({ clock }, dt) => {
    const t = clock.getElapsedTime() + seed
    const tNow = clock.getElapsedTime()

    // Find owning villager (matched by their homeX/homeZ).
    let targetOpen = 0
    if (ownerVillagerHomeX !== undefined && ownerVillagerHomeZ !== undefined) {
      const owner = getVillagers().find(
        (v) =>
          Math.abs(v.homeX - ownerVillagerHomeX) < 0.05 &&
          Math.abs(v.homeZ - ownerVillagerHomeZ) < 0.05,
      )
      if (owner && tNow < owner.doorOpenUntil) targetOpen = 1
    }
    // Smooth toward target.
    doorOpenAmt.current += (targetOpen - doorOpenAmt.current) * Math.min(1, dt * 4)
    if (doorRef.current) {
      doorRef.current.rotation.y = -doorOpenAmt.current * (Math.PI / 2.2)
    }

    if (windowMatRef.current) {
      const f = 0.45 + Math.sin(t * 4.7) * 0.08 + Math.sin(t * 11.3) * 0.05
      windowMatRef.current.emissiveIntensity = f
    }
  })

  return (
    <group position={position} rotation={[0, rotation, 0]}>
      {/* Foundation + chimney stack (merged stone) */}
      <mesh geometry={STONE_GEO} castShadow receiveShadow material={stoneMat} />

      {/* Walls */}
      <mesh position={[0, FOUND_H + WALL_H / 2, 0]} castShadow receiveShadow material={wallMat}>
        <boxGeometry args={[WALL_W, WALL_H, WALL_D]} />
      </mesh>

      {/* Door frame + window frames + chimney cap (merged timber) */}
      <mesh geometry={FRAME_GEO} material={frameMat} />

      {/* Door (swings open) */}
      <group ref={doorRef} position={[-0.78, FOUND_H + 0.5, WALL_D / 2 + 0.015]}>
        <mesh position={[0.22, 0, 0]} castShadow material={doorMat}>
          <boxGeometry args={[0.44, 0.92, 0.06]} />
        </mesh>
        <mesh position={[0.4, -0.04, 0.03]} material={frameMat}>
          <sphereGeometry args={[0.025, 8, 6]} />
        </mesh>
      </group>

      {/* Glowing window */}
      <mesh position={[0.4, FOUND_H + 0.9, WALL_D / 2 + 0.005]} material={windowMat}>
        <boxGeometry args={[0.42, 0.42, 0.02]} />
      </mesh>

      {/* Roof */}
      <group position={[0, wallTopY, 0]} rotation={[0, Math.PI / 2, 0]}>
        <mesh
          position={[0, 0, -(WALL_W + ROOF_OVERHANG_X * 2) / 2]}
          castShadow
          receiveShadow
          material={roofMat}
          geometry={roofGeo}
        />
      </group>

      {/* Chimney smoke — a single drifting plume. */}
      <Sparkles
        position={[WALL_W / 2 - 0.4, wallTopY + 1.2, 0.25]}
        scale={[0.8, 1.4, 0.8]}
        count={24}
        size={16}
        speed={0.22}
        opacity={0.35}
        color={'#b8bcc2'}
        noise={1.6}
      />
    </group>
  )
}
