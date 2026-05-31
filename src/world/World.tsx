import { Suspense, useRef, useState } from 'react'
import * as THREE from 'three'
import { useThree } from '@react-three/fiber'
import { PositionalAudio, Sparkles, Sky, Environment } from '@react-three/drei'
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
import { Ships } from './Boat'
import { Cat } from './Cat'
import { Shop } from './Shop'
import { MouseLookCamera } from './MouseLookCamera'
import { Paths } from './Paths'
import { FloatingText } from './FloatingText'
import { DebugBindings } from './DebugBindings'
import { SunShadow } from './SunShadow'
import { CENTER_X, CENTER_Z } from './tileMap'

// Golden-hour sun. One direction drives three things that must agree:
// the directional (shadow-casting) light, the <Sky> sun disc, and the
// far-away emissive sphere that the GodRays post-effect rays out from.
const SUN_DIR = new THREE.Vector3(92, 36, 60)
const SUN_FAR = SUN_DIR.clone().normalize().multiplyScalar(700)

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

      {/* Atmospheric sky dome (Preetham scattering) tuned to a low, warm sun
          so the horizon glows golden-hour and the zenith stays soft blue. */}
      <Sky
        distance={4000}
        sunPosition={SUN_DIR}
        turbidity={9}
        rayleigh={2.4}
        mieCoefficient={0.006}
        mieDirectionalG={0.82}
      />

      {/* Image-based lighting: a sunset HDRI supplies rich, directional
          ambient + subtle reflections on every MeshStandardMaterial. Lighting
          only (background stays the <Sky> dome). Wrapped in its own Suspense
          so the HDRI fetch/parse can't blank the whole scene on first load —
          the world renders immediately and the IBL pops in when ready. */}
      <Suspense fallback={null}>
        <Environment files="/hdri/sunset_1k.hdr" environmentIntensity={0.55} />
      </Suspense>

      {/* Far emissive sphere — reads as the sun's glow (blooms) and is the
          origin the GodRays effect shafts out from. */}
      <mesh ref={setSunMesh} position={SUN_FAR}>
        <sphereGeometry args={[46, 24, 24]} />
        <meshBasicMaterial color="#fff0cc" toneMapped={false} fog={false} />
      </mesh>

      {/* Position-independent fills stay in world space. The shadow-casting
          sun is a separate follow-the-player component (see SunShadow) placed
          inside the grid group below, so its shadow frustum can track the
          player in grid coords instead of statically covering the whole map. */}
      <hemisphereLight args={['#e7eef8', '#5a6a44', lights.hemi]} />
      <ambientLight intensity={lights.ambient} />

      {/* Day fog — exponential falloff in a warm haze colour so the horizon
          melts into golden-hour atmosphere and the map isn't fully visible
          all at once. */}
      <fogExp2 attach="fog" args={['#d6c6a0', 0.02]} />

      {/* Grid-coord group: centers island on origin. */}
      <group position={[-CENTER_X, 0, -CENTER_Z]}>
        {/* Sun shadow lives in here so its frustum can follow the player in
            grid coords. Driven by lights.dir (leva-tunable, like before). */}
        <SunShadow intensity={lights.dir} />
        <Terrain />
        <Paths />
        <Scatter />
        <Character initial={[48, 1, 36]} facing0={Math.PI} posRef={posRef} />

        {/* Ork camps near the biome corners + a northern warcamp */}
        <OrkCamp position={[22, 1, 52]} rotation={0} seed={3.3} />
        <OrkCamp position={[76, 1, 20]} rotation={-Math.PI / 2} seed={7.7} />
        <OrkCamp position={[74, 1, 54]} rotation={Math.PI / 2} seed={5.1} />
        <OrkCamp position={[50, 1, 13]} rotation={0} seed={9.2} />

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
              <PositionalAudio url="/audio/water-loop.mp3" autoplay loop distance={18} ref={(a) => { a?.setVolume(0.04) }} />
            </group>
            <group position={[90, 0.5, 36]}>
              <PositionalAudio url="/audio/water-loop.mp3" autoplay loop distance={18} ref={(a) => { a?.setVolume(0.04) }} />
            </group>
            <group position={[48, 0.5, 6]}>
              <PositionalAudio url="/audio/water-loop.mp3" autoplay loop distance={18} ref={(a) => { a?.setVolume(0.04) }} />
            </group>
            <group position={[48, 0.5, 66]}>
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
        scale={[70, 8, 70]}
        count={70}
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
