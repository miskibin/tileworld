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
import { OrkCamp } from './OrkCamp'
import { WaveDirector } from './WaveDirector'
import { Towers } from './Towers'
import { KeepArchers } from './KeepArchers'
import { Bears } from './Bear'
import { Projectiles } from './Projectiles'
import { Impacts } from './Impacts'
import { Pickups } from './Pickups'
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
import { CAPTURE_MODE } from './renderMode'

function DebugExpose() {
  const state = useThree()
  if (typeof window !== 'undefined') {
    ;(window as unknown as { __r3f: unknown }).__r3f = state
  }
  return null
}

export function World() {
  // Knight spawns at the centred castle (matches PLAYER_SPAWN in playerStore).
  const posRef = useRef<PlayerStateRef>({ x: 72, y: 1, z: 58, moving: false })
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
        <Character initial={[72, 1, 58]} facing0={Math.PI} posRef={posRef} />

        {/* Remote hamlet northwest of the castle, out in the grass belt */}
        <Village position={[50, 38]} rotation={0} seed={2.9} wallColor="#c8b094" roofColor="#7a4a26" />

        {/* Central castle — Keep + tree-built walls, houses, towers, farm */}
        <City />
        <VillagerCrowd />

        {/* Market stall just outside the south gate (the castle interior is a
            packed grid). Counter faces the gate; its tile is reserved from
            scatter in obstacles.ts so no tree spawns on it. */}
        <Shop position={[68, 1, 71]} rotation={Math.PI} />

        {/* Cats hang around the villages + castle */}
        <Cat home={[72, 1, 67]} seed={0.7} />
        <Cat home={[50, 1, 40]} seed={2.1} />
        <Cat home={[66, 1, 50]} seed={3.4} />
        <Cat home={[80, 1, 58]} seed={5.6} />

        {/* Butterflies / pollen drifting over the castle meadow */}
        <Sparkles
          position={[72, 1.3, 66]}
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
        <KeepArchers />

        {/* Orks rendered from shared store (registered by WaveDirector) */}
        <Mobs />

        {/* Ork war-camps out in the wilds — daytime targets the player can ride
            out and clear. Orks here guard their camp (home anchor) instead of
            marching on the keep; blue warband so they read apart from the red
            night-horde (and brawl any wave ork that strays near). */}
        <OrkCamp position={[32, 1.5, 54]} rotation={1.4} seed={1.2} faction="blue" />
        <OrkCamp position={[109, 1.5, 56]} rotation={-1.6} seed={2.7} faction="blue" />
        <OrkCamp position={[72, 1.5, 25]} rotation={0.1} seed={4.1} faction="blue" />

        {/* Bears — neutral wildlife that maul the player when approached */}
        <Bears />

        {/* Wild animals: wolves hunt deer + rabbits; boars charge when provoked */}
        <WildAnimals />

        {/* Ork-shaman magic bolts (grid-space → inside the offset group) */}
        <Projectiles />

        {/* Hit-impact spark/splinter bursts (grid-space, pooled like bolts) */}
        <Impacts />

        {/* Ground loot dropped by slain creatures (grid-space, pooled like Impacts) */}
        <Pickups />

        {/* Treasure chests — interactive (press F) with loot + gold. Positions
            auto-snap to valid land, so they're safe to scatter widely. */}
        {/* Lean loot: small gold + a few potions, and ONE starter Iron Sword.
            Strong weapons (Battle Axe / Golden Blade) are shop/arsenal-only now,
            so exploring no longer pays for the whole defense. */}
        <Chest position={[59, 1, 59]} rotation={0.3} gold={6} loot={['sword_iron']} />
        <Chest position={[60, 1, 40]} rotation={-0.5} gold={8} loot={['potion']} />
        <Chest position={[90, 1, 46]} rotation={1.0} gold={12} loot={['potion']} />
        <Chest position={[78, 1, 38]} rotation={2.2} gold={5} loot={['bread']} />
        {/* Reward chests out in the biome ring */}
        <Chest position={[44, 1, 46]} rotation={0.8} gold={7} loot={['potion']} />
        <Chest position={[104, 1, 80]} rotation={-1.2} gold={14} loot={['feast']} />
        <Chest position={[40, 1, 80]} rotation={1.6} gold={9} loot={['bread']} />
        <Chest position={[96, 1, 30]} rotation={2.6} gold={10} loot={['potion']} />
        {/* Frontier chests out toward the mountains + far coast */}
        <Chest position={[120, 1, 66]} rotation={0.4} gold={12} loot={['potion']} />
        <Chest position={[60, 1, 88]} rotation={-0.9} gold={12} loot={['feast']} />
        <Chest position={[50, 1, 66]} rotation={1.9} gold={9} loot={['bread']} />
        <Chest position={[100, 1, 44]} rotation={2.3} gold={13} loot={['potion']} />

        {/* Number-key + right-click hotbar input */}
        <HotbarInput />

        {/* Floating combat text (damage numbers, +gold, +XP) */}
        <FloatingText />

        <DebugPaths />

        {/* Shoreline water loops — positional for stereo, placed at new map edges */}
        {audioEnabled && (
          <>
            <group position={[6, 0.5, 54]}>
              <PositionalAudio url="/audio/water-loop.mp3" autoplay loop distance={18} ref={(a) => { a?.setVolume(0.04) }} />
            </group>
            <group position={[138, 0.5, 54]}>
              <PositionalAudio url="/audio/water-loop.mp3" autoplay loop distance={18} ref={(a) => { a?.setVolume(0.04) }} />
            </group>
            <group position={[72, 0.5, 6]}>
              <PositionalAudio url="/audio/water-loop.mp3" autoplay loop distance={18} ref={(a) => { a?.setVolume(0.04) }} />
            </group>
            <group position={[72, 0.5, 102]}>
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
      {sunMesh && !CAPTURE_MODE && (
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
