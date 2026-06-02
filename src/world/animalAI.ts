import { tileAt, tileTopY } from './tileMap'
import { obstacleCollidesAt } from './obstacles'
import { bridgeAt } from './bridges'
import { houseBlocksAt } from './houseBlockers'
import { findPath } from './pathfinding'
import { ANIMAL_CONFIG, type AnimalConfig } from './animalConfig'
import { nearestPredatorAnimal, type AnimalState } from './animalStore'
import { getAliveBears } from './bearStore'
import { damagePlayer, getPlayer, isPlayerAlive } from './playerStore'

// Shared AI for the wild animals. One step per frame; the view turns the
// returned flags into a gait/attack animation. Behaviour class selects the
// branch (predator hunt / prey flee / boar charge).

export interface AnimalStep {
  moving: boolean
  attacking: boolean
  /** 0..1 progress of the current melee swing, for the view's lunge anim */
  attackPhase: number
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a
  while (d > Math.PI) d -= 2 * Math.PI
  while (d < -Math.PI) d += 2 * Math.PI
  return a + d * t
}

function faceToward(a: AnimalState, dx: number, dz: number, dt: number, rate: number): void {
  if (dx * dx + dz * dz < 1e-6) return
  a.facing = lerpAngle(a.facing, Math.atan2(dx, dz), Math.min(1, dt * rate))
}

function standable(sx: number, sz: number): boolean {
  return tileAt(Math.floor(sx), Math.floor(sz)) !== null || bridgeAt(sx, sz) !== null
}

/** Per-axis sliding move toward (tx,tz). Returns whether any progress was made. */
function moveToward(a: AnimalState, tx: number, tz: number, speed: number, dt: number): boolean {
  const dx = tx - a.x
  const dz = tz - a.z
  const len = Math.hypot(dx, dz)
  if (len < 0.001) return false
  const step = speed * dt
  const nx = a.x + (dx / len) * step
  const nz = a.z + (dz / len) * step
  const okX =
    standable(nx, a.z) && !obstacleCollidesAt(nx, a.z, a.collisionRadius) && !houseBlocksAt(nx, a.z)
  const okZ =
    standable(a.x, nz) && !obstacleCollidesAt(a.x, nz, a.collisionRadius) && !houseBlocksAt(a.x, nz)
  if (okX) a.x = nx
  if (okZ) a.z = nz
  const br = bridgeAt(a.x, a.z)
  if (br) a.y = br.y
  return okX || okZ
}

/** A* chase toward (tx,tz). Reuses the ork/bear waypoint follower. */
function chase(
  a: AnimalState,
  cfg: AnimalConfig,
  tx: number,
  tz: number,
  dt: number,
  tNow: number,
  speed: number,
): boolean {
  if (tNow >= a.pathRecomputeAt || a.path.length === 0 || a.pathIndex >= a.path.length) {
    a.path = findPath({ x: a.x, z: a.z }, { x: tx, z: tz })
    a.pathIndex = 0
    a.pathRecomputeAt = tNow + cfg.pathRecompute
  }
  while (a.pathIndex < a.path.length) {
    const wp = a.path[a.pathIndex]
    if (Math.hypot(wp.x - a.x, wp.z - a.z) < cfg.waypointRadius) a.pathIndex++
    else break
  }
  const wp = a.pathIndex < a.path.length ? a.path[a.pathIndex] : { x: tx, z: tz }
  const moved = moveToward(a, wp.x, wp.z, speed, dt)
  if (!moved) a.pathRecomputeAt = 0
  faceToward(a, wp.x - a.x, wp.z - a.z, dt, cfg.turnRate)
  return moved
}

/** Wander to a random nearby land tile, then idle. */
function wander(a: AnimalState, cfg: AnimalConfig, dt: number, tNow: number): boolean {
  if (!a.target && tNow >= a.idleUntil) {
    for (let i = 0; i < 10; i++) {
      const ang = Math.random() * Math.PI * 2
      const r = 2 + Math.random() * 5
      const nx = a.x + Math.cos(ang) * r
      const nz = a.z + Math.sin(ang) * r
      const tile = tileAt(Math.floor(nx), Math.floor(nz))
      if (tile && tile.height < 2) {
        a.target = { x: nx, z: nz }
        break
      }
    }
  }
  if (a.target) {
    if (Math.hypot(a.target.x - a.x, a.target.z - a.z) < 0.4) {
      a.target = null
      a.idleUntil = tNow + 2 + Math.random() * 4
      return false
    }
    const moved = moveToward(a, a.target.x, a.target.z, cfg.wanderSpeed, dt)
    faceToward(a, a.target.x - a.x, a.target.z - a.z, dt, 4)
    return moved
  }
  return false
}

/** Run directly away from a threat at full flee speed. */
function flee(a: AnimalState, cfg: AnimalConfig, fromX: number, fromZ: number, dt: number): boolean {
  const dx = a.x - fromX
  const dz = a.z - fromZ
  const len = Math.hypot(dx, dz) || 1
  const moved = moveToward(a, a.x + (dx / len) * 6, a.z + (dz / len) * 6, cfg.speed, dt)
  faceToward(a, dx, dz, dt, cfg.turnRate)
  return moved
}

