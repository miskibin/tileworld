import { useRef, useMemo, useState, useEffect, type MutableRefObject } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { tileAt, tileTopY, canStepOrDrop, CASTLE_CENTER, CASTLE_SAFE_R } from './tileMap'
import { obstacleCollidesAt } from './obstacles'
import { useKeyboard } from './useKeyboard'
import { playSfx, stopVoice } from '../audio/audio'
import { sayHeroLine, wildernessSpoken, resetHeroVoice } from './voiceStore'
import { getWave } from './waveStore'
import { markCombat, resetCombat } from './combatStore'
import { playSwing, playHit, playPick, playKill, playPlayerAttack, playPlayerJump } from '../audio/sfx'
import { addShake, spawnFloat, addFovKick, resetFovKick, fovTunables } from './fxStore'
import { spawnImpact } from './impactStore'
import { spawnDust, dustForBiome } from './dustStore'
import { spawnPickup } from './pickupStore'
import { frontierFactor, rollGear } from './frontier'
import { getWeaponBonus, getInventory, subscribeInventory, ITEM_DEFS } from './inventoryStore'
import { damageDog, getAliveDogs } from './dogStore'
import { damageOrk, knockbackOrk, getAliveOrks, orkCollidesAt } from './orkStore'
import { damageBear, getAliveBears, bearCollidesAt } from './bearStore'
import { damageAnimal, getAliveAnimals, animalCollidesAt } from './animalStore'
import { damageOre, getAliveOre, oreCollidesAt } from './oreStore'
import { addStone } from './resourceStore'
import { ANIMAL_CONFIG } from './animalConfig'
import { bridgeAt } from './bridges'
import { houseBlocksAt } from './houseBlockers'
import {
  damagePlayer,
  getAttackDamage,
  getPlayer,
  respawnPlayerAt,
  setPlayerPos,
  consumeTeleport,
  XP_PER_ORK,
  getCritChance,
  getLifesteal,
  getMoveSpeedMult,
  getCleave,
  getBountyMult,
  healPlayer,
  rollCrit,
} from './playerStore'
import { isFrozen } from './pauseStore'
import { triggerHitStop, getTimeScale, resetHitStop } from './hitStopStore'
import { orkBountyGold, orkBountyXp } from './orkConfig'
import { spawnOrbs } from './orbStore'
import { getDamageDealtMult, getSpeedMult } from './buffStore'
import { nearestVillager, removeVillager } from './villagerStore'
import { addGrave, startSoul, clearSoul, SUCCESSION_DURATION } from './successionStore'
import { setPhase, setDefeatReason } from './gameStore'
import {
  getBlockState,
  BLOCK_STAMINA_MAX,
  BLOCK_DRAIN_HOLD,
  BLOCK_REGEN,
  BLOCK_REGEN_DELAY,
  BLOCK_RECOVER_THRESHOLD,
} from './blockStore'

const ARMOR = '#d6d8df'
const ARMOR_LIGHT = '#e6e8ed'
const ARMOR_DARK = '#9aa0aa'
const VISOR = '#1a1a22'
const BELT = '#3a2a1a'
const BLADE = '#c0c6d0'
const HILT = '#3a3a40'
const GRIP = '#5a3a22'
const SHIELD_FACE = '#a8b8d0'
const SHIELD_RIM = '#6a3a22'
const SHIELD_EMBLEM = '#d3b14c'
// Shield poses (own pivot, decoupled from the left arm). Rest: slung on the
// left flank, decorated face out (−X). Block: swung across the front, face +Z.
const SHIELD_REST_POS = new THREE.Vector3(-0.3, 0.62, 0.06)
const SHIELD_REST_ROT = new THREE.Euler(0.04, -1.3, 0.05)
// Block shield is thrust out front (z far enough that the bracing forearm tip,
// which reaches ~0.47, tucks BEHIND the plate instead of poking through it).
const SHIELD_BLOCK_POS = new THREE.Vector3(-0.12, 0.82, 0.5)
const SHIELD_BLOCK_ROT = new THREE.Euler(-0.12, 0.05, -0.05)
const GOLD = '#e8b84b' // Golden Blade gilding
const AXE_STEEL = '#aab0bc' // Battle Axe head
// Endpoints for deriving light/dark plate shades from an armor tint.
const WHITE = new THREE.Color('#ffffff')
const BLACK = new THREE.Color('#000000')

const SPEED = 3.5 // grid units per second
const SPRINT_MULT = 1.75 // shift-held speed multiplier
// Swamp hazard: the bog drags at your boots and its vapours bite. The stake that
// makes foraging marsh herbs (HerbPlants) a real risk/reward trip.
const SWAMP_SLOW = 0.75 // movement multiplier while standing on a swamp tile
const SWAMP_POISON = 2 // HP lost per poison tick in the swamp
const SWAMP_POISON_INTERVAL = 2.5 // seconds between poison ticks
const TURN_RATE = 12 // higher = snappier rotation
const STEP_FREQ = 7 // walk-cycle radians per second
const GRAVITY = 20 // y units / sec^2
const JUMP_SPEED = 6.5 // initial vertical velocity on jump
// Fall damage: a drop taller than FALL_SAFE world-units (≈ a 2-class cliff; a
// normal jump rises only ~1.06 so it never triggers) hurts, scaled by how far
// past the threshold you fell, capped so a tall peak isn't an instant kill.
const FALL_SAFE = 1.1
const FALL_DMG_PER_UNIT = 16
const FALL_DMG_MAX = 45
const PLAYER_RADIUS = 0.22 // collision radius for obstacle blocking
const ATTACK_DURATION = 0.45 // seconds for full swing
const ATTACK_RANGE = 1.8 // grid units reach
const ATTACK_CONE_DOT = 0.5 // cos(60°) — front cone width
// Attack damage scales with level — see getAttackDamage() in playerStore.

// Module-level click counter — survives React strict-mode double-mount.
let attackClickCount = 0
if (typeof window !== 'undefined') {
  window.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return
    const t = e.target
    if (t instanceof Element && t.closest('.hud')) return
    attackClickCount++
  })
}

// Hero biome-entry voice lines — the muttered "oh, a forest…" thoughts. Played
// once per biome per run; `spokenBiomes` is module-level so it survives React
// strict-mode remounts and is cleared on Character unmount (new game). 'grass'
// is the castle safe-zone → the "home" intro line.
const BIOME_VO: Record<string, string> = {
  grass: '/audio/vo/home.mp3',
  forest: '/audio/vo/forest.mp3',
  desert: '/audio/vo/desert.mp3',
  snow: '/audio/vo/snow.mp3',
  rock: '/audio/vo/rock.mp3',
  swamp: '/audio/vo/swamp.mp3',
}

const DIRT_STEP_VARIANTS = [
  '/audio/footstep-dirt-var-1.wav',
  '/audio/footstep-dirt-var-2.wav',
  '/audio/footstep-dirt-var-3.wav',
] as const

export interface PlayerStateRef {
  x: number
  z: number
  y: number
  moving: boolean
}

interface CharacterProps {
  initial: [number, number, number] // grid x, y, z (inside offset group)
  facing0?: number
  posRef?: MutableRefObject<PlayerStateRef>
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return a + d * t
}

