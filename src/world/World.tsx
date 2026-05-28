import { useRef } from 'react'
import { useThree } from '@react-three/fiber'
import { PositionalAudio, Sparkles } from '@react-three/drei'
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing'
import { KernelSize } from 'postprocessing'
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
import { Village, VillagerCrowd } from './Village'
import { Birds } from './Birds'
import { Cat } from './Cat'
import { Shop } from './Shop'
import { MouseLookCamera } from './MouseLookCamera'
import { CENTER_X, CENTER_Z, getRiverX, getRiverZ } from './tileMap'

function DebugExpose() {
  const state = useThree()
  if (typeof window !== 'undefined') {
    ;(window as unknown as { __r3f: unknown }).__r3f = state
  }
  return null
}

export function World() {
  // Knight spawn near map center of the larger 96×72 map.
  const posRef = useRef<PlayerStateRef>({ x: 48, y: 1, z: 36, moving: false })
  const audioEnabled = useAudioEnabled()

  return (
    <>
      <hemisphereLight args={['#dfe9f4', '#4a6a3a', 0.75]} />
      <ambientLight intensity={0.5} />
      <directionalLight
        position={[34, 50, 26]}
        intensity={1.6}
        color="#fff4d8"
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-60}
        shadow-camera-right={60}
        shadow-camera-top={60}
        shadow-camera-bottom={-60}
        shadow-camera-near={0.5}
        shadow-camera-far={160}
        shadow-bias={-0.0005}
      />

      {/* Day fog — exponential falloff in the sky colour so the horizon
          fades into atmospheric haze and the map isn't fully visible all
          at once. */}
      <fogExp2 attach="fog" args={['#bccad6', 0.024]} />

      {/* Grid-coord group: centers island on origin. */}
      <group position={[-CENTER_X, 0, -CENTER_Z]}>
        <Terrain />
        <Scatter />
        <Character initial={[48, 1, 36]} facing0={Math.PI} posRef={posRef} />

        {/* Friendly camps */}
        <Tent position={[46, 1, 34]} rotation={Math.PI / 6} />
        <Campfire position={[48, 1, 35]} seed={0.2} />

        <Tent position={[58, 1, 33]} rotation={-Math.PI / 4} color="#7a8f4a" />
        <Campfire position={[57, 1, 34.5]} seed={1.4} />

        {/* Ork camps spread to the far corners of the larger map */}
        <OrkCamp position={[20, 1, 50]} rotation={0.3} seed={3.3} />
        <OrkCamp position={[76, 1, 22]} rotation={-0.8} seed={7.7} />

        {/* Friendly villages */}
        <Village position={[58, 44]} rotation={-0.4} seed={1.7} wallColor="#d3b78b" roofColor="#6b3322" />
        <Village position={[26, 30]} rotation={1.2} seed={2.9} wallColor="#c8b094" roofColor="#7a4a26" />
        <VillagerCrowd />

        {/* Shop next to the eastern village */}
        <Shop position={[52, 1, 42]} rotation={0.6} />

        {/* A cat hangs around each village */}
        <Cat home={[58, 1, 46]} seed={0.7} />
        <Cat home={[26, 1, 32]} seed={2.1} />

        {/* Bridges over rivers — coords use tile-row centers (x+0.5 / z+0.5) so
            the collision span lines up with where the player actually walks. */}
        <Bridge from={[getRiverX(30) - 3.5, 30.5]} to={[getRiverX(30) + 3.5, 30.5]} y={1.0} />
        <Bridge from={[getRiverX(50) - 3.5, 50.5]} to={[getRiverX(50) + 3.5, 50.5]} y={1.0} />
        <Bridge from={[64.5, getRiverZ(64) - 3.5]} to={[64.5, getRiverZ(64) + 3.5]} y={1.0} />

        {/* Wandering dogs */}
        <Wildlife />

        {/* Orks rendered from shared store (registered by OrkCamps) */}
        <Mobs />

        <DebugPaths />

        {/* Shoreline water loops — positional for stereo, placed at new map edges */}
        {audioEnabled && (
          <>
            <group position={[6, 0.5, 36]}>
              <PositionalAudio url="/audio/water-loop.mp3" autoplay loop distance={18} ref={(a) => { a?.setVolume(0.07) }} />
            </group>
            <group position={[90, 0.5, 36]}>
              <PositionalAudio url="/audio/water-loop.mp3" autoplay loop distance={18} ref={(a) => { a?.setVolume(0.07) }} />
            </group>
            <group position={[48, 0.5, 6]}>
              <PositionalAudio url="/audio/water-loop.mp3" autoplay loop distance={18} ref={(a) => { a?.setVolume(0.07) }} />
            </group>
            <group position={[48, 0.5, 66]}>
              <PositionalAudio url="/audio/water-loop.mp3" autoplay loop distance={18} ref={(a) => { a?.setVolume(0.07) }} />
            </group>
          </>
        )}
      </group>

      <WaterFloor />
      <Water />

      {/* Birds circling above the map — placed in world-space, outside the
          grid-offset group. */}
      <Birds />

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

      <MouseLookCamera posRef={posRef} />
      <SoundScape />
      <DebugExpose />
      <Perf position="top-left" />
    </>
  )
}
