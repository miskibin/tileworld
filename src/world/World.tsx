import { Suspense, useRef, useState } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { PositionalAudio, Sparkles, Environment } from '@react-three/drei'
import {
  EffectComposer,
  Bloom,
  Vignette,
  N8AO,
  GodRays,
  HueSaturation,
  BrightnessContrast,
  SMAA,
} from '@react-three/postprocessing'
import { KernelSize, BlendFunction } from 'postprocessing'
import { Perf } from 'r3f-perf'
import { SoundScape } from '../audio/SoundScape'
import { useAudioEnabled } from '../audio/useAudioEnabled'
import { Terrain } from './Terrain'
import { Water, WaterFloor } from './Water'
import { Scatter } from './Scatter'
import { Character, type PlayerStateRef } from './Character'
import { Wildlife } from './Wildlife'
import { WildAnimals } from './WildAnimals'
import { Mobs } from './Mobs'
import { WaveDirector } from './WaveDirector'
import { Towers } from './Towers'
import { Bears } from './Bear'
import { Projectiles } from './Projectiles'
import { Chest } from './Chest'
import { HotbarInput } from './HotbarInput'
import { DebugPaths } from './DebugPaths'
import { Village, VillagerCrowd } from './Village'
import { City } from './City'
import { Birds } from './Birds'
import { Ships } from './Boat'
import { Cat } from './Cat'
import { Shop } from './Shop'
import { MouseLookCamera } from './MouseLookCamera'
import { Paths } from './Paths'
import { FloatingText } from './FloatingText'
import { DebugBindings } from './DebugBindings'
import { DayNight } from './DayNight'
import { SunShadow } from './SunShadow'
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
  // Lower flat fills than before — the HDRI environment now supplies most of
  // the ambient/bounce light, so ambient+hemi are dialled back and the sun is
  // pushed up for golden-hour contrast. Keep in sync with DebugBindings.tsx.
  const [lights, setLights] = useState({ ambient: 0.22, hemi: 0.4, dir: 2.1 })
  // GodRays needs the rendered sun mesh; capture it via callback ref.
  const [sunMesh, setSunMesh] = useState<THREE.Mesh | null>(null)

  return (
    <>
      <DebugBindings onLights={setLights} />

      {/* Day/night cycle: owns the sky dome, the sun glow sphere, the moon, the
          star field and the position-independent fill lights, and animates them
          all from the time-of-day clock (timeStore). The shadow-casting sun is
          a separate follow-the-player component (SunShadow) inside the grid
          group below, reading the same clock. */}
      <DayNight lights={lights} onSunMesh={setSunMesh} />

      {/* Image-based lighting: a sunset HDRI supplies rich, directional
          ambient + subtle reflections on every MeshStandardMaterial. Lighting
          only (background stays the <Sky> dome). Wrapped in its own Suspense
          so the HDRI fetch/parse can't blank the whole scene on first load —
          the world renders immediately and the IBL pops in when ready. */}
      <Suspense fallback={null}>
        <Environment files="/hdri/sunset_1k.hdr" environmentIntensity={0.55} />
      </Suspense>

      {/* Day fog — exponential falloff; colour is animated by the day/night
          cycle (see DayNight.tsx), density is leva-tunable. */}
      <fogExp2 attach="fog" args={['#d6c6a0', 0.025]} />

      {/* Grid-coord group: centers island on origin. */}
      <group position={[-CENTER_X, 0, -CENTER_Z]}>
        {/* Sun shadow lives in here so its frustum can follow the player in
            grid coords. Driven by lights.dir (leva-tunable, like before). */}
        <SunShadow intensity={lights.dir} />
        <Terrain />
        <Paths />
        <Scatter />
        <Character initial={[48, 1, 36]} facing0={Math.PI} posRef={posRef} />

        {/* Remote hamlet west of the castle */}
        <Village position={[26, 30]} rotation={0} seed={2.9} wallColor="#c8b094" roofColor="#7a4a26" />

        {/* Central castle — Keep + tree-built walls, houses, towers, farm */}
        <City />
        <VillagerCrowd />

        {/* Market stall just outside the south gate (the castle interior is a
            packed grid). Counter faces the gate; its tile is reserved from
            scatter in obstacles.ts so no tree spawns on it. */}
        <Shop position={[62, 1, 45]} rotation={Math.PI} />

        {/* Cats hang around the villages + castle */}
        <Cat home={[58, 1, 46]} seed={0.7} />
        <Cat home={[26, 1, 32]} seed={2.1} />
        <Cat home={[50, 1, 30]} seed={3.4} />
        <Cat home={[64, 1, 40]} seed={5.6} />

        {/* Butterflies / pollen drifting over the castle meadow */}
        <Sparkles
          position={[57, 1.3, 46]}
          scale={[22, 2, 16]}
          count={36}
          size={5}
          speed={0.35}
          opacity={0.5}
          color={'#ffe27a'}
          noise={1.2}
        />

        {/* Wandering dogs */}
        <Wildlife />

        {/* Wave director: spawns escalating ork waves that march on the keep */}
        <WaveDirector />
        <Towers />

        {/* Orks rendered from shared store (registered by WaveDirector) */}
        <Mobs />

        {/* Bears — neutral wildlife that maul the player when approached */}
        <Bears />

        {/* Wild animals: wolves hunt deer + rabbits; boars charge when provoked */}
        <WildAnimals />

        {/* Ork-shaman magic bolts (grid-space → inside the offset group) */}
        <Projectiles />

        {/* Treasure chests — interactive (press F) with loot + gold. Positions
            auto-snap to valid land, so they're safe to scatter widely. */}
        <Chest position={[44, 1, 38]} rotation={0.3} gold={15} loot={['sword_iron']} />
        <Chest position={[24, 1, 52]} rotation={-0.5} gold={25} loot={['potion', 'potion']} />
        <Chest position={[78, 1, 24]} rotation={1.0} gold={40} loot={['sword_gold']} />
        <Chest position={[60, 1, 16]} rotation={2.2} gold={10} loot={['axe', 'bread']} />
        {/* Reward chests out toward the newly expanded coastline */}
        <Chest position={[14, 1, 28]} rotation={0.8} gold={20} loot={['potion']} />
        <Chest position={[88, 1, 64]} rotation={-1.2} gold={50} loot={['feast', 'potion']} />
        <Chest position={[12, 1, 64]} rotation={1.6} gold={30} loot={['bread', 'bread', 'potion']} />
        <Chest position={[88, 1, 10]} rotation={2.6} gold={35} loot={['sword_iron']} />
        {/* Frontier chests out in the new eastern / southern wilds */}
        <Chest position={[106, 1, 50]} rotation={0.4} gold={45} loot={['sword_gold', 'potion']} />
        <Chest position={[100, 1, 80]} rotation={-0.9} gold={40} loot={['feast']} />
        <Chest position={[58, 1, 84]} rotation={1.9} gold={35} loot={['potion', 'bread']} />
        <Chest position={[112, 1, 44]} rotation={2.3} gold={50} loot={['axe', 'potion']} />

        {/* Number-key + right-click hotbar input */}
        <HotbarInput />

        {/* Floating combat text (damage numbers, +gold, +XP) */}
        <FloatingText />

        <DebugPaths />

        {/* Shoreline water loops — positional for stereo, placed at new map edges */}
        {audioEnabled && (
          <>
            <group position={[6, 0.5, 47]}>
              <PositionalAudio url="/audio/water-loop.mp3" autoplay loop distance={18} ref={(a) => { a?.setVolume(0.04) }} />
            </group>
            <group position={[118, 0.5, 47]}>
              <PositionalAudio url="/audio/water-loop.mp3" autoplay loop distance={18} ref={(a) => { a?.setVolume(0.04) }} />
            </group>
            <group position={[62, 0.5, 6]}>
              <PositionalAudio url="/audio/water-loop.mp3" autoplay loop distance={18} ref={(a) => { a?.setVolume(0.04) }} />
            </group>
            <group position={[62, 0.5, 88]}>
              <PositionalAudio url="/audio/water-loop.mp3" autoplay loop distance={18} ref={(a) => { a?.setVolume(0.04) }} />
            </group>
          </>
        )}
      </group>

      <WaterFloor />
      <Water />

      {/* Birds circling above the map — placed in world-space, outside the
          grid-offset group. */}
      <Birds />

      {/* Ships slowly circling the island on the open sea (world-space). */}
      <Ships />

      {/* Drifting atmospheric motes across the island */}
      <Sparkles
        position={[0, 4, 0]}
        scale={[120, 8, 120]}
        count={110}
        size={3}
        speed={0.15}
        opacity={0.25}
        color={'#cfe2ff'}
        noise={0.6}
      />

      {/* Gated on the sun mesh (set by its callback ref on first commit) so
          GodRays always has a valid origin — react-postprocessing's child
          typing rejects conditional effect children, and the one-frame delay
          is invisible behind the paused StartScreen. */}
      {sunMesh && (
        <EffectComposer multisampling={0} enableNormalPass={false}>
          {/* Ambient occlusion grounds props/buildings into the terrain so
              they stop looking pasted-on. Half-res keeps it cheap. */}
          <N8AO halfRes aoRadius={2.0} distanceFalloff={1.5} intensity={2.2} />
          {/* Volumetric sun shafts from the emissive sun sphere. */}
          <GodRays
            sun={sunMesh}
            blur
            samples={60}
            density={0.96}
            decay={0.92}
            weight={0.4}
            exposure={0.34}
            clampMax={1}
            blendFunction={BlendFunction.SCREEN}
          />
          {/* Selective glow on the sun + emissive surfaces (windows, fire). */}
          <Bloom
            mipmapBlur
            luminanceThreshold={1.0}
            luminanceSmoothing={0.2}
            intensity={0.7}
            kernelSize={KernelSize.LARGE}
          />
          {/* Warm cinematic grade: a touch more saturation + contrast. */}
          <HueSaturation saturation={0.12} />
          <BrightnessContrast brightness={-0.02} contrast={0.1} />
          <Vignette offset={0.35} darkness={0.5} eskil={false} />
          <SMAA />
        </EffectComposer>
      )}

      <MouseLookCamera posRef={posRef} />
      <SoundScape />
      <DebugExpose />
      <Perf position="top-left" />
    </>
  )
}