// Frontier loot drop on a slain DAY creature (wildlife/bears, never night-wave
// orks): the farther from the castle, the better the odds and the higher the
// gear tier — top gear only at the rim. Near the castle frontierFactor≈0 so the
// chance is the 10% floor with low-tier loot, keeping early hunting unchanged.
function maybeFrontierDrop(x: number, y: number, z: number): void {
  const f = frontierFactor(x, z)
  if (Math.random() < 0.1 + 0.35 * f) {
    spawnPickup(rollGear(f, Math.random()), x - 0.4, y, z + 0.4)
  }
}

export function Character({ initial, facing0 = 0, posRef }: CharacterProps) {
  const groupRef = useRef<THREE.Group>(null!)
  const bodyRef = useRef<THREE.Group>(null!)
  const rightArmRef = useRef<THREE.Group>(null!)
  const leftArmRef = useRef<THREE.Group>(null!)
  const shieldRef = useRef<THREE.Group>(null!)
  const rightLegRef = useRef<THREE.Group>(null!)
  const leftLegRef = useRef<THREE.Group>(null!)
  const headRef = useRef<THREE.Group>(null!)
  const swordRef = useRef<THREE.Group>(null!)

  const pos = useRef({ x: initial[0], y: initial[1], z: initial[2] })
  const facing = useRef(facing0)
  const walkPhase = useRef(0)
  // Dev-only: profiling scripts teleport the player by writing pos.current
  // (Character owns the position, so setting the store alone gets overwritten).
  useEffect(() => {
    if (import.meta.env.DEV && typeof window !== 'undefined') {
      ;(window as unknown as { __charpos: typeof pos.current }).__charpos = pos.current
    }
  }, [])
  const movingAmt = useRef(0) // 0..1 smoothly tracks isMoving
  const velY = useRef(0)
  const onGround = useRef(true)
  // World-Y the player last left the ground at — drives fall-damage on landing.
  const airTakeoffY = useRef(initial[1])
  const lastStepHalfCycle = useRef(0)
  // Biome whose voice line is currently playing (null if none) — drives the
  // fade-stop when the player walks out before the line finishes.
  const speakingBiome = useRef<string | null>(null)
  // Debounce + freshness clocks for biome musings (seconds, performance.now):
  //  - diffSince: when curBiome first differed from the speaking biome (−1 = same),
  //    so a frayed-edge freckle / road / lake / bridge tile that flips the biome
  //    for an instant doesn't clip the line.
  //  - enteredAt + lastSeen: when he first set foot in the current biome, so a
  //    musing that can't play promptly (blocked by another line) is dropped
  //    instead of fired stale 15 s into exploring it.
  const biomeDiffSince = useRef(-1)
  const biomeEnteredAt = useRef(0)
  const lastBiomeSeen = useRef<string | null>(null)
  // Next R3F-clock time the swamp's poison may bite again.
  const swampPoisonAt = useRef(0)

  // Attack state — left-click triggers a single swing.
  const attackProcessed = useRef(0)
  const attacking = useRef(false)
  // Swing timer runs on a hit-stop-scaled clock (not wall-clock), so the swing
  // animation actually hangs on the blow during hit-stop instead of sweeping on.
  const attackClock = useRef(0)
  const attackStart = useRef(0)
  const attackHitDealt = useRef(false)

  // Succession ("Blade Passes"): resolved once per death. heir holds where the
  // spirit is flying to (the chosen villager's spot), or null if the town is
  // empty and the bloodline ends.
  const successionStarted = useRef(false)
  const deathAt = useRef(0)
  const heir = useRef<{ x: number; y: number; z: number } | null>(null)

  // Clear any lingering hit-stop when the world unmounts (new game / restart) so
  // a freeze triggered on the last frame can't carry getTimeScale()=0 into the
  // next run's first frames. Matches the unmount-reset pattern of Orbs/Projectiles.
  useEffect(() => () => { resetHitStop(); resetFovKick(); stopVoice(); resetHeroVoice(); resetCombat() }, [])

  const keys = useKeyboard()
  const camera = useThree((s) => s.camera)

  // ─── Materials (memoized) ───────────────────────────────────────
  const armorMat = useMemo(() => new THREE.MeshStandardMaterial({ color: ARMOR, roughness: 0.65, metalness: 0.25 }), [])
  const armorLightMat = useMemo(() => new THREE.MeshStandardMaterial({ color: ARMOR_LIGHT, roughness: 0.6, metalness: 0.3 }), [])
  const armorDarkMat = useMemo(() => new THREE.MeshStandardMaterial({ color: ARMOR_DARK, roughness: 0.75, metalness: 0.2 }), [])
  const visorMat = useMemo(() => new THREE.MeshStandardMaterial({ color: VISOR, roughness: 0.4, metalness: 0.6 }), [])
  const beltMat = useMemo(() => new THREE.MeshStandardMaterial({ color: BELT, roughness: 1 }), [])
  const bladeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: BLADE, roughness: 0.25, metalness: 0.85 }), [])
  const hiltMat = useMemo(() => new THREE.MeshStandardMaterial({ color: HILT, roughness: 0.6, metalness: 0.5 }), [])
  const gripMat = useMemo(() => new THREE.MeshStandardMaterial({ color: GRIP, roughness: 1 }), [])
  const shieldFaceMat = useMemo(() => new THREE.MeshStandardMaterial({ color: SHIELD_FACE, roughness: 0.5, metalness: 0.3 }), [])
  const shieldRimMat = useMemo(() => new THREE.MeshStandardMaterial({ color: SHIELD_RIM, roughness: 0.9 }), [])
  const shieldEmblemMat = useMemo(() => new THREE.MeshStandardMaterial({ color: SHIELD_EMBLEM, roughness: 0.5, metalness: 0.6 }), [])
  const goldBladeMat = useMemo(() => new THREE.MeshStandardMaterial({ color: GOLD, roughness: 0.3, metalness: 0.8 }), [])
  const axeHeadMat = useMemo(() => new THREE.MeshStandardMaterial({ color: AXE_STEEL, roughness: 0.45, metalness: 0.6 }), [])
  const stoneHeadMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8a8d92', roughness: 0.95, metalness: 0.05, flatShading: true }), [])

  // The held weapon mesh follows the equipped item (hotbar select/E → equip).
  const [equippedId, setEquippedId] = useState<string | null>(getInventory().equippedId)
  // Equipped armor id drives the plate re-skin below (separate equip slot).
  const [armorId, setArmorId] = useState<string | null>(getInventory().equippedArmorId)
  useEffect(
    () =>
      subscribeInventory(() => {
        const inv = getInventory()
        setEquippedId(inv.equippedId)
        setArmorId(inv.equippedArmorId)
      }),
    [],
  )

  // Re-skin the knight's plate to the worn armor. Mutating the shared armor
  // materials in place recolors every plate mesh at once with no re-render; bare
  // (armorId === null) restores the exact default steel palette.
  useEffect(() => {
    const def = armorId ? ITEM_DEFS[armorId] : null
    if (!def) {
      armorMat.color.set(ARMOR); armorMat.metalness = 0.25
      armorLightMat.color.set(ARMOR_LIGHT); armorLightMat.metalness = 0.3
      armorDarkMat.color.set(ARMOR_DARK); armorDarkMat.metalness = 0.2
      return
    }
    const c = new THREE.Color(def.armorTint ?? ARMOR)
    const metal = def.armorMetal ?? 0.25
    armorMat.color.copy(c); armorMat.metalness = metal
    armorLightMat.color.copy(c.clone().lerp(WHITE, 0.28)); armorLightMat.metalness = metal
    armorDarkMat.color.copy(c.clone().lerp(BLACK, 0.3)); armorDarkMat.metalness = metal * 0.8
  }, [armorId, armorMat, armorLightMat, armorDarkMat])

  // Cached working vectors (avoid per-frame allocation).
  const camFwd = useMemo(() => new THREE.Vector3(), [])
  const camRight = useMemo(() => new THREE.Vector3(), [])
  const moveDir = useMemo(() => new THREE.Vector3(), [])

  useFrame((rfState, dtRaw) => {
    if (isFrozen()) {
      // Discard any clicks queued while paused so user doesn't auto-swing on resume.
      attackProcessed.current = attackClickCount
      return
    }
    // Hit-stop: dt collapses to ~0 for a few frames after a connect so movement /
    // swing animation hang on the blow while the renderer keeps drawing.
    const dt = dtRaw * getTimeScale()
    // Swing clock advances on the hit-stop-scaled dt, so getTimeScale()=0 holds
    // the in-progress swing frozen for the duration of the freeze.
    attackClock.current += dt
    const tNow = performance.now() * 0.001
    const player = getPlayer()

    // Teleport request (dev jump / future fast-travel): snap the authoritative
    // pos ref to the queued tile, then let the rest of the frame run normally.
    const tp = consumeTeleport()
    if (tp) {
      pos.current.x = tp.x
      pos.current.z = tp.z
      pos.current.y = tileTopY(Math.floor(tp.x), Math.floor(tp.z))
    }

    // ─── Death handling: "The Blade Passes" ─────────────────────────────────
    // The hero never simply respawns. On death his body stays as a grave and
    // his spirit (a soul wisp) flies to the nearest townsperson, who rises as
    // the new hero with all progression intact. If no villager remains, the
    // bloodline — and the run — ends.
    if (player.deadSince !== null) {
      // Resolve the heir + plant the grave once, on the first frame of death.
      if (!successionStarted.current) {
        successionStarted.current = true
        deathAt.current = tNow
        const dx = pos.current.x
        const dy = pos.current.y
        const dz = pos.current.z
        addGrave(dx, dy, dz) // the fallen body becomes a marker on the field
        const v = nearestVillager(dx, dz)
        if (v) {
          heir.current = { x: v.x, y: v.y, z: v.z }
          removeVillager(v.id) // this townsperson takes up the blade
          startSoul({ fromX: dx, fromY: dy, fromZ: dz, toX: v.x, toY: v.y, toZ: v.z, startAt: tNow })
          addShake(0.5)
        } else {
          heir.current = null // no one left — the line ends
        }
      }

      // Measure from our own death stamp, not player.deadSince: attackers set
      // deadSince in the R3F clock (a different origin than performance.now()),
      // so the two can't be subtracted. deathAt shares the wisp's clock.
      const elapsed = tNow - deathAt.current

      // No successor: lie still, then lose the run (bloodline ended).
      if (heir.current === null) {
        if (elapsed >= SUCCESSION_DURATION) {
          setDefeatReason('bloodline')
          setPhase('defeat')
        }
        if (groupRef.current) {
          const tilt = Math.min(1, elapsed / 0.6) * (Math.PI / 2)
          groupRef.current.position.set(pos.current.x, pos.current.y, pos.current.z)
          groupRef.current.rotation.set(0, facing.current, tilt)
        }
        setPlayerPos(pos.current.x, pos.current.y, pos.current.z, false, facing.current)
        attackProcessed.current = attackClickCount
        getBlockState().blocking = false
        return
      }

      // Spirit in flight: lie at the death spot until it reaches the heir, then
      // rise there as the new hero.
      if (elapsed >= SUCCESSION_DURATION) {
        const h = heir.current
        respawnPlayerAt(h.x, h.y, h.z)
        pos.current.x = h.x
        pos.current.y = h.y
        pos.current.z = h.z
        velY.current = 0
        onGround.current = true
        airTakeoffY.current = h.y
        facing.current = Math.PI
        attacking.current = false
        clearSoul()
        successionStarted.current = false
        heir.current = null
      } else {
        // Lie-down anim at the death spot; freeze movement & attack input.
        if (groupRef.current) {
          const tilt = Math.min(1, elapsed / 0.6) * (Math.PI / 2)
          groupRef.current.position.set(pos.current.x, pos.current.y, pos.current.z)
          groupRef.current.rotation.set(0, facing.current, tilt)
        }
        setPlayerPos(pos.current.x, pos.current.y, pos.current.z, false, facing.current)
        attackProcessed.current = attackClickCount
        getBlockState().blocking = false
        return
      }
    }

    const k = keys.current

    // Input → camera-relative move vector
    camera.getWorldDirection(camFwd)
    camFwd.y = 0
    if (camFwd.lengthSq() < 1e-6) camFwd.set(0, 0, -1)
    camFwd.normalize()
    // camRight = camFwd × up (right-handed). With up=(0,1,0): right = (-fz, 0, fx).
    camRight.set(-camFwd.z, 0, camFwd.x)

    const fwdAmt = (k.forward ? 1 : 0) - (k.back ? 1 : 0)
    const rgtAmt = (k.right ? 1 : 0) - (k.left ? 1 : 0)

    moveDir
      .copy(camFwd)
      .multiplyScalar(fwdAmt)
      .addScaledVector(camRight, rgtAmt)

    const moving = moveDir.lengthSq() > 1e-6
    if (moving) moveDir.normalize()

    // Smooth moving amount for anim blending
    const targetMoving = moving ? 1 : 0
    movingAmt.current += (targetMoving - movingAmt.current) * Math.min(1, dt * 10)

    // ─── Apply motion with axis-separated collision (tile + props) ──
    const sprinting = moving && k.sprint
    // Swamp drag — read the tile under the player; the bog cuts move speed.
    const onSwamp = tileAt(Math.floor(pos.current.x), Math.floor(pos.current.z))?.biome === 'swamp'
    // Swamp vapours — a periodic poison tick while in the bog (resist buff from a
    // Marsh Herb cuts it via damagePlayer's mitigation). Applies even when still.
    if (onSwamp && player.hp > 0) {
      const tn = rfState.clock.getElapsedTime()
      if (tn >= swampPoisonAt.current) {
        swampPoisonAt.current = tn + SWAMP_POISON_INTERVAL
        damagePlayer(SWAMP_POISON, tn)
        spawnFloat('☠', '#9be38a', pos.current.x, pos.current.y + 2.2, pos.current.z, 1.0)
      }
    }
    if (moving) {
      const swampFactor = onSwamp ? SWAMP_SLOW : 1
      const step = SPEED * (sprinting ? SPRINT_MULT : 1) * getSpeedMult() * getMoveSpeedMult() * swampFactor * dt
      const nx = pos.current.x + moveDir.x * step
      const nz = pos.current.z + moveDir.z * step
      const cxFloor = Math.floor(pos.current.x)
      const czFloor = Math.floor(pos.current.z)
      // Terrain step uses the player climb rule (canStepOrDrop): climbing is
      // capped at one height-class (Δ ≥ 2 faces block), but you may walk OFF any
      // height — gravity carries you down and fall damage is applied on landing.
      const canMoveX =
        canStepOrDrop(cxFloor, czFloor, Math.floor(nx), czFloor) &&
        !obstacleCollidesAt(nx, pos.current.z, PLAYER_RADIUS) &&
        !orkCollidesAt(nx, pos.current.z, PLAYER_RADIUS) &&
        !bearCollidesAt(nx, pos.current.z, PLAYER_RADIUS) &&
        !animalCollidesAt(nx, pos.current.z, PLAYER_RADIUS) &&
        !oreCollidesAt(nx, pos.current.z, PLAYER_RADIUS) &&
        !houseBlocksAt(nx, pos.current.z)
      const canMoveZ =
        canStepOrDrop(cxFloor, czFloor, cxFloor, Math.floor(nz)) &&
        !obstacleCollidesAt(pos.current.x, nz, PLAYER_RADIUS) &&
        !orkCollidesAt(pos.current.x, nz, PLAYER_RADIUS) &&
        !bearCollidesAt(pos.current.x, nz, PLAYER_RADIUS) &&
        !animalCollidesAt(pos.current.x, nz, PLAYER_RADIUS) &&
        !oreCollidesAt(pos.current.x, nz, PLAYER_RADIUS) &&
        !houseBlocksAt(pos.current.x, nz)
      if (canMoveX) pos.current.x = nx
      if (canMoveZ) pos.current.z = nz

      // Face movement direction
      const targetFacing = Math.atan2(moveDir.x, moveDir.z)
      facing.current = lerpAngle(facing.current, targetFacing, Math.min(1, dt * TURN_RATE))
    }

    // ─── Vertical: gravity + jump + tile-height ground ──────────
    const onBridge = bridgeAt(pos.current.x, pos.current.z)
    const tileBelow = tileAt(Math.floor(pos.current.x), Math.floor(pos.current.z))
    const groundY = onBridge ? onBridge.y : tileBelow ? tileTopY(Math.floor(pos.current.x), Math.floor(pos.current.z)) : 0

    // ─── Biome voice: the hero mutters a thought the first time he enters each
    // biome (sayHeroLine handles the once-per-run + min-gap + single-mouth gates).
    // The line fades out if he walks out of that biome before it finishes.
    const curBiome = tileBelow?.biome
    const tnow = performance.now() * 0.001
    // Cut the line only when he STAYS in a different named biome for ~0.7 s — not
    // on a single transient tile flip. Biome blobs have frayed edges (stray grass
    // freckles inside the rim, biome freckles out in the grass) and roads/lakes/
    // bridges flip the tile biome for an instant; without the debounce those clip
    // the musing "for no reason" while he's still inside the biome.
    if (speakingBiome.current) {
      if (curBiome && curBiome !== speakingBiome.current) {
        if (biomeDiffSince.current < 0) biomeDiffSince.current = tnow
        if (tnow - biomeDiffSince.current > 0.7) {
          stopVoice()
          speakingBiome.current = null
          biomeDiffSince.current = -1
        }
      } else {
        biomeDiffSince.current = -1 // back in the speaking biome (or over water)
      }
    }
    if (curBiome) {
      // Stamp first-entry time per biome so a musing that can't fire promptly is
      // dropped, not spoken stale long after he's done exploring.
      if (curBiome !== lastBiomeSeen.current) {
        lastBiomeSeen.current = curBiome
        biomeEnteredAt.current = tnow
      }
      // 'grass' is the frontier filler covering the whole island, not just the
      // keep — so only treat it as HOME (and speak the "home, finally" line) when
      // actually near the castle, and only once he's roamed a wilderness biome.
      let line: string | undefined = BIOME_VO[curBiome]
      if (curBiome === 'grass') {
        const dx = pos.current.x - CASTLE_CENTER.x
        const dz = pos.current.z - CASTLE_CENTER.z
        const nearHome = dx * dx + dz * dz < (CASTLE_SAFE_R * 1.25) ** 2
        if (!nearHome || !wildernessSpoken()) line = undefined
      }
      // Only muse within ~6 s of entering; past that the "oh, a forest" is stale.
      const fresh = tnow - biomeEnteredAt.current < 6
      if (line && fresh && sayHeroLine('biome:' + curBiome, line)) {
        speakingBiome.current = curBiome
      }
    }

    // ─── Night warning: when ~15s of the prep day remain, nudge the player to
    // head back (once per prep period). Uses the "getting dark, night soon" clip.
    const wv = getWave()
    if (wv.prepSecondsLeft > 0 && wv.prepSecondsLeft <= 15) {
      sayHeroLine('night:' + wv.index, '/audio/vo/night.mp3')
    }
    const wasOnGround = onGround.current
    if (k.jump && onGround.current) {
      velY.current = JUMP_SPEED
      onGround.current = false
      if (Math.random() < 0.4) playPlayerJump()
    }
    velY.current -= GRAVITY * dt
    pos.current.y += velY.current * dt
    if (pos.current.y <= groundY) {
      // Landed. If we fell from far enough above (walked off a cliff or jumped
      // off a peak), take fall damage scaled by the drop past the safe height.
      if (!wasOnGround) {
        const fall = airTakeoffY.current - groundY
        // Landing dust scaled by the drop — a real jump/fall thumps up a ring,
        // tiny slope-steps (< 0.25) stay quiet so descending a hill isn't a
        // dust cloud. Fires regardless of damage.
        if (fall > 0.25) {
          const land = Math.min(1.4, fall)
          const dust = dustForBiome(tileBelow?.biome)
          spawnDust(pos.current.x, groundY + 0.05, pos.current.z, {
            count: Math.round(3 + land * 5),
            spread: 0.7 + land * 0.9,
            up: 0.4 + land * 0.5,
            size: 1 + land * 0.5,
            color: dust.color,
          })
        }
        if (fall > FALL_SAFE) {
          const dmg = Math.min(FALL_DMG_MAX, Math.round((fall - FALL_SAFE) * FALL_DMG_PER_UNIT))
          if (dmg > 0) {
            damagePlayer(dmg, tNow)
            addFovKick(fovTunables.land) // crunchy impact on a hard landing
          }
        }
      }
      pos.current.y = groundY
      velY.current = 0
      onGround.current = true
    } else {
      // Just left the ground (walked off an edge or jumped) — remember from how
      // high, so the landing can measure the drop.
      if (wasOnGround) airTakeoffY.current = pos.current.y
      onGround.current = false
    }

    // ─── Shield block: resolve from RMB + stamina (single timing owner) ──
    // Character.useFrame is the ONLY place stamina is advanced by dt, so the
    // store never mixes time bases (damagePlayer only subtracts a flat chunk).
    const blk = getBlockState()
    const canBlock = !attacking.current && player.deadSince === null
    if (blk.wantBlock && canBlock && !blk.locked && blk.stamina > 0) {
      blk.blocking = true
      blk.stamina = Math.max(0, blk.stamina - BLOCK_DRAIN_HOLD * dt)
      blk.regenPause = BLOCK_REGEN_DELAY
      if (blk.stamina <= 0) {
        blk.locked = true
        blk.blocking = false
      }
    } else {
      blk.blocking = false
      if (blk.regenPause > 0) {
        blk.regenPause = Math.max(0, blk.regenPause - dt)
      } else if (blk.stamina < BLOCK_STAMINA_MAX) {
        blk.stamina = Math.min(BLOCK_STAMINA_MAX, blk.stamina + BLOCK_REGEN * dt)
        if (blk.locked && blk.stamina >= BLOCK_RECOVER_THRESHOLD) blk.locked = false
      }
    }

    // ─── Animation drivers ──────────────────────────────────────
    const t = performance.now() * 0.001
    if (moving) walkPhase.current += dt * STEP_FREQ * (sprinting ? SPRINT_MULT : 1)
    const wp = walkPhase.current
    const m = movingAmt.current

    // Footstep audio — fire on each half walk-cycle (one per leg plant) when moving and grounded
    if (moving && onGround.current) {
      const half = Math.floor(wp / Math.PI)
      if (half !== lastStepHalfCycle.current) {
        lastStepHalfCycle.current = half
        // Surface-matched footstep: snow on the icy massif, stone on rock
        // highlands, soft dirt everywhere else.
        const b = tileBelow?.biome
        const stepClip =
          b === 'snow' ? '/audio/footstep-snow.mp3'
          : b === 'rock' ? '/audio/footstep-stone.mp3'
          : DIRT_STEP_VARIANTS[(Math.random() * DIRT_STEP_VARIANTS.length) | 0]
        void playSfx(stepClip, 0.12, 0.12)
        // Footfall dust: a sprint always kicks up a puff; a plain walk only
        // stirs loose ground (sand / snow / scree) so packed grass stays clean.
        const dust = dustForBiome(b)
        if (sprinting) {
          spawnDust(pos.current.x, groundY + 0.05, pos.current.z, { count: 3, spread: 0.95, up: 0.5, size: 1.1, color: dust.color })
        } else if (dust.loose) {
          spawnDust(pos.current.x, groundY + 0.05, pos.current.z, { count: 2, spread: 0.55, up: 0.3, size: 0.8, color: dust.color })
        }
      }
    } else {
      lastStepHalfCycle.current = Math.floor(wp / Math.PI)
    }

    // Body bob: small idle sway + step bounce when walking
    const idleBob = Math.sin(t * 1.4) * 0.025
    const walkBob = Math.abs(Math.sin(wp)) * 0.05
    const bobY = idleBob * (1 - m) + walkBob * m

    // Leg swing
    const legSwing = Math.sin(wp) * 0.7 * m
    if (rightLegRef.current) rightLegRef.current.rotation.x = legSwing
    if (leftLegRef.current) leftLegRef.current.rotation.x = -legSwing

    // Arm swing — opposite to corresponding leg; blend with idle sway when still
    const idleSway = Math.sin(t * 1.1) * 0.08 * (1 - m)
    const armSwing = Math.sin(wp + Math.PI) * 0.55 * m

    // ─── Attack: kick off queued swing ──────────────────────────
    // Guarding takes priority — discard any swings queued while the shield is up
    // so the player doesn't auto-attack the instant they lower it.
    if (blk.blocking) {
      attackProcessed.current = attackClickCount
    } else if (!attacking.current && attackClickCount > attackProcessed.current) {
      attackProcessed.current = attackClickCount
      attacking.current = true
      attackStart.current = attackClock.current
      attackHitDealt.current = false
      // Whoosh is deferred to hit-resolution: a connecting strike plays the
      // impact alone, a whiff plays the empty-swing whoosh. (grunt still here.)
      playPlayerAttack()
    }

    // Attack drive — horizontal slash that's clearly visible.
    // Override rotations on sword arm + small body twist.
    let attackArmX: number | null = null
    let attackArmY: number | null = null
    let attackArmZ: number | null = null
    let attackSwordZ: number | null = null
    let attackBodyTwist = 0
    if (attacking.current) {
      const phase = (attackClock.current - attackStart.current) / ATTACK_DURATION
      if (phase >= 1) {
        attacking.current = false
      } else {
        // Lift arm forward through whole swing (sword horizontal).
        // Holding arm out so sword sweeps a wide horizontal arc.
        const liftX = -1.1 // arm rotated up so sword points forward
        if (phase < 0.2) {
          // Windup: ramp lift + swing arm to the RIGHT (cross body)
          const u = phase / 0.2
          attackArmX = liftX * u
          attackArmY = 1.4 * u
          attackBodyTwist = 0.25 * u
        } else if (phase < 0.55) {
          // Strike: snap arm from +Y to -Y, sweeping the blade across
          const u = (phase - 0.2) / 0.35
          attackArmX = liftX
          attackArmY = 1.4 - 2.8 * u
          attackBodyTwist = 0.25 - 0.55 * u
        } else {
          // Return: ease back to neutral
          const u = (phase - 0.55) / 0.45
          attackArmX = liftX * (1 - u)
          attackArmY = -1.4 * (1 - u)
          attackBodyTwist = -0.3 * (1 - u)
        }
        // Slight downward bite on the blade so it angles into target
        attackArmZ = -0.25 * Math.sin(phase * Math.PI)
        // Sword angles around its grip on the strike
        attackSwordZ = 0.5 * Math.sin(phase * Math.PI)

        // Hit at strike start — apply damage once
        if (!attackHitDealt.current && phase >= 0.3) {
          attackHitDealt.current = true
          // Creature stores stamp hurtFlashUntil in R3F-clock time (their views
          // read clock.getElapsedTime()). Character's own timers run on
          // performance.now(), a different origin — pass the clock time here so
          // the hit-flash decays in 0.25s instead of staying stuck (which flipped
          // bears upside down via the recoil rotation).
          const hitT = rfState.clock.getElapsedTime()
          // Roll crit once per swing — the whole strike crits or it doesn't.
          const baseDmg = (getAttackDamage() + getWeaponBonus()) * getDamageDealtMult()
          const { damage: critDmg, crit: didCrit } = rollCrit(baseDmg, getCritChance())
          const dmg = Math.round(critDmg)
          const fx = Math.sin(facing.current)
          const fz = Math.cos(facing.current)
          const px = pos.current.x
          const pz = pos.current.z
          // Shared swing-cone test: returns the offset vector to a target inside
          // the arc (for knockback), or null. One predicate for every hittable —
          // dogs, orks, bears, animals, ore — so the cone math lives in one place.
          const inCone = (tx: number, tz: number): { vx: number; vz: number } | null => {
            const vx = tx - px
            const vz = tz - pz
            const dist = Math.hypot(vx, vz)
            if (dist > ATTACK_RANGE || dist < 0.001) return null
            if ((vx / dist) * fx + (vz / dist) * fz < ATTACK_CONE_DOT) return null
            return { vx, vz }
          }
          let hitAny = false
          let killedAny = false
          let hitOre = false
          for (const dog of getAliveDogs()) {
            if (!inCone(dog.x, dog.z)) continue
            const died = damageDog(dog, dmg, hitT)
            hitAny = true
            if (died) killedAny = true
          }
          // Primary cone hits — track who was struck so Cleave can splash to
          // neighbours without double-hitting these.
          const bounty = getBountyMult()
          const lifesteal = getLifesteal()
          const orkList = getAliveOrks()
          const directHits: typeof orkList = []
          for (const ork of orkList) {
            const hit = inCone(ork.x, ork.z)
            if (!hit) continue
            const died = damageOrk(ork, dmg, hitT)
            hitAny = true
            markCombat() // trading blows with a threat → day combat music
            directHits.push(ork)
            if (!died) knockbackOrk(ork, hit.vx, hit.vz, didCrit ? 6 : 4)
            spawnImpact(ork.x, ork.y + 1.0, ork.z, {
              color: died ? '#fff0b0' : '#ffcf6a',
              count: died ? 16 : 8,
              spread: died ? 4 : 3,
              up: died ? 2 : 1.4,
            })
            if (died) {
              killedAny = true
              if (lifesteal > 0) healPlayer(lifesteal)
              // Reward scales with the ork's variant (a shaman pays more than a
              // grunt) — read from orkConfig so tougher kills are worth more.
              const gold = orkBountyGold(ork.variant, bounty)
              const xp = orkBountyXp(ork.variant)
              // Reward now bursts out as orbs that home to the hero; gold/XP land
              // when each orb arrives (see orbStore), so the HUD counter races up.
              spawnOrbs('gold', ork.x, ork.y + 0.9, ork.z, Math.max(2, Math.min(4, Math.round(gold / 4))), gold)
              spawnOrbs('xp', ork.x, ork.y + 0.9, ork.z, 4, xp)
              // Rare war-spoils: a Mercenary Contract spent to recruit a trader
              // (see recruit.ts). Low odds so a recruit feels earned — a few per
              // night of heavy fighting.
              if (Math.random() < 0.04) spawnPickup('mercenary_contract', ork.x, ork.y + 0.4, ork.z)
            } else if (didCrit) {
              spawnFloat(`${dmg}!`, '#ffd24a', ork.x, ork.y + 2.2, ork.z, 1.6)
            } else {
              spawnFloat(`${dmg}`, '#ffffff', ork.x, ork.y + 2.2, ork.z)
            }
          }

          // ─── Cleave: splash 30% to orks beside any orks we directly hit ──
          const cleaveFrac = getCleave()
          if (cleaveFrac > 0 && directHits.length > 0) {
            const cleaveDmg = Math.round(dmg * cleaveFrac)
            const CLEAVE_R2 = 2 * 2
            for (const ork of orkList) {
              if (ork.hp <= 0) continue
              if (directHits.includes(ork)) continue // don't double-hit the primaries
              let near = false
              for (const hit of directHits) {
                const ddx = ork.x - hit.x
                const ddz = ork.z - hit.z
                if (ddx * ddx + ddz * ddz <= CLEAVE_R2) {
                  near = true
                  break
                }
              }
              if (!near) continue
              const died = damageOrk(ork, cleaveDmg, hitT)
              hitAny = true
              if (!died) knockbackOrk(ork, ork.x - pos.current.x, ork.z - pos.current.z, 3)
              spawnImpact(ork.x, ork.y + 1.0, ork.z, {
                color: died ? '#fff0b0' : '#ffcf6a',
                count: died ? 12 : 5,
                spread: died ? 3.5 : 2.4,
                up: died ? 1.8 : 1.2,
              })
              if (died) {
                killedAny = true
                if (lifesteal > 0) healPlayer(lifesteal)
                const gold = orkBountyGold(ork.variant, bounty)
                const xp = orkBountyXp(ork.variant)
                spawnOrbs('gold', ork.x, ork.y + 0.9, ork.z, Math.max(2, Math.min(4, Math.round(gold / 4))), gold)
                spawnOrbs('xp', ork.x, ork.y + 0.9, ork.z, 4, xp)
              } else {
                spawnFloat(`${cleaveDmg}`, '#cfd8ff', ork.x, ork.y + 2.2, ork.z)
              }
            }
          }
          for (const bear of getAliveBears()) {
            if (!inCone(bear.x, bear.z)) continue
            const died = damageBear(bear, dmg, hitT)
            hitAny = true
            spawnImpact(bear.x, bear.y + 1.1, bear.z, {
              color: died ? '#fff0b0' : '#ffcf6a',
              count: died ? 20 : 10,
              spread: died ? 4.4 : 3.2,
              up: died ? 2.2 : 1.5,
            })
            if (died) {
              killedAny = true
              // Bears are tougher — bigger bounty, so a fatter burst of orbs.
              spawnOrbs('gold', bear.x, bear.y + 1.0, bear.z, 5, 20)
              spawnOrbs('xp', bear.x, bear.y + 1.0, bear.z, 5, XP_PER_ORK * 2)
              maybeFrontierDrop(bear.x, bear.y, bear.z)
            } else {
              spawnFloat(`${dmg}`, '#ffffff', bear.x, bear.y + 2.4, bear.z)
            }
          }
          for (const animal of getAliveAnimals()) {
            if (!inCone(animal.x, animal.z)) continue
            const died = damageAnimal(animal, dmg, hitT)
            hitAny = true
            spawnImpact(animal.x, animal.y + 0.8, animal.z, {
              color: died ? '#fff0b0' : '#ffcf6a',
              count: died ? 12 : 6,
              spread: died ? 3.4 : 2.6,
              up: died ? 1.8 : 1.3,
            })
            if (died) {
              killedAny = true
              const c = ANIMAL_CONFIG[animal.species]
              spawnOrbs(
                'gold',
                animal.x,
                animal.y + 0.8,
                animal.z,
                Math.max(2, Math.min(5, Math.round(c.bountyGold / 5))),
                c.bountyGold,
              )
              if (c.dropItemId && Math.random() < (c.dropChance ?? 1)) {
                spawnPickup(c.dropItemId, animal.x, animal.y, animal.z)
              }
              // Rarer second drop (armor off the boss-tier creatures); offset a
              // little so the two pickups don't stack on the same tile.
              if (c.dropItemId2 && Math.random() < (c.dropChance2 ?? 1)) {
                spawnPickup(c.dropItemId2, animal.x + 0.5, animal.y, animal.z + 0.5)
              }
              spawnOrbs('xp', animal.x, animal.y + 0.8, animal.z, 4, c.bountyXp)
              maybeFrontierDrop(animal.x, animal.y, animal.z)
            } else {
              spawnFloat(`${dmg}`, '#ffffff', animal.x, animal.y + 2.0, animal.z)
            }
          }
          // Snapshot before the ore loop: anything hit so far is a creature, so
          // a swing that lands on both an ork and a boulder still plays the
          // meaty flesh hit rather than the metallic chip.
          const hitCreature = hitAny
          // ─── Mining: ore boulders shatter for stone (rock highlands) ──
          for (const o of getAliveOre()) {
            if (!inCone(o.x, o.z)) continue
            const broke = damageOre(o, dmg, hitT)
            hitOre = true
            spawnImpact(o.x, o.y + 0.5, o.z, {
              color: broke ? '#cdd3da' : '#9aa0a6',
              count: broke ? 16 : 7,
              spread: broke ? 3.2 : 2.2,
              up: broke ? 1.6 : 1.1,
            })
            if (broke) {
              addStone(o.stoneReward)
              // First ore broken this run — the hero explains stone → defenses.
              // (Kept at the mine site, not inside addStone, so the resource
              // store stays a pure data layer.)
              sayHeroLine('first-stone', '/audio/vo/stone.mp3')
              spawnFloat(`+${o.stoneReward} 🪨`, '#cdd3da', o.x, o.y + 1.6, o.z, 1.4)
            } else {
              spawnFloat(`${dmg}`, '#c0c6cc', o.x, o.y + 1.6, o.z)
            }
          }
          // Combat juice: impact SFX + camera shake + hit-stop scaled to the
          // outcome. A kill freezes longer so a takedown lands with more weight.
          if (killedAny) {
            playKill()
            addShake(0.55)
            addFovKick(fovTunables.kill) // takedown shoves the view out — extra oomph
            triggerHitStop(0.09)
          } else if (hitCreature) {
            playHit()
            addShake(0.3)
            addFovKick(fovTunables.hit) // a connecting blow lands with weight
            triggerHitStop(0.05)
          } else if (hitOre) {
            // Only stone was struck — metallic chip instead of the flesh hit.
            playPick()
            addShake(0.3)
            addFovKick(fovTunables.hit)
            triggerHitStop(0.05)
          } else {
            // Whiffed — only now the empty-swing whoosh, so a connecting hit
            // never stacks whoosh + impact.
            playSwing()
          }
        }
      }
    }

    if (rightArmRef.current) {
      rightArmRef.current.rotation.x = attackArmX !== null ? attackArmX : armSwing + idleSway
      rightArmRef.current.rotation.y = attackArmY !== null ? attackArmY : 0
      rightArmRef.current.rotation.z = attackArmZ !== null ? attackArmZ : 0
    }
    if (leftArmRef.current) {
      if (blk.blocking) {
        // Raise the shield arm across the front to brace behind the shield.
        leftArmRef.current.rotation.x = -1.25
        leftArmRef.current.rotation.z = 0.4
      } else {
        leftArmRef.current.rotation.x = -armSwing - idleSway
        leftArmRef.current.rotation.z = 0
      }
    }
    // Shield rides its own pivot (decoupled from the arm): slung on the flank
    // at rest, swung across the front when guarding. Lerp gives the raise weight.
    if (shieldRef.current) {
      const tgtPos = blk.blocking ? SHIELD_BLOCK_POS : SHIELD_REST_POS
      const tgtRot = blk.blocking ? SHIELD_BLOCK_ROT : SHIELD_REST_ROT
      const a = 1 - Math.pow(0.0015, dt) // frame-rate-independent damp (~0.3s)
      shieldRef.current.position.lerp(tgtPos, a)
      const r = shieldRef.current.rotation
      r.x = THREE.MathUtils.lerp(r.x, tgtRot.x, a)
      r.y = THREE.MathUtils.lerp(r.y, tgtRot.y, a)
      r.z = THREE.MathUtils.lerp(r.z, tgtRot.z, a)
    }

    // Head — looks around when idle, stays forward when running
    if (headRef.current) {
      headRef.current.rotation.y = Math.sin(t * 0.4) * 0.18 * (1 - m)
      headRef.current.rotation.x = Math.sin(t * 0.6) * 0.04 * (1 - m)
    }

    // Body breathing scale (idle only)
    if (bodyRef.current) {
      const s = 1 + Math.sin(t * 1.8) * 0.025 * (1 - m)
      bodyRef.current.scale.set(s, 1 + Math.sin(t * 1.8) * 0.015 * (1 - m), s)
      // Lean slightly forward when running
      bodyRef.current.rotation.x = 0.18 * m
    }

    // Sword "tap" cycle — only while idle and not attacking
    // NOTE: base sword orientation is rotation.x = -π/2 so the blade
    // extends forward (arm-local +Z) instead of backward.
    if (swordRef.current) {
      if (attackSwordZ !== null) {
        swordRef.current.rotation.x = -Math.PI / 2
        swordRef.current.rotation.z = attackSwordZ
      } else {
        let lift = 0
        const cyc = (t % 4) / 4
        if (cyc < 0.2) lift = (cyc / 0.2) * 0.18
        else if (cyc < 0.6) lift = (1 - (cyc - 0.2) / 0.4) * 0.18
        swordRef.current.rotation.x = -Math.PI / 2 + lift * (1 - m)
        swordRef.current.rotation.z = 0
      }
    }

    // Apply group transform
    if (groupRef.current) {
      groupRef.current.position.set(pos.current.x, pos.current.y + bobY, pos.current.z)
      // Add tiny facing sway when idle + body twist during attack.
      // Explicitly clear X/Z so the death-tilt rotation can't bleed into the
      // upright state after respawn.
      const sway = Math.sin(t * 0.55) * 0.04 * (1 - m)
      groupRef.current.rotation.set(0, facing.current + sway + attackBodyTwist, 0)
    }

    // Publish position to parent for camera follow
    if (posRef) {
      posRef.current.x = pos.current.x
      posRef.current.z = pos.current.z
      posRef.current.y = pos.current.y
      posRef.current.moving = moving
    }
    // Publish to module store so ork AI can read it (facing drives the block cone).
    setPlayerPos(pos.current.x, pos.current.y, pos.current.z, moving, facing.current)
  })

  return (
    <group ref={groupRef} position={initial} rotation={[0, facing0, 0]} scale={0.5}>
      {/* Legs — each pivots at hip (y=0.36) */}
      <group ref={rightLegRef} position={[0.1, 0.36, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow material={armorDarkMat}>
          <boxGeometry args={[0.16, 0.36, 0.18]} />
        </mesh>
      </group>
      <group ref={leftLegRef} position={[-0.1, 0.36, 0]}>
        <mesh position={[0, -0.18, 0]} castShadow material={armorDarkMat}>
          <boxGeometry args={[0.16, 0.36, 0.18]} />
        </mesh>
      </group>

      {/* Belt */}
      <mesh position={[0, 0.4, 0]} castShadow material={beltMat}>
        <boxGeometry args={[0.42, 0.08, 0.22]} />
      </mesh>

      {/* Body (breathes + leans) */}
      <group ref={bodyRef} position={[0, 0.66, 0]}>
        <mesh castShadow material={armorMat}>
          <boxGeometry args={[0.42, 0.46, 0.26]} />
        </mesh>
        <mesh position={[0, 0.04, 0.135]} castShadow material={armorLightMat}>
          <boxGeometry args={[0.32, 0.32, 0.02]} />
        </mesh>
      </group>

      {/* Right arm (sword hand) — pivots at shoulder */}
      <group ref={rightArmRef} position={[0.27, 0.87, 0]}>
        <mesh position={[0, -0.02, 0]} castShadow material={armorLightMat}>
          <boxGeometry args={[0.18, 0.1, 0.28]} />
        </mesh>
        <mesh position={[0, -0.21, 0]} castShadow material={armorMat}>
          <boxGeometry args={[0.12, 0.42, 0.22]} />
        </mesh>
        <mesh position={[0, -0.45, 0]} castShadow material={armorDarkMat}>
          <boxGeometry args={[0.13, 0.08, 0.23]} />
        </mesh>
        {/* Held weapon — swaps mesh to match the equipped item; group transform +
            swing animation are shared across all variants. */}
        <group ref={swordRef} position={[0, -0.5, 0.06]} rotation={[-Math.PI / 2, 0, 0]}>
          {equippedId === 'axe' ? (
            <>
              {/* Battle Axe — wooden haft + broad steel head */}
              <mesh position={[0, -0.12, 0]} castShadow material={gripMat}>
                <cylinderGeometry args={[0.028, 0.028, 0.8, 8]} />
              </mesh>
              <mesh position={[0, 0.3, 0]} castShadow material={hiltMat}>
                <sphereGeometry args={[0.04, 8, 6]} />
              </mesh>
              <mesh position={[0.13, -0.42, 0]} castShadow material={axeHeadMat}>
                <boxGeometry args={[0.26, 0.22, 0.05]} />
              </mesh>
              {/* Cutting edge — cone tipped outward (+x) */}
              <mesh position={[0.28, -0.42, 0]} rotation={[0, 0, -Math.PI / 2]} castShadow material={axeHeadMat}>
                <coneGeometry args={[0.11, 0.14, 4]} />
              </mesh>
            </>
          ) : equippedId === 'sword_gold' ? (
            <>
              {/* Golden Blade — longer, gilded sword */}
              <mesh position={[0, 0.14, 0]} castShadow material={goldBladeMat}>
                <sphereGeometry args={[0.05, 10, 8]} />
              </mesh>
              <mesh position={[0, 0.06, 0]} castShadow material={gripMat}>
                <cylinderGeometry args={[0.03, 0.03, 0.14, 8]} />
              </mesh>
              <mesh position={[0, -0.04, 0]} castShadow material={goldBladeMat}>
                <boxGeometry args={[0.32, 0.06, 0.08]} />
              </mesh>
              <mesh position={[0, -0.48, 0]} castShadow material={goldBladeMat}>
                <boxGeometry args={[0.09, 0.82, 0.028]} />
              </mesh>
              <mesh position={[0, -0.92, 0]} rotation={[Math.PI, 0, 0]} castShadow material={goldBladeMat}>
                <coneGeometry args={[0.045, 0.12, 4]} />
              </mesh>
            </>
          ) : equippedId === 'stone_maul' ? (
            <>
              {/* Stone Maul — long wooden haft topped with a heavy stone head */}
              <mesh position={[0, -0.1, 0]} castShadow material={gripMat}>
                <cylinderGeometry args={[0.035, 0.035, 0.95, 8]} />
              </mesh>
              {/* Blocky stone head */}
              <mesh position={[0, -0.6, 0]} castShadow material={stoneHeadMat}>
                <boxGeometry args={[0.34, 0.26, 0.26]} />
              </mesh>
              {/* Striking faces — slightly proud caps on each side */}
              <mesh position={[0.19, -0.6, 0]} castShadow material={stoneHeadMat}>
                <boxGeometry args={[0.06, 0.2, 0.2]} />
              </mesh>
              <mesh position={[-0.19, -0.6, 0]} castShadow material={stoneHeadMat}>
                <boxGeometry args={[0.06, 0.2, 0.2]} />
              </mesh>
            </>
          ) : (
            <>
              {/* Iron Sword — default (also shown bare-handed) */}
              <mesh position={[0, 0.14, 0]} castShadow material={hiltMat}>
                <sphereGeometry args={[0.05, 10, 8]} />
              </mesh>
              <mesh position={[0, 0.06, 0]} castShadow material={gripMat}>
                <cylinderGeometry args={[0.03, 0.03, 0.14, 8]} />
              </mesh>
              <mesh position={[0, -0.04, 0]} castShadow material={hiltMat}>
                <boxGeometry args={[0.28, 0.06, 0.08]} />
              </mesh>
              <mesh position={[0, -0.42, 0]} castShadow material={bladeMat}>
                <boxGeometry args={[0.08, 0.7, 0.025]} />
              </mesh>
              <mesh position={[0, -0.82, 0]} rotation={[Math.PI, 0, 0]} castShadow material={bladeMat}>
                <coneGeometry args={[0.04, 0.1, 4]} />
              </mesh>
            </>
          )}
        </group>
      </group>

      {/* Left arm (shield hand) — pivots at shoulder */}
      <group ref={leftArmRef} position={[-0.27, 0.87, 0]}>
        <mesh position={[0, -0.02, 0]} castShadow material={armorLightMat}>
          <boxGeometry args={[0.18, 0.1, 0.28]} />
        </mesh>
        <mesh position={[0, -0.21, 0]} castShadow material={armorMat}>
          <boxGeometry args={[0.12, 0.42, 0.22]} />
        </mesh>
        <mesh position={[0, -0.45, 0]} castShadow material={armorDarkMat}>
          <boxGeometry args={[0.13, 0.08, 0.23]} />
        </mesh>
      </group>

      {/* Shield — own pivot near the left shoulder. Animated between flank
          (rest) and front (block) in useFrame; built centered on its origin,
          decorated face on +Z. Bigger heater plate that reads at game scale. */}
      <group ref={shieldRef} position={SHIELD_REST_POS} rotation={SHIELD_REST_ROT}>
        {/* Plate */}
        <mesh castShadow material={shieldFaceMat}>
          <boxGeometry args={[0.42, 0.58, 0.05]} />
        </mesh>
        {/* Rim border (raised frame around the front face) */}
        <mesh position={[0, 0, 0.028]} material={shieldRimMat}>
          <boxGeometry args={[0.46, 0.62, 0.014]} />
        </mesh>
        {/* Front face inset (recessed field for the emblem) */}
        <mesh position={[0, 0, 0.034]} material={shieldFaceMat}>
          <boxGeometry args={[0.34, 0.5, 0.014]} />
        </mesh>
        {/* Cross emblem vertical */}
        <mesh position={[0, 0.03, 0.04]} material={shieldEmblemMat}>
          <boxGeometry args={[0.07, 0.4, 0.014]} />
        </mesh>
        {/* Cross emblem horizontal */}
        <mesh position={[0, 0.1, 0.04]} material={shieldEmblemMat}>
          <boxGeometry args={[0.3, 0.07, 0.014]} />
        </mesh>
      </group>

      {/* Head */}
      <group ref={headRef} position={[0, 1.04, 0]}>
        <mesh castShadow material={armorLightMat}>
          <boxGeometry args={[0.32, 0.3, 0.32]} />
        </mesh>
        <mesh position={[0, -0.01, 0.165]} material={visorMat}>
          <boxGeometry args={[0.24, 0.06, 0.01]} />
        </mesh>
        <mesh position={[0, 0.18, 0]} castShadow material={armorDarkMat}>
          <boxGeometry args={[0.34, 0.06, 0.34]} />
        </mesh>
      </group>
    </group>
  )
}
