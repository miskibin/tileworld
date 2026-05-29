import { useRef, useState } from 'react'
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
import { OrkCamp } from './OrkCamp'
import { Character, type PlayerStateRef } from './Character'
import { Wildlife } from './Wildlife'
import { Mobs } from './Mobs'
import { Bears } from './Bear'
import { Chest } from './Chest'
import { HotbarInput } from './HotbarInput'
import { DebugPaths } from './DebugPaths'
import { Village, VillagerCrowd } from './Village'
import { City } from './City'
import { Birds } from './Birds'
import { Cat } from './Cat'
import { Shop } from './Shop'
import { MouseLookCamera } from './MouseLookCamera'
import { Paths } from './Paths'
import { FloatingText } from './FloatingText'
import { DebugBindings } from './DebugBindings'
import { CENTER_X, CENTER_Z } from './tileMap'

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
  const [lights, setLights] = useState({ ambient: 0.5, hemi: 0.75, dir: 1.6 })

  return (
    <>
      <DebugBindings onLights={setLights} />
      <hemisphereLight args={['#dfe9f4', '#4a6a3a', lights.hemi]} />
      <ambientLight intensity={lights.ambient} />
      <directionalLight
        position={[34, 50, 26]}
        intensity={lights.dir}
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
        <Paths />
        <Scatter />
        <Character initial={[48, 1, 36]} facing0={Math.PI} posRef={posRef} />

        {/* Ork camps near the biome corners + a northern warcamp */}
        <OrkCamp position={[22, 1, 52]} rotation={0.3} seed={3.3} />
        <OrkCamp position={[76, 1, 20]} rotation={-0.8} seed={7.7} />
        <OrkCamp position={[74, 1, 54]} rotation={1.1} seed={5.1} />
        <OrkCamp position={[50, 1, 13]} rotation={0} seed={9.2} />

        {/* Remote hamlet west of the castle */}
        <Village position={[26, 30]} rotation={1.2} seed={2.9} wallColor="#c8b094" roofColor="#7a4a26" />

        {/* Central castle — Keep + tree-built walls, houses, towers, farm */}
        <City />
        <VillagerCrowd />

        {/* Market shop just inside the castle's south side */}
        <Shop position={[50, 1, 41]} rotation={Math.PI} />

        {/* A cat hangs around each village */}
        <Cat home={[58, 1, 46]} seed={0.7} />
        <Cat home={[26, 1, 32]} seed={2.1} />

        {/* Wandering dogs */}
        <Wildlife />

        {/* Orks rendered from shared store (registered by OrkCamps) */}
        <Mobs />

        {/* Bears — neutral wildlife that maul the player when approached */}
        <Bears />

        {/* Treasure chests — interactive (press F) with loot + gold. Positions
            auto-snap to valid land, so they're safe to scatter widely. */}
        <Chest position={[44, 1, 38]} rotation={0.3} gold={15} loot={['sword_iron']} />
        <Chest position={[24, 1, 52]} rotation={-0.5} gold={25} loot={['potion', 'potion']} />
        <Chest position={[78, 1, 24]} rotation={1.0} gold={40} loot={['sword_gold']} />
        <Chest position={[60, 1, 16]} rotation={2.2} gold={10} loot={['axe', 'bread']} />
        {/* Reward chests out toward the newly expanded coastline */}
        <Chest position={[10, 1, 12]} rotation={0.8} gold={20} loot={['potion']} />
        <Chest position={[88, 1, 64]} rotation={-1.2} gold={50} loot={['feast', 'potion']} />
        <Chest position={[12, 1, 64]} rotation={1.6} gold={30} loot={['bread', 'bread', 'potion']} />
        <Chest position={[88, 1, 10]} rotation={2.6} gold={35} loot={['sword_iron']} />

        {/* Number-key + right-click hotbar input */}
        <HotbarInput />

        {/* Floating combat text (damage numbers, +gold, +XP) */}
        <FloatingText />

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
