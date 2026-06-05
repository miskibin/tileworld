import { useRef, useMemo, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import {
  damageOrk,
  healOrk,
  nearestEnemyOrk,
  nearestWoundedAlly,
  reapOrk,
  type OrkState,
} from './orkStore'
import { ORK_CONFIG, FACTION_COLOR } from './orkConfig'
import { CASTLE_CORE, damageCastle } from './castleStore'
import { KEEP_HALF, TOWER_SLOTS } from './cityPlan'
import { getCity } from './cityStore'
import { getDefenderVillagers, damageVillager, type VillagerState } from './villagerStore'
import { isTowerAlive, damageTower } from './towerStore'
import { spawnBolt } from './projectileStore'
import { spawnFloat } from './fxStore'
import { spawnImpact } from './impactStore'
import { spawnDust, dustForBiome } from './dustStore'
import { tileAt, tileTopY } from './tileMap'
import { obstacleCollidesAt } from './obstacles'
import { bridgeAt } from './bridges'
import { houseBlocksAt, wallBetween } from './houseBlockers'
import { findPath } from './pathfinding'
import { damagePlayer, getPlayer, isPlayerAlive } from './playerStore'
import { markCombat } from './combatStore'
import { isFrozen } from './pauseStore'
import { getTimeScale } from './hitStopStore'
import { cullVisible, isCulled } from './cull'
import { mergeParts, type MergedPart } from './mergeParts'
import { faceCamera } from './faceCamera'
import { playOrkGrunt } from '../audio/sfx'

const TURN_RATE_FALLBACK = 6

// Shared ember glow worn by every ork so they stay locatable in the dark. The
// >1 colour pushes it past the Bloom luminance threshold so it reads as a
// little carried light. Module-level (shared) — cheap, no per-ork allocation.
const ORK_GLOW_GEO = new THREE.SphereGeometry(0.13, 10, 10)
const ORK_GLOW_MAT = new THREE.MeshBasicMaterial({
  color: new THREE.Color('#ff8a3a').multiplyScalar(2.4),
  toneMapped: false,
  fog: false,
})

const SKIN_DARK_ACCENT = 0.62 // multiplier off the variant skin for shoulders/accents
const TUSK = '#ece1c2'
const EYE = '#e6c828'
const BELT = '#3a2616'
const CLUB_WOOD = '#4a2a16'
const CLUB_BAND = '#1a1008'
const STAFF_WOOD = '#6a4a2a'

const BELT_MAT = new THREE.MeshStandardMaterial({ color: BELT, roughness: 1 })
const WOOD_MAT = new THREE.MeshStandardMaterial({ color: CLUB_WOOD, roughness: 1 })
const BAND_MAT = new THREE.MeshStandardMaterial({ color: CLUB_BAND, roughness: 1 })
const STAFF_MAT = new THREE.MeshStandardMaterial({ color: STAFF_WOOD, roughness: 1 })
const ORB_MAT = new THREE.MeshStandardMaterial({
  color: '#c89cff',
  emissive: '#7a3aff',
  emissiveIntensity: 1.4,
  roughness: 0.3,
  toneMapped: false,
})
const TUSK_MAT = new THREE.MeshStandardMaterial({ color: TUSK, roughness: 0.7 })
const EYE_MAT = new THREE.MeshStandardMaterial({
  color: EYE,
  roughness: 0.4,
  emissive: '#705020',
  emissiveIntensity: 0.5,
})

const HP_BAR_BG = new THREE.MeshBasicMaterial({ color: '#1a1410', toneMapped: false })
const HP_BAR_FG = new THREE.MeshBasicMaterial({ color: '#d63a3a', toneMapped: false })
const HP_BAR_GEO = new THREE.PlaneGeometry(1, 1)
const HP_BAR_WIDTH = 0.8
const HP_BAR_HEIGHT = 0.07

// ─── Pre-merged static geometry (draw-call batching) ─────────────────────────
// The ork is one root group with four animated sub-groups (body, head, arms).
// Within each frame of reference the static parts are welded by (slot/material,
// castShadow) so a crowd of orks costs a fraction of the draw calls — pixels and
// shadows are byte-for-byte identical. Skin/skinDark/faction are tinted PER ORK
// (hurt flash + variant + warband colour), so those parts carry a `slot` and the
// real material is bound at render; everything else uses the shared mats above.
// Geometry is built once here and shared by every ork.
const box = (x: number, y: number, z: number) => new THREE.BoxGeometry(x, y, z)
const cone = (r: number, h: number, s: number) => new THREE.ConeGeometry(r, h, s)
const cyl = (rt: number, rb: number, h: number, s: number) => new THREE.CylinderGeometry(rt, rb, h, s)
const ico = (r: number) => new THREE.IcosahedronGeometry(r, 0)
// Placeholder material for slotted parts — never rendered (the real per-ork
// material is bound by slot below); it only exists so mergeParts can bucket.
const SLOT_PH = new THREE.MeshBasicMaterial()

// Root frame: legs (skin), loincloth (faction), belt.
const ROOT_PARTS = mergeParts([
  { geo: box(0.2, 0.36, 0.22), pos: [-0.13, 0.18, 0], slot: 'skin', mat: SLOT_PH, castShadow: true },
  { geo: box(0.2, 0.36, 0.22), pos: [0.13, 0.18, 0], slot: 'skin', mat: SLOT_PH, castShadow: true },
  { geo: box(0.55, 0.2, 0.3), pos: [0, 0.4, 0], slot: 'faction', mat: SLOT_PH, castShadow: true },
  { geo: box(0.56, 0.06, 0.31), pos: [0, 0.49, 0], mat: BELT_MAT, castShadow: true },
])
// Body frame (bodyRef): torso + the two war-paint stripes.
const BODY_PARTS = mergeParts([
  { geo: box(0.55, 0.42, 0.34), slot: 'skin', mat: SLOT_PH, castShadow: true },
  { geo: box(0.12, 0.32, 0.006), pos: [0, 0, 0.175], slot: 'faction', mat: SLOT_PH },
  { geo: box(0.4, 0.06, 0.004), pos: [0, 0, 0.176], slot: 'skinDark', mat: SLOT_PH },
])
// Head frame (headRef): skull + brow + eyes + tusks + ears.
const HEAD_PARTS = mergeParts([
  { geo: box(0.36, 0.34, 0.34), slot: 'skin', mat: SLOT_PH, castShadow: true },
  { geo: box(0.32, 0.06, 0.01), pos: [0, 0.06, 0.175], slot: 'skinDark', mat: SLOT_PH },
  { geo: box(0.05, 0.04, 0.008), pos: [-0.08, 0.02, 0.175], mat: EYE_MAT },
  { geo: box(0.05, 0.04, 0.008), pos: [0.08, 0.02, 0.175], mat: EYE_MAT },
  { geo: cone(0.026, 0.13, 5), pos: [-0.08, -0.1, 0.17], rot: [0, 0, -0.15], mat: TUSK_MAT },
  { geo: cone(0.026, 0.13, 5), pos: [0.08, -0.1, 0.17], rot: [0, 0, 0.15], mat: TUSK_MAT },
  { geo: box(0.06, 0.12, 0.14), pos: [-0.2, 0, 0], slot: 'skin', mat: SLOT_PH },
  { geo: box(0.06, 0.12, 0.14), pos: [0.2, 0, 0], slot: 'skin', mat: SLOT_PH },
])
// Right arm frame (rightArmRef): shoulder + upper + forearm.
const ARM_R_PARTS = mergeParts([
  { geo: box(0.2, 0.1, 0.3), pos: [0, -0.02, 0], slot: 'skinDark', mat: SLOT_PH, castShadow: true },
  { geo: box(0.17, 0.5, 0.24), pos: [0.02, -0.25, 0.04], rot: [0.2, 0, 0.05], slot: 'skin', mat: SLOT_PH, castShadow: true },
  { geo: box(0.16, 0.1, 0.22), pos: [0.04, -0.52, 0.08], rot: [0.2, 0, 0.05], slot: 'skinDark', mat: SLOT_PH, castShadow: true },
])
// Left arm frame (leftArmRef).
const ARM_L_PARTS = mergeParts([
  { geo: box(0.2, 0.1, 0.3), pos: [0, -0.02, 0], slot: 'skinDark', mat: SLOT_PH, castShadow: true },
  { geo: box(0.17, 0.5, 0.24), pos: [-0.02, -0.25, 0.04], rot: [0.2, 0, -0.05], slot: 'skin', mat: SLOT_PH, castShadow: true },
  { geo: box(0.18, 0.13, 0.26), pos: [-0.04, -0.52, 0.08], rot: [0.2, 0, -0.05], slot: 'skinDark', mat: SLOT_PH, castShadow: true },
])
// Club frame (war-club group): two wood segments + four spikes.
const CLUB_PARTS = mergeParts([
  { geo: cyl(0.04, 0.04, 0.26, 6), pos: [0, -0.1, 0], mat: WOOD_MAT, castShadow: true },
  { geo: cyl(0.1, 0.08, 0.34, 7), pos: [0, -0.36, 0], mat: WOOD_MAT, castShadow: true },
  ...[0, 1, 2, 3].map((i) => ({
    geo: cone(0.03, 0.09, 4),
    pos: [Math.cos((i * Math.PI) / 2) * 0.1, -0.36, Math.sin((i * Math.PI) / 2) * 0.1] as [number, number, number],
    rot: [0, (i * Math.PI) / 2, Math.PI / 2] as [number, number, number],
    mat: BAND_MAT,
  })),
])
// Staff frame (shaman staff group): shaft + glowing orb.
const STAFF_PARTS = mergeParts([
  { geo: cyl(0.03, 0.035, 1.1, 6), pos: [0, -0.1, 0], mat: STAFF_MAT, castShadow: true },
  { geo: ico(0.1), pos: [0, 0.5, 0], mat: ORB_MAT },
])

interface OrkViewProps {
  state: OrkState
}

/** Render one merged bucket, binding the per-ork material for slotted parts. */
function MergedMesh({ mp, skin, skinDark, faction }: { mp: MergedPart; skin: THREE.Material; skinDark: THREE.Material; faction: THREE.Material }) {
  const mat = mp.slot === 'skin' ? skin : mp.slot === 'skinDark' ? skinDark : mp.slot === 'faction' ? faction : mp.mat
  return <mesh geometry={mp.geo} material={mat} castShadow={mp.castShadow} />
}

export function OrkView({ state }: OrkViewProps) {
  const cfg = ORK_CONFIG[state.variant]
  const isShaman = !!cfg.ranged

  // Per-ork materials so a variant's colour is honoured and a hurt flash only
  // tints THIS ork (the old shared-material flash lit up every ork at once).
  const skinMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: cfg.skin, roughness: 0.85, flatShading: true }),
    [cfg.skin],
  )
  const skinDarkMat = useMemo(() => {
    const c = new THREE.Color(cfg.skin).multiplyScalar(SKIN_DARK_ACCENT)
    return new THREE.MeshStandardMaterial({ color: c, roughness: 0.9, flatShading: true })
  }, [cfg.skin])
  const factionMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: FACTION_COLOR[state.faction], roughness: 1 }),
    [state.faction],
  )

  const groupRef = useRef<THREE.Group>(null!)
  const bodyRef = useRef<THREE.Group>(null!)
  const headRef = useRef<THREE.Group>(null!)
  const rightArmRef = useRef<THREE.Group>(null!)
  const leftArmRef = useRef<THREE.Group>(null!)
  const hpFgRef = useRef<THREE.Mesh>(null!)
  const billboardGroupRef = useRef<THREE.Group>(null!)
  const wasAggroRef = useRef(false)
  const lastGruntRef = useRef(0)

  const [visible, setVisible] = useState(true)
  const deadFadeFrom = useRef<number | null>(null)

  useFrame(({ clock, camera }, dtFrame) => {
    if (isFrozen()) return
    const t = clock.getElapsedTime() + state.seed
    const tNow = clock.getElapsedTime()
    const dt = Math.min(0.05, dtFrame) * getTimeScale()
    const g = groupRef.current
    if (!g) return

    // Distance cull: far orks are fog-hidden, but their AI keeps running so they
    // keep marching on the keep instead of standing frozen while towers farm
    // them. Only the mesh is toggled — ork counts are small, so full AI is cheap.
    const culled = state.hp > 0 && isCulled(state.x, state.z)
    cullVisible(g, culled)

    // Death fade
    if (state.hp <= 0) {
      if (deadFadeFrom.current === null) {
        deadFadeFrom.current = tNow
        // Dirt puff as the body crumples — grounds the kill in the terrain
        // (biome-tinted, soft; the bright spark burst is spawned by the killer).
        const biome = tileAt(Math.floor(state.x), Math.floor(state.z))?.biome
        spawnDust(state.x, state.y + 0.1, state.z, {
          count: 6,
          spread: 1.2,
          up: 0.55,
          size: 1.3,
          color: dustForBiome(biome).color,
        })
      }
      const elapsed = tNow - deadFadeFrom.current
      const opacity = Math.max(0, 1 - elapsed / 1.4)
      const sink = Math.min(0.4, elapsed * 0.3)
      g.position.set(state.x, state.y - sink, state.z)
      g.rotation.z = Math.min(Math.PI / 2, elapsed * 2.2)
      if (opacity <= 0 && visible) {
        setVisible(false)
        reapOrk(state.id) // drop from roster so waves don't accumulate corpses
      }
      if (billboardGroupRef.current) billboardGroupRef.current.visible = false
      return
    }

    // Frenzy (berserker): below 40% hp, hit faster + move faster.
    const frenzied = !!cfg.frenzy && state.hp < state.maxHp * 0.4
    const speed = cfg.speed * (frenzied ? 1.4 : 1)
    const cooldown = cfg.attackCooldown * (frenzied ? 0.6 : 1)
    const turnRate = cfg.turnRate || TURN_RATE_FALLBACK

    // ─── Target acquisition: nearest of {player, rival-camp ork} ──────
    const player = getPlayer()
    const pdx = player.x - state.x
    const pdz = player.z - state.z
    const playerDist = Math.hypot(pdx, pdz)
    // Wave orks march the keep; they peel off to the player only at close range.
    // Player aggro is the normal (short) cfg.aggro for everyone — both camp guards
    // (home set) and wave invaders engage you only when you come near, otherwise
    // wave orks fall through to the castle fallback and head for the keep.
    const playerValid = isPlayerAlive() && playerDist < cfg.aggro
    const enemy = nearestEnemyOrk(state, cfg.aggro)
    const enemyDist = enemy ? Math.hypot(enemy.x - state.x, enemy.z - state.z) : Infinity

    // Nearby defenders (militia + standing towers). Melee orks turn on whatever
    // is closest rather than marching past it; kept to the normal (short) aggro
    // like player aggro, so an ork with nothing close falls through to the keep.
    // Shamans skip defenders — their bolts only home on the player/rival orks.
    let defVillager: VillagerState | null = null
    let defTowerIdx = -1
    let defDist = cfg.aggro
    let defX = 0
    let defZ = 0
    if (!isShaman) {
      for (const v of getDefenderVillagers()) {
        const d = Math.hypot(v.x - state.x, v.z - state.z)
        if (d < defDist) {
          defDist = d
          defVillager = v
          defTowerIdx = -1
          defX = v.x
          defZ = v.z
        }
      }
      if (getCity().towersBuilt) {
        for (let i = 0; i < TOWER_SLOTS.length; i++) {
          if (!isTowerAlive(i)) continue
          const tw = TOWER_SLOTS[i]
          const d = Math.hypot(tw.x - state.x, tw.z - state.z)
          if (d < defDist) {
            defDist = d
            defTowerIdx = i
            defVillager = null
            defX = tw.x
            defZ = tw.z
          }
        }
      }
    }
    const hasDefender = defVillager !== null || defTowerIdx >= 0

    let tx = 0
    let tz = 0
    let dist = Infinity
    let targetOrk: OrkState | null = null
    let targetVillager: VillagerState | null = null
    let targetTowerIdx = -1
    let targetIsPlayer = false
    let targetIsCastle = false
    let targetIsHome = false
    // Pick the closest valid target: player ≻ defender ≻ rival ork (ties favour
    // the player so the horde still hunts you).
    const playerD = playerValid ? playerDist : Infinity
    const defD = hasDefender ? defDist : Infinity
    const minD = Math.min(playerD, defD, enemyDist)
    if (playerValid && playerD === minD) {
      tx = player.x
      tz = player.z
      dist = playerDist
      targetIsPlayer = true
    } else if (hasDefender && defD === minD) {
      tx = defX
      tz = defZ
      dist = defDist
      if (defVillager) targetVillager = defVillager
      else targetTowerIdx = defTowerIdx
    } else if (enemy) {
      tx = enemy.x
      tz = enemy.z
      dist = enemyDist
      targetOrk = enemy
    }
    // Fallback goal: camp orks (home set) drift back to guard their camp; wave
    // invaders march on the keep.
    if (!targetIsPlayer && !targetOrk && !targetVillager && targetTowerIdx < 0) {
      if (state.home) {
        const hdx = state.home.x - state.x
        const hdz = state.home.z - state.z
        const hd = Math.hypot(hdx, hdz)
        // Only walk back if we've strayed; within ~2 tiles just idle around camp
        // so they don't jitter or "attack" the empty camp centre.
        if (hd > 2.2) {
          tx = state.home.x
          tz = state.home.z
          dist = hd
          targetIsHome = true
        }
      } else {
        tx = CASTLE_CORE.x
        tz = CASTLE_CORE.z
        // Distance to the keep's AABB edge (not its centre) so orks stop at the
        // wall and strike it, instead of trying to stand inside the keep.
        const ddx = Math.max(0, Math.abs(CASTLE_CORE.x - state.x) - KEEP_HALF.x)
        const ddz = Math.max(0, Math.abs(CASTLE_CORE.z - state.z) - KEEP_HALF.z)
        dist = Math.hypot(ddx, ddz)
        targetIsCastle = true
      }
    }
    const hasTarget =
      targetIsPlayer ||
      targetOrk !== null ||
      targetVillager !== null ||
      targetTowerIdx >= 0 ||
      targetIsCastle ||
      targetIsHome
    // Towers are wide — let orks strike them from a bit farther than a body.
    const triggerRange = isShaman
      ? cfg.rangedRange ?? cfg.aggro
      : targetTowerIdx >= 0
        ? cfg.melee + 1.2
        : cfg.melee
    // Soft targets (player / militia / rival ork) can't be struck through a city
    // wall — only the keep and towers (structures the ork is meant to bash) are
    // exempt. When blocked, the ork keeps pathing and routes around to a gate.
    const losBlocked =
      (targetIsPlayer || targetVillager !== null || targetOrk !== null) &&
      wallBetween(state.x, state.z, tx, tz)
    const inRange = hasTarget && dist < triggerRange && !losBlocked
    const attacking = state.attackingSince > 0

    // Grunt when first acquiring a target.
    if (hasTarget && !wasAggroRef.current && tNow - lastGruntRef.current > 1.5) {
      playOrkGrunt(playerDist)
      lastGruntRef.current = tNow
    }
    wasAggroRef.current = hasTarget

    // Shaman: heal the most-wounded nearby ally on a timer (no target needed).
    if (isShaman && tNow >= state.healReadyAt) {
      const ally = nearestWoundedAlly(state, cfg.healRange ?? 8)
      if (ally) {
        healOrk(ally, cfg.healAmount ?? 20)
        spawnFloat('+' + (cfg.healAmount ?? 20), '#76e08a', ally.x, ally.y + 2.4, ally.z)
        state.healReadyAt = tNow + (cfg.healCooldown ?? 5)
      } else {
        state.healReadyAt = tNow + 1.0 // re-check soon
      }
    }

    // Face target when aggroed or attacking.
    if (hasTarget || attacking) {
      const targetFacing = Math.atan2(tx - state.x, tz - state.z)
      let d = targetFacing - state.facing
      while (d > Math.PI) d -= 2 * Math.PI
      while (d < -Math.PI) d += 2 * Math.PI
      state.facing += d * Math.min(1, dt * turnRate)
    }

    // Start a swing / cast.
    if (!attacking && inRange && tNow >= state.attackReadyAt) {
      state.attackingSince = tNow
      state.attackHitDealt = false
      if (tNow - lastGruntRef.current > 1.2) {
        playOrkGrunt(playerDist)
        lastGruntRef.current = tNow
      }
    }

    // Chase: walk toward target via A* path (until in range).
    let walking = false
    if (hasTarget && !inRange && !attacking) {
      // Recompute on the timer only (pathRecomputeAt starts at 0 → first frame
      // computes). Empty/exhausted paths no longer force a per-frame A* call —
      // the straight-line fallback below steers the ork until the next recompute,
      // so an unreachable target costs one A* per cycle, not one per frame.
      if (tNow >= state.pathRecomputeAt) {
        state.path = findPath({ x: state.x, z: state.z }, { x: tx, z: tz })
        state.pathIndex = 0
        state.pathRecomputeAt = tNow + cfg.pathRecompute
      }
      while (state.pathIndex < state.path.length) {
        const wp = state.path[state.pathIndex]
        if (Math.hypot(wp.x - state.x, wp.z - state.z) < cfg.waypointRadius) state.pathIndex++
        else break
      }
      // Steer toward the next waypoint, or — when A* found no route (start tile
      // momentarily blocked by a prop/house, or an unreachable target) — straight
      // at the goal. Without this fallback a pathless ork stands frozen forever;
      // the per-axis collision below still lets it slide off a blocked tile.
      let dxw: number
      let dzw: number
      if (state.pathIndex < state.path.length) {
        const wp = state.path[state.pathIndex]
        dxw = wp.x - state.x
        dzw = wp.z - state.z
      } else {
        dxw = tx - state.x
        dzw = tz - state.z
      }
      {
        const lenW = Math.hypot(dxw, dzw)
        if (lenW > 0.001) {
          const step = speed * dt
          const nx = state.x + (dxw / lenW) * step
          const nz = state.z + (dzw / lenW) * step
          const standingOk = (cx: number, cz: number) =>
            tileAt(cx, cz) !== null || bridgeAt(cx + 0.5, cz + 0.5) !== null
          const canMoveX =
            standingOk(Math.floor(nx), Math.floor(state.z)) &&
            !obstacleCollidesAt(nx, state.z, state.collisionRadius) &&
            !houseBlocksAt(nx, state.z)
          const canMoveZ =
            standingOk(Math.floor(state.x), Math.floor(nz)) &&
            !obstacleCollidesAt(state.x, nz, state.collisionRadius) &&
            !houseBlocksAt(state.x, nz)
          if (canMoveX) state.x = nx
          if (canMoveZ) state.z = nz
          let slid = false
          if (!canMoveX && !canMoveZ) {
            // Wedged against a prop/wall. A tile can be A*-walkable yet still sit
            // within the ork's collision radius of a tree near the tile edge, so
            // the straight push grinds into the trunk forever. Re-path next cycle
            // and, this frame, slide tangentially around the blocker so the ork
            // slips out of the pocket instead of freezing on the bark.
            state.pathRecomputeAt = 0
            const ux = dxw / lenW
            const uz = dzw / lenW
            const slip = speed * dt
            const tangents: ReadonlyArray<readonly [number, number]> = [
              [-uz, ux],
              [uz, -ux],
            ]
            for (const [px, pz] of tangents) {
              const sx = state.x + px * slip
              const sz = state.z + pz * slip
              if (
                standingOk(Math.floor(sx), Math.floor(sz)) &&
                !obstacleCollidesAt(sx, sz, state.collisionRadius) &&
                !houseBlocksAt(sx, sz)
              ) {
                state.x = sx
                state.z = sz
                slid = true
                break
              }
            }
          }
          const bridge = bridgeAt(state.x, state.z)
          if (bridge) {
            state.y = bridge.y
          } else {
            const tileNow = tileAt(Math.floor(state.x), Math.floor(state.z))
            if (tileNow) state.y = tileTopY(Math.floor(state.x), Math.floor(state.z))
          }
          walking = canMoveX || canMoveZ || slid
        }
      }
    }

    // Resolve swing / cast — deliver effect mid-animation, end at duration.
    let attackArmRot = 0
    if (attacking) {
      const phase = (tNow - state.attackingSince) / cfg.attackDuration
      if (phase >= 1) {
        state.attackingSince = 0
        state.attackReadyAt = tNow + cooldown
      } else {
        if (phase < 0.45) attackArmRot = -1.6 * (phase / 0.45)
        else if (phase < 0.75) attackArmRot = -1.6 + 2.4 * ((phase - 0.45) / 0.3)
        else attackArmRot = 0.8 * (1 - (phase - 0.75) / 0.25)
        if (!state.attackHitDealt && phase >= 0.55) {
          state.attackHitDealt = true
          if (isShaman) {
            // Lob a homing bolt from the staff orb toward the target.
            const oy = state.y + 1.7
            const boltOpts = { team: 'ork' as const, maxRange: (cfg.rangedRange ?? 12) + 4 }
            if (targetIsPlayer && isPlayerAlive()) {
              spawnBolt(state.x, oy, state.z, { kind: 'player' }, cfg.damage, boltOpts)
            } else if (targetOrk && targetOrk.hp > 0) {
              spawnBolt(state.x, oy, state.z, { kind: 'ork', ref: targetOrk }, cfg.damage, boltOpts)
            }
          } else if (dist <= triggerRange + 0.2) {
            if (targetIsPlayer && isPlayerAlive()) {
              // Pass the ork's position so a raised shield can block the hit.
              damagePlayer(cfg.damage, tNow, state.x, state.z)
              markCombat() // threat striking the hero → day combat music
            } else if (targetOrk && targetOrk.hp > 0) {
              damageOrk(targetOrk, cfg.damage, tNow)
            } else if (targetVillager && !targetVillager.downed) {
              const downed = damageVillager(targetVillager, cfg.damage)
              spawnFloat(
                downed ? 'DOWN' : `-${cfg.damage}`,
                '#ff9a6a',
                targetVillager.x,
                targetVillager.y + 2.2,
                targetVillager.z,
              )
            } else if (targetTowerIdx >= 0) {
              const tw = TOWER_SLOTS[targetTowerIdx]
              damageTower(targetTowerIdx, cfg.damage)
              spawnFloat(`-${cfg.damage}`, '#ff9a6a', tw.x, 3, tw.z)
              // Stone chips spray off the struck tower.
              spawnImpact(tw.x, 2.4, tw.z, { color: '#b8b4ac', count: 7, spread: 2.2, up: 1.0 })
            } else if (targetIsCastle) {
              damageCastle(cfg.damage)
              spawnFloat(`-${cfg.damage}`, '#ff7a3a', CASTLE_CORE.x, 4, CASTLE_CORE.z)
              // Wood splinters burst from the gate at the point of impact (near
              // the attacking ork, nudged toward the keep).
              const gx = state.x + (CASTLE_CORE.x - state.x) * 0.15
              const gz = state.z + (CASTLE_CORE.z - state.z) * 0.15
              spawnImpact(gx, 1.5, gz, { color: '#9c7a48', count: 9, spread: 2.6, up: 1.2 })
            }
          }
        }
      }
    }

    // Hit recoil — brief torso flinch.
    const hurtRemain = state.hurtFlashUntil - tNow
    const recoil = hurtRemain > 0 ? Math.max(0, hurtRemain / 0.25) : 0

    // Knockback impulse — decaying shove away from the attacker, blocked by
    // terrain/props so the ork can't be punted through a wall. dt is ~0 during
    // hit-stop, so the shove holds frozen on the blow then flies once it lifts.
    if (state.kbVX !== 0 || state.kbVZ !== 0) {
      const kx = state.x + state.kbVX * dt
      const kz = state.z + state.kbVZ * dt
      const standOk = (cx: number, cz: number) =>
        tileAt(Math.floor(cx), Math.floor(cz)) !== null || bridgeAt(cx + 0.5, cz + 0.5) !== null
      if (standOk(kx, state.z) && !obstacleCollidesAt(kx, state.z, state.collisionRadius)) state.x = kx
      if (standOk(state.x, kz) && !obstacleCollidesAt(state.x, kz, state.collisionRadius)) state.z = kz
      const decay = Math.max(0, 1 - 9 * dt)
      state.kbVX *= decay
      state.kbVZ *= decay
      if (Math.abs(state.kbVX) < 0.05 && Math.abs(state.kbVZ) < 0.05) {
        state.kbVX = 0
        state.kbVZ = 0
      }
    }

    g.position.set(state.x, state.y, state.z)
    g.rotation.y = state.facing + Math.sin(t * 0.55) * 0.04
    g.rotation.z = 0
    g.rotation.x = 0

    if (bodyRef.current) {
      const s = 1 + Math.sin(t * 1.2) * 0.04
      bodyRef.current.scale.set(s, 1 + Math.sin(t * 1.2) * 0.025, s)
      bodyRef.current.rotation.x = 0.2 - recoil * 0.3
    }
    if (headRef.current) {
      headRef.current.rotation.y = hasTarget ? 0 : Math.sin(t * 0.3 + state.seed) * 0.32
      headRef.current.rotation.x = Math.sin(t * 0.4) * 0.06 - recoil * 0.4
    }
    if (rightArmRef.current) {
      if (attacking) {
        rightArmRef.current.rotation.x = attackArmRot
        rightArmRef.current.rotation.z = 0
      } else if (walking) {
        rightArmRef.current.rotation.x = Math.sin(t * 8) * 0.4
        rightArmRef.current.rotation.z = 0
      } else {
        rightArmRef.current.rotation.x = Math.sin(t * 0.8) * 0.05
        rightArmRef.current.rotation.z = Math.sin(t * 0.9) * 0.04
      }
    }
    if (leftArmRef.current) {
      leftArmRef.current.rotation.x = walking
        ? Math.sin(t * 8 + Math.PI) * 0.4
        : Math.sin(t * 0.8 + Math.PI) * 0.05
    }
    if (walking) g.position.y = state.y + Math.abs(Math.sin(t * 8)) * 0.06

    // Hurt flash → tint this ork's skin briefly, plus a sharp white emissive
    // pop for the first ~70ms so the blow visibly "lands" on the low-poly model.
    // (emissive colour/intensity are plain uniforms — no shader recompile.)
    if (tNow < state.hurtFlashUntil) skinMat.color.set('#ffb060')
    else skinMat.color.set(cfg.skin)
    const flashAmt = hurtRemain > 0 ? Math.max(0, (hurtRemain - 0.18) / 0.07) : 0
    skinMat.emissive.setRGB(flashAmt, flashAmt, flashAmt)
    skinMat.emissiveIntensity = flashAmt

    // HP bar
    if (billboardGroupRef.current) {
      const showBar = state.hp < state.maxHp
      billboardGroupRef.current.visible = showBar
      // Face the camera here (no separate drei <Billboard> useFrame per ork).
      if (showBar) faceCamera(billboardGroupRef.current, camera)
      if (showBar && hpFgRef.current) {
        const ratio = Math.max(0, state.hp / state.maxHp)
        hpFgRef.current.scale.x = HP_BAR_WIDTH * ratio
        hpFgRef.current.position.x = -((1 - ratio) * HP_BAR_WIDTH) / 2
        ;(hpFgRef.current.material as THREE.MeshBasicMaterial).color.set(
          tNow < state.hurtFlashUntil ? '#ffaa20' : '#d63a3a',
        )
      }
    }
  })

  if (!visible) return null

  return (
    <group
      ref={groupRef}
      position={[state.x, state.y, state.z]}
      rotation={[0, state.facing, 0]}
      scale={0.7 * cfg.scale}
    >
      {/* Ember glow — locatable in the dark; blooms via post-processing. */}
      <mesh position={[0, 1.5, 0.16]} geometry={ORK_GLOW_GEO} material={ORK_GLOW_MAT} />
      {/* Root-frame static parts (merged): legs, warband loincloth, belt. */}
      {ROOT_PARTS.map((mp, i) => (
        <MergedMesh key={`r${i}`} mp={mp} skin={skinMat} skinDark={skinDarkMat} faction={factionMat} />
      ))}
      <group ref={bodyRef} position={[0, 0.74, 0.05]} rotation={[0.2, 0, 0]}>
        {/* Torso + war-paint stripes (merged). */}
        {BODY_PARTS.map((mp, i) => (
          <MergedMesh key={`b${i}`} mp={mp} skin={skinMat} skinDark={skinDarkMat} faction={factionMat} />
        ))}
      </group>
      <group ref={headRef} position={[0, 1.1, 0.06]}>
        {/* Skull, brow, eyes, tusks, ears (merged by material). */}
        {HEAD_PARTS.map((mp, i) => (
          <MergedMesh key={`h${i}`} mp={mp} skin={skinMat} skinDark={skinDarkMat} faction={factionMat} />
        ))}
      </group>
      <group ref={rightArmRef} position={[0.36, 0.95, 0.05]}>
        {ARM_R_PARTS.map((mp, i) => (
          <MergedMesh key={`ar${i}`} mp={mp} skin={skinMat} skinDark={skinDarkMat} faction={factionMat} />
        ))}
        {isShaman ? (
          /* Gnarled staff topped with a glowing orb */
          <group position={[0.05, -0.5, 0.1]} rotation={[0.1, 0, 0.08]}>
            {STAFF_PARTS.map((mp, i) => (
              <MergedMesh key={`s${i}`} mp={mp} skin={skinMat} skinDark={skinDarkMat} faction={factionMat} />
            ))}
          </group>
        ) : (
          /* Spiked war-club */
          <group position={[0.05, -0.65, 0.1]} rotation={[0.4, 0, 0.1]}>
            {CLUB_PARTS.map((mp, i) => (
              <MergedMesh key={`c${i}`} mp={mp} skin={skinMat} skinDark={skinDarkMat} faction={factionMat} />
            ))}
          </group>
        )}
      </group>
      <group ref={leftArmRef} position={[-0.36, 0.95, 0.05]}>
        {ARM_L_PARTS.map((mp, i) => (
          <MergedMesh key={`al${i}`} mp={mp} skin={skinMat} skinDark={skinDarkMat} faction={factionMat} />
        ))}
      </group>

      {/* HP bar — oriented to camera in the ork's own useFrame via faceCamera. */}
      <group ref={billboardGroupRef} position={[0, 2.6, 0]} visible={false}>
        <mesh material={HP_BAR_BG} geometry={HP_BAR_GEO} scale={[HP_BAR_WIDTH + 0.05, HP_BAR_HEIGHT + 0.03, 1]} />
        <mesh
          ref={hpFgRef}
          material={HP_BAR_FG}
          geometry={HP_BAR_GEO}
          position={[0, 0, 0.001]}
          scale={[HP_BAR_WIDTH, HP_BAR_HEIGHT, 1]}
        />
      </group>
    </group>
  )
}
