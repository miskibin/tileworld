import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, PositionalAudio, Sparkles } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { KernelSize } from 'postprocessing'
import * as THREE from 'three'
import { Perf } from 'r3f-perf'
import { SoundScape } from '../audio/SoundScape'
import { useAudioEnabled } from '../audio/useAudioEnabled'
import { Terrain } from './Terrain'
import { Water, WaterFloor } from './Water'
import { Scatter } from './Scatter'
import { Campfire } from './Campfire'
import { Tent } from './Tent'
import { OrkCamp } from './OrkCamp'
import { Bridge } from './Bridge'
import { Character, type PlayerStateRef } from './Character'
import { Wildlife } from './Wildlife'
import { Mobs } from './Mobs'
import { DebugPaths } from './DebugPaths'
import { CENTER_X, CENTER_Z, getRiverX, getRiverZ } from './tileMap'

function DebugExpose() {
  const state = useThree()
  if (typeof window !== 'undefined') {
    ;(window as unknown as { __r3f: unknown }).__r3f = state
  }
  return null
}

function CameraFollow({ posRef }: { posRef: React.MutableRefObject<PlayerStateRef> }) {
  const controls = useThree((s) => s.controls) as unknown as { target: THREE.Vector3; update: () => void } | null
  const camera = useThree((s) => s.camera)

  useFrame((_, dt) => {
    if (!controls?.target) return
    const wx = posRef.current.x - CENTER_X
    const wz = posRef.current.z - CENTER_Z
    const wy = posRef.current.y + 0.5
    const t = controls.target
    const k = Math.min(1, dt * 5)
    const dxT = (wx - t.x) * k
    const dyT = (wy - t.y) * k
    const dzT = (wz - t.z) * k
    t.x += dxT
    t.y += dyT
    t.z += dzT
    camera.position.x += dxT
    camera.position.y += dyT
    camera.position.z += dzT
    controls.update()
  })
  return null
}

export function World() {
  // Knight spawn near map center.
  const posRef = useRef<PlayerStateRef>({ x: 32, y: 1, z: 26, moving: false })
  const audioEnabled = useAudioEnabled()

  return (
    <>
      <hemisphereLight args={['#bfd6ff', '#3a5a2a', 0.55]} />
      <ambientLight intensity={0.18} />
      <directionalLight
        position={[24, 36, 18]}
        intensity={1.5}
        color="#fff4d8"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-44}
        shadow-camera-right={44}
        shadow-camera-top={44}
        shadow-camera-bottom={-44}
        shadow-camera-near={0.5}
        shadow-camera-far={120}
        shadow-bias={-0.0005}
      />

      <fog attach="fog" args={['#173a6b', 60, 140]} />

      {/* Grid-coord group: centers island on origin. */}
      <group position={[-CENTER_X, 0, -CENTER_Z]}>
        <Terrain />
        <Scatter />
        <Character initial={[32, 1, 26]} facing0={Math.PI} posRef={posRef} />

        {/* Friendly camps */}
        <Tent position={[31, 1, 24]} rotation={Math.PI / 6} />
        <Campfire position={[33, 1, 25]} seed={0.2} />

        <Tent position={[43, 1, 23]} rotation={-Math.PI / 4} color="#7a8f4a" />
        <Campfire position={[42, 1, 24.5]} seed={1.4} />

        {/* Ork camps */}
        <OrkCamp position={[17, 1, 34]} rotation={0.3} seed={3.3} />
        <OrkCamp position={[47, 1, 14]} rotation={-0.8} seed={7.7} />

        {/* Bridges over rivers — coords use tile-row centers (x+0.5 / z+0.5) so
            the collision span lines up with where the player actually walks. */}
        <Bridge from={[getRiverX(25) - 3.5, 25.5]} to={[getRiverX(25) + 3.5, 25.5]} y={1.0} />
        <Bridge from={[getRiverX(35) - 3.5, 35.5]} to={[getRiverX(35) + 3.5, 35.5]} y={1.0} />
        <Bridge from={[40.5, getRiverZ(40) - 3.5]} to={[40.5, getRiverZ(40) + 3.5]} y={1.0} />

        {/* Wandering dogs */}
        <Wildlife />

        {/* Orks rendered from shared store (registered by OrkCamps) */}
        <Mobs />

        <DebugPaths />

        {/* Shoreline water loops — positional for stereo */}
        {audioEnabled && (
          <>
            <group position={[5, 0.5, 24]}>
              <PositionalAudio
                url="/audio/water-loop.mp3"
                autoplay
                loop
                distance={14}
                ref={(a) => { a?.setVolume(0.07) }}
              />
            </group>
            <group position={[59, 0.5, 24]}>
              <PositionalAudio
                url="/audio/water-loop.mp3"
                autoplay
                loop
                distance={14}
                ref={(a) => { a?.setVolume(0.07) }}
              />
            </group>
            <group position={[32, 0.5, 4]}>
              <PositionalAudio
                url="/audio/water-loop.mp3"
                autoplay
                loop
                distance={14}
                ref={(a) => { a?.setVolume(0.07) }}
              />
            </group>
            <group position={[32, 0.5, 44]}>
              <PositionalAudio
                url="/audio/water-loop.mp3"
                autoplay
                loop
                distance={14}
                ref={(a) => { a?.setVolume(0.07) }}
              />
            </group>
          </>
        )}
      </group>

      <WaterFloor />
      <Water />

      {/* Drifting atmospheric motes across the island */}
      <Sparkles
        position={[0, 4, 0]}
        scale={[70, 8, 70]}
        count={70}
        size={3}
        speed={0.15}
        opacity={0.25}
        color={'#cfe2ff'}
        noise={0.6}
      />

      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom
          mipmapBlur
          luminanceThreshold={1.0}
          luminanceSmoothing={0.2}
          intensity={0.9}
          kernelSize={KernelSize.LARGE}
        />
        <Vignette offset={0.4} darkness={0.55} eskil={false} />
      </EffectComposer>

      <OrbitControls
        makeDefault
        target={[0, 0.8, 0]}
        enableDamping
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2 - 0.05}
        minDistance={6}
        maxDistance={60}
        keys={{ LEFT: '', UP: '', RIGHT: '', BOTTOM: '' }}
      />
      <CameraFollow posRef={posRef} />
      <SoundScape />
      <DebugExpose />
      <Perf position="top-left" />
    </>
  )
}
