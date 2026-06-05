import { Suspense, useEffect, useRef, useState, type RefObject } from 'react'
import * as THREE from 'three'
import { useThree, useFrame } from '@react-three/fiber'
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
import { KernelSize, BlendFunction, VignetteEffect, HueSaturationEffect } from 'postprocessing'
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
import { OreNodes } from './OreNodes'
import { HerbPlants } from './HerbPlants'
import { AppleTrees } from './AppleTrees'
import { CampCage } from './CampCage'
import { WarBell } from './WarBell'
import { Projectiles } from './Projectiles'
import { Impacts } from './Impacts'
import { Dust } from './Dust'
import { Orbs } from './Orbs'
import { Pickups } from './Pickups'
import { Chest, type ChestVariant } from './Chest'
import { HotbarInput } from './HotbarInput'
import { DebugPaths } from './DebugPaths'
import { Village, VillagerCrowd } from './Village'
import { TraderVillage } from './TraderVillage'
import { TraderCrowd } from './Trader'
import { GraveField } from './Grave'
import { SoulWisp } from './SoulWisp'
import { SuccessionDirector } from './SuccessionDirector'
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
import { PerfTrace } from './PerfTrace'
import { QualityToggle } from './QualityToggle'
import { ShaderWarmup } from './ShaderWarmup'
import { Cullable } from './Cullable'
import { getQuality, subscribeQuality } from './qualityStore'
import { FrozenSpire } from './FrozenSpire'
import { SunkenPyramid } from './SunkenPyramid'
import { GiantDeadTree } from './GiantDeadTree'
import { StandingStones } from './StandingStones'
import { RuinedShrine } from './RuinedShrine'
import { Ballista } from './Ballista'
import { HealingShrine } from './HealingShrine'
import { registerLandmarkBlockers } from './landmarks'

// Chests scattered across the map. Data-driven so each can be wrapped in
// <Cullable> (most sit far out in the biomes — fog-hidden and worth freezing when
// the player isn't near). position auto-snaps to valid land in Chest.
//
// Two kinds (see Chest `cache`):
//  - TREASURE (default): unique gear + the deep-biome landmark rewards. One-shot —
//    opened once and gone. These are the exploration trophy.
//  - CACHE (cache: true): gold + consumable food. Refills CACHE_RESPAWN seconds
//    after opening, so the map's food/gold is a recurring daily trickle, not a
//    one-time sweep. Fewer of them than before and rung around the OUTER EDGE, so
//    the daily loot run is a real trip to the frontier.
const CHESTS: {
  pos: [number, number, number]
  rot: number
  gold: number
  loot: string[]
  cache?: boolean
}[] = [
  // ---- Treasure (one-shot): unique gear ----
  { pos: [59, 1, 59], rot: 0.3, gold: 6, loot: ['sword_iron'] },
  { pos: [104, 1, 80], rot: -1.2, gold: 14, loot: ['feast', 'mercenary_contract'] },
  { pos: [96, 1, 39], rot: 2.6, gold: 10, loot: ['mercenary_contract'] }, // by the NE trader market — teaches recruiting
  { pos: [34, 1, 30], rot: 0.5, gold: 8, loot: ['fur', 'leather_armor'] },
  { pos: [120, 1, 58], rot: -1.4, gold: 8, loot: ['goat_charm'] },
  { pos: [24, 1, 56], rot: 0.9, gold: 10, loot: ['stone_maul', 'iron_armor'] },
  { pos: [18, 1, 54], rot: 0.6, gold: 30, loot: ['gold_armor'] },
  // Deep-biome reward chests beside each biome's signature landmark (one-shot).
  { pos: [33, 1, 30], rot: 0.7, gold: 18, loot: ['feast', 'gold_armor'] }, // snow spire
  { pos: [122, 1, 25], rot: -0.8, gold: 16, loot: ['venom', 'iron_armor'] }, // desert pyramid (far NE)
  { pos: [116, 1, 82], rot: 1.5, gold: 16, loot: ['stone_maul'] }, // stone circle (SE frontier)
  { pos: [73, 1, 98], rot: 2.1, gold: 14, loot: ['croc_steak', 'potion'] }, // swamp tree (far S)
  { pos: [23, 1, 86], rot: -1.1, gold: 14, loot: ['elk_jerky', 'goat_charm'] }, // forest shrine (far SW)

  // ---- Caches (respawning): gold + food, rung around the map edge ----
  { pos: [50, 1, 22], rot: -0.5, gold: 8, loot: ['potion'], cache: true }, // N gap (snow↔desert)
  { pos: [116, 1, 24], rot: -0.6, gold: 8, loot: ['venom'], cache: true }, // NE desert rim
  { pos: [122, 1, 66], rot: 0.4, gold: 12, loot: ['potion'], cache: true }, // E rock rim
  { pos: [84, 1, 92], rot: 1.3, gold: 8, loot: ['croc_steak'], cache: true }, // SE swamp rim
  { pos: [60, 1, 94], rot: -0.9, gold: 12, loot: ['feast'], cache: true }, // S swamp rim
  { pos: [30, 1, 86], rot: 1.6, gold: 9, loot: ['bread'], cache: true }, // SW forest rim
  { pos: [20, 1, 62], rot: 2.0, gold: 8, loot: ['elk_jerky'], cache: true }, // W forest/coast rim
]
import { CENTER_X, CENTER_Z, tileAt, tileTopY, type Biome } from './tileMap'
import { chestLootFor } from './frontier'
import { CAPTURE_MODE, PERF_MODE } from './renderMode'
import { getPlayer } from './playerStore'
import { getGradePulse, gradeTunables } from './gradeStore'

