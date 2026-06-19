import { StrictMode, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { Canvas } from '@react-three/fiber'
import { ContactShadows, OrbitControls } from '@react-three/drei'
import * as THREE from 'three'
import { HeroKnight } from '../world/HeroKnight'

function ReadyFlag() {
  useEffect(() => {
    const first = requestAnimationFrame(() => {
      const second = requestAnimationFrame(() => {
        ;(window as unknown as { __heroModelReady?: boolean }).__heroModelReady = true
      })
      return () => cancelAnimationFrame(second)
    })
    return () => cancelAnimationFrame(first)
  }, [])

  return null
}

function StudioScene() {
  return (
    <Canvas
      shadows
      camera={{ position: [-3.2, 1.75, 4.25], fov: 34, near: 0.1, far: 20 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
      onCreated={({ camera }) => {
        camera.lookAt(0, 1.25, 0)
      }}
    >
      <color attach="background" args={['#ededeb']} />
      <hemisphereLight args={['#ffffff', '#c9c4bb', 1.7]} />
      <directionalLight
        position={[3.5, 5.2, 4.2]}
        intensity={3.2}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
      />
      <directionalLight position={[-4, 2.8, 2.5]} intensity={0.85} />
      <group position={[0, -0.01, 0]} rotation={[0, 0.16, 0]}>
        <HeroKnight />
      </group>
      <ContactShadows position={[0, 0.002, 0]} opacity={0.35} scale={5} blur={2.4} far={2.8} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[8, 8]} />
        <meshStandardMaterial color="#ededeb" roughness={0.92} />
      </mesh>
      <OrbitControls target={[0, 1.22, 0]} enablePan={false} minDistance={2.8} maxDistance={6} />
      <ReadyFlag />
    </Canvas>
  )
}

const style = document.createElement('style')
style.textContent = `
  html,
  body,
  #root {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #ededeb;
  }
`
document.head.appendChild(style)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StudioScene />
  </StrictMode>,
)