/** Predator: hunt the player only. Wildlife no longer attacks other wildlife —
 * predators ignore prey so different animals don't fight each other. */
function predatorTarget(
  a: AnimalState,
  cfg: AnimalConfig,
): { x: number; z: number; dist: number } | null {
  const p = getPlayer()
  const pDist = isPlayerAlive() ? Math.hypot(p.x - a.x, p.z - a.z) : Infinity
  if (isPlayerAlive() && pDist < cfg.aggro) return { x: p.x, z: p.z, dist: pDist }
  return null
}

/** Prey: nearest threat (predator animal / bear / player) within fear range. */
function preyThreat(a: AnimalState, cfg: AnimalConfig): { x: number; z: number } | null {
  let bx = 0
  let bz = 0
  let bestD = cfg.fear * cfg.fear
  let found = false
  const pred = nearestPredatorAnimal(a.x, a.z, cfg.fear)
  if (pred) {
    const d = (pred.x - a.x) ** 2 + (pred.z - a.z) ** 2
    if (d < bestD) {
      bestD = d
      bx = pred.x
      bz = pred.z
      found = true
    }
  }
  for (const bear of getAliveBears()) {
    const d = (bear.x - a.x) ** 2 + (bear.z - a.z) ** 2
    if (d < bestD) {
      bestD = d
      bx = bear.x
      bz = bear.z
      found = true
    }
  }
  if (isPlayerAlive()) {
    const p = getPlayer()
    const d = (p.x - a.x) ** 2 + (p.z - a.z) ** 2
    if (d < bestD) {
      bx = p.x
      bz = p.z
      found = true
    }
  }
  return found ? { x: bx, z: bz } : null
}

function applyMeleeHit(a: AnimalState, cfg: AnimalConfig, tNow: number): void {
  // Animals only ever land hits on the player now — never on each other.
  const reach = cfg.melee + 0.3
  const p = getPlayer()
  if (isPlayerAlive() && Math.hypot(p.x - a.x, p.z - a.z) <= reach) {
    damagePlayer(cfg.attackDamage, tNow, a.x, a.z)
  }
}

export function stepAnimalAI(a: AnimalState, dt: number, tNow: number): AnimalStep {
  const cfg = ANIMAL_CONFIG[a.species]
  let moving = false
  let attackPhase = 0

  // Resolve an in-progress swing first (no movement while attacking).
  if (a.attackingSince > 0) {
    const phase = (tNow - a.attackingSince) / cfg.attackDuration
    if (phase >= 1) {
      a.attackingSince = 0
      a.attackReadyAt = tNow + cfg.attackCooldown
    } else {
      attackPhase = phase
      if (!a.attackHitDealt && phase >= 0.5) {
        a.attackHitDealt = true
        applyMeleeHit(a, cfg, tNow)
      }
    }
  } else if (cfg.behavior === 'predator') {
    const tgt = predatorTarget(a, cfg)
    if (tgt) {
      if (tgt.dist < cfg.melee) {
        faceToward(a, tgt.x - a.x, tgt.z - a.z, dt, cfg.turnRate)
        if (tNow >= a.attackReadyAt) {
          a.attackingSince = tNow
          a.attackHitDealt = false
        }
      } else {
        moving = chase(a, cfg, tgt.x, tgt.z, dt, tNow, cfg.speed)
      }
    } else {
      moving = wander(a, cfg, dt, tNow)
    }
  } else if (cfg.behavior === 'prey') {
    const threat = preyThreat(a, cfg)
    if (threat) moving = flee(a, cfg, threat.x, threat.z, dt)
    else moving = wander(a, cfg, dt, tNow)
  } else {
    // boar
    const p = getPlayer()
    const pDist = isPlayerAlive() ? Math.hypot(p.x - a.x, p.z - a.z) : Infinity
    if (!(tNow < a.enragedUntil) && isPlayerAlive() && pDist < cfg.aggro) {
      a.enragedUntil = tNow + 5 // got too close — charge
    }
    const charging = tNow < a.enragedUntil && isPlayerAlive() && pDist < cfg.leash
    if (charging) {
      if (pDist < cfg.melee) {
        faceToward(a, p.x - a.x, p.z - a.z, dt, cfg.turnRate)
        if (tNow >= a.attackReadyAt) {
          a.attackingSince = tNow
          a.attackHitDealt = false
        }
      } else {
        moving = chase(a, cfg, p.x, p.z, dt, tNow, cfg.speed)
      }
    } else {
      moving = wander(a, cfg, dt, tNow)
    }
  }

  // Settle onto the terrain (bridge height already tracked in moveToward).
  if (!bridgeAt(a.x, a.z)) {
    const tile = tileAt(Math.floor(a.x), Math.floor(a.z))
    if (tile) a.y = tileTopY(Math.floor(a.x), Math.floor(a.z))
  }

  a.moving = moving
  return { moving, attacking: a.attackingSince > 0, attackPhase }
}