// Drives the Vignette + HueSaturation passes (already in the stack, so no new
// render cost) off live player state each frame: low HP desaturates + darkens
// the edges with a slow heartbeat throb, and a fresh hit punches a brief "wince".
// Lives outside the EffectComposer so its useFrame is a plain scene tick; it only
// mutates plain uniform setters (no shader recompile). Refs are null until the
// composer mounts (high quality only), so it no-ops safely otherwise. All factors
// are live-tunable via gradeTunables (the leva "Reactive grade" folder).
function ReactiveGrade({
  vignette,
  hue,
}: {
  vignette: RefObject<VignetteEffect | null>
  hue: RefObject<HueSaturationEffect | null>
}) {
  useFrame(() => {
    const now = performance.now() * 0.001
    const pulse = getGradePulse(now)
    const g = gradeTunables
    const player = getPlayer()
    const ratio = player.maxHp > 0 ? player.hp / player.maxHp : 1
    // Dread ramps in below the threshold and deepens toward death.
    const low = ratio < g.lowThreshold ? (g.lowThreshold - ratio) / g.lowThreshold : 0
    const beat = low > 0 ? (Math.sin(now * 5.5) * 0.5 + 0.5) * low * g.heartbeat : 0
    const v = vignette.current
    if (v) v.darkness = Math.min(0.97, g.baseDarkness + low * g.lowDarken + pulse * g.winceDarken + beat)
    const h = hue.current
    if (h) h.saturation = Math.max(-0.8, g.baseSaturation - low * g.lowDesat - pulse * g.winceDesat)
  })
  return null
}

// Each chest takes on the look of the biome it sits in — auto-derived from the
// tile under it, so it stays correct regardless of the exact coordinates.
const BIOME_TO_VARIANT: Partial<Record<Biome, ChestVariant>> = {
  snow: 'snow',
  desert: 'desert',
  swamp: 'swamp',
  forest: 'forest',
  rock: 'rock',
}
function chestVariant(x: number, z: number): ChestVariant {
  const t = tileAt(Math.floor(x), Math.floor(z))
  return (t && BIOME_TO_VARIANT[t.biome]) || 'default'
}

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
  // Effect handles the ReactiveGrade driver mutates each frame (low-HP grade +
  // hit wince). Null until the composer mounts on high quality.
  const vignetteRef = useRef<VignetteEffect>(null)
  const hueRef = useRef<HueSaturationEffect>(null)
  // Render-quality tier (G key). 'low' drops the post stack below + the sun
  // shadows (SunShadow reads it per-frame) for weak GPUs.
  const [quality, setQuality] = useState(getQuality)
  useEffect(() => subscribeQuality(setQuality), [])
  // Solid collision footprints for the biome landmarks so the hero/orks route
  // around them instead of clipping through (footprints reserved from scatter in
  // obstacles.ts via the same LANDMARKS list). Cleared on unmount, scoped owner.
  useEffect(() => registerLandmarkBlockers(), [])

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

        {/* Biome signature landmarks — one focal structure per biome, a reward
            for exploring each. Placed at the biome's heart on its ground height;
            distance-culled like the chests. No lights (point-light count fixed). */}
        <Cullable x={26} z={24}>
          <FrozenSpire position={[26, tileTopY(26, 24), 24]} rotation={0.4} />
        </Cullable>
        <Cullable x={112} z={28}>
          <SunkenPyramid position={[112, tileTopY(112, 28), 28]} rotation={-0.5} />
        </Cullable>
        <Cullable x={118} z={82}>
          <StandingStones position={[118, tileTopY(118, 82), 82]} rotation={0.2} />
        </Cullable>
        <Cullable x={72} z={92}>
          <GiantDeadTree position={[72, tileTopY(72, 92), 92]} rotation={1.1} />
        </Cullable>
        <Cullable x={32} z={80}>
          <RuinedShrine position={[32, tileTopY(32, 80), 80]} rotation={-0.8} />
        </Cullable>
        <Character initial={[72, 1, 58]} facing0={Math.PI} posRef={posRef} />

        {/* Remote hamlet northwest of the castle, out in the grass belt */}
        <Cullable x={66} z={32}>
          <Village position={[66, 32]} rotation={0} seed={2.9} wallColor="#c8b094" roofColor="#7a4a26" />
        </Cullable>

        {/* NE desert caravan market — independent traders to trade with / recruit
            into the militia. Buildings (culled when far) are created here; the
            merchant NPCs + the E/R interaction live in <TraderCrowd/> below. */}
        <Cullable x={96} z={34}>
          <TraderVillage position={[96, 34]} />
        </Cullable>

        {/* Central castle — Keep + tree-built walls, houses, towers, farm */}
        <City />
        <VillagerCrowd />
        <TraderCrowd />

        {/* "The Blade Passes": graves the hero leaves behind, the spirit wisp
            mid-succession, and the dawn director that repopulates the town. */}
        <GraveField />
        <SoulWisp />
        <SuccessionDirector />

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

        {/* Town-Hall defense upgrades — each self-gates on its cityStore flag
            (renders null until built): heavy ballista + in-walls healing shrine. */}
        <Ballista />
        <HealingShrine />

        {/* Orks rendered from shared store (registered by WaveDirector) */}
        <Mobs />

        {/* Pre-compile ork/grave shaders behind the StartScreen so the first
            real spawn doesn't hitch the frame mid-combat. Self-removes on start.
            Skipped in capture mode: it compiles the post stack that capture drops,
            and (in a headless StrictMode mount) it can keep the camera pinned to
            the warm-up path, so a screenshot never follows the player. */}
        {!CAPTURE_MODE && <ShaderWarmup />}

        {/* Ork war-camps out in the wilds — daytime targets the player can ride
            out and clear. Orks here guard their camp (home anchor) instead of
            marching on the keep; blue warband so they read apart from the red
            night-horde (and brawl any wave ork that strays near). */}
        <Cullable x={34} z={72}>
          <OrkCamp position={[34, tileTopY(34, 72), 72]} rotation={1.4} seed={1.2} faction="blue" />
        </Cullable>
        <Cullable x={104} z={32}>
          <OrkCamp position={[104, tileTopY(104, 32), 32]} rotation={-1.6} seed={2.7} faction="blue" />
        </Cullable>
        <Cullable x={74} z={26}>
          <OrkCamp position={[74, tileTopY(74, 26), 26]} rotation={0.1} seed={4.1} faction="blue" />
        </Cullable>

        {/* Captive cages at each camp — clear the camp's guards and the freed
            villagers join the militia as heirs (rescue.ts). Kept OUTSIDE Cullable
            so the cage never unmounts and re-spawns its captives. */}
        <CampCage camp={{ x: 34, z: 72 }} offset={[-2, -1]} captives={2} seed={0.2} />
        <CampCage camp={{ x: 104, z: 32 }} offset={[2, 2]} captives={2} seed={0.6} />
        <CampCage camp={{ x: 74, z: 26 }} offset={[-2, -1]} captives={2} seed={0.9} />

        {/* War bell in the courtyard — ring it (E) during the day to summon the
            night early, once you're done preparing. */}
        <WarBell position={[72, tileTopY(72, 60), 60]} />

        {/* Bears — neutral wildlife that maul the player when approached */}
        <Bears />

        {/* Ore boulders — mine for stone (defense upgrades) in the rock highlands */}
        <OreNodes />

        {/* Marsh herbs — forage in the swamp (slow + poison hazard) for heal/resist potions */}
        <HerbPlants />

        {/* Forest apples — forage in the western wood for a quick heal (pairs with the hunt) */}
        <AppleTrees />

        {/* Wild animals: wolves hunt deer + rabbits; boars charge when provoked */}
        <WildAnimals />

        {/* Ork-shaman magic bolts (grid-space → inside the offset group) */}
        <Projectiles />

        {/* Hit-impact spark/splinter bursts (grid-space, pooled like bolts) */}
        <Impacts />

        {/* Soft ground dust kicked up by sprinting / landing (grid-space pool) */}
        <Dust />

        {/* Reward orbs (gold/XP) that burst off kills and home to the hero */}
        <Orbs />

        {/* Ground loot dropped by slain creatures (grid-space, pooled like Impacts) */}
        <Pickups />

        {/* Treasure chests — interactive (press F) with loot + gold. Most sit far
            out in the biome ring, so each is distance-culled: fog hides them and
            <Cullable> stops three from processing their meshes until you're near
            (see CHESTS above + Cullable.tsx). */}
        {CHESTS.map((c, i) => {
          // Treasure (one-shot gear) chests roll their gear by frontier distance
          // — the best gear surfaces only at the rim. Caches (the food/gold
          // trickle economy) and token/teaching chests keep hand-authored loot.
          const isToken = c.loot.includes('mercenary_contract')
          const r = c.cache || isToken ? { loot: c.loot, gold: c.gold } : chestLootFor(c.pos[0], c.pos[2])
          return (
            <Cullable key={i} x={c.pos[0]} z={c.pos[2]}>
              <Chest
                position={c.pos}
                rotation={c.rot}
                gold={r.gold}
                loot={r.loot}
                cache={c.cache}
                variant={chestVariant(c.pos[0], c.pos[2])}
              />
            </Cullable>
          )
        })}

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
      {sunMesh && !CAPTURE_MODE && quality === 'high' && (
        <>
        <EffectComposer multisampling={0} enableNormalPass={false}>
          {/* Ambient occlusion grounds props/buildings into the terrain so
              they stop looking pasted-on. Half-res + the "performance" preset
              (8 AO samples / 4 denoise vs the default ~16/8) keeps this AO march
              — the other expensive post pass — cheap; the denoise + half-res blur
              hide the lower sample count. */}
          <N8AO halfRes quality="performance" aoRadius={2.0} distanceFalloff={1.5} intensity={2.2} />
          {/* Volumetric sun shafts from the emissive sun sphere. The shafts are
              low-frequency and `blur`-smoothed, so they tolerate a lower march
              resolution + fewer samples with no visible change — and that's the
              single most expensive post pass. (resolutionScale defaults to 0.5;
              0.4 + 36 samples roughly halves its fill cost vs the old 60.) */}
          <GodRays
            sun={sunMesh}
            blur
            samples={36}
            resolutionScale={0.4}
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
            kernelSize={KernelSize.MEDIUM}
          />
          {/* Warm cinematic grade: a touch more saturation + contrast. Saturation
              is driven down by ReactiveGrade when the hero is hurt. */}
          <HueSaturation ref={hueRef} saturation={gradeTunables.baseSaturation} />
          <BrightnessContrast brightness={-0.02} contrast={0.1} />
          {/* Darkness is driven up by ReactiveGrade on low HP / a fresh hit. */}
          <Vignette ref={vignetteRef} offset={0.35} darkness={gradeTunables.baseDarkness} eskil={false} />
          <SMAA />
        </EffectComposer>
        <ReactiveGrade vignette={vignetteRef} hue={hueRef} />
        </>
      )}

      <MouseLookCamera posRef={posRef} />
      <SoundScape />
      <DebugExpose />
      {/* r3f-perf queries gl.info + writes its overlay DOM every frame — real
          CPU cost. Dev or explicit ?perf only; never ships to players. */}
      {(import.meta.env.DEV || PERF_MODE) && <Perf position="top-left" />}
      <QualityToggle />
      {(import.meta.env.DEV || PERF_MODE) && <PerfTrace />}
    </>
  )
}
