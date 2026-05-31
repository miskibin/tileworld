import {
  playHurt,
  playBlock,
  playGoldPickup,
  playLevelUpFanfare,
  playPlayerHurtVoice,
  playPlayerDeath,
} from '../audio/sfx'
import { addShake, spawnFloat } from './fxStore'
import { isUnlimitedMoney } from './debugStore'
import {
  absorbBlockedHit,
  getBlockState,
  resetBlock,
  BLOCK_CONE_DOT,
  BLOCK_REDUCTION,
} from './blockStore'

export const PLAYER_MAX_HP = 100
// Player boots at the centred castle (just south of the keep, inside the walls).
export const PLAYER_SPAWN = { x: 72, y: 1, z: 58 } as const
export const PLAYER_RESPAWN_DELAY = 2.4
export const PLAYER_STARTING_GOLD = 30

// Progression tuning
export const PLAYER_BASE_DAMAGE = 25 // attack damage at level 1
export const XP_PER_ORK = 20 // xp granted per ork slain
const XP_FIRST_LEVEL = 50 // xp needed for level 2 (scales linearly after)
const HP_PER_LEVEL = 20 // max-hp gained each level
const DAMAGE_PER_LEVEL = 8 // attack damage gained each level

export interface PlayerLive {
  x: number
  z: number
  y: number
  /** facing angle (radians); fx=sin(facing), fz=cos(facing). Drives block cone. */
  facing: number
  moving: boolean
  hp: number
  maxHp: number
  hurtFlashUntil: number
  deadSince: number | null
  gold: number
  level: number
  xp: number
  xpToNext: number
  attackDamage: number
  levelUpFlashUntil: number
}

const state: PlayerLive = {
  x: PLAYER_SPAWN.x,
  z: PLAYER_SPAWN.z,
  y: PLAYER_SPAWN.y,
  facing: Math.PI,
  moving: false,
  hp: PLAYER_MAX_HP,
  maxHp: PLAYER_MAX_HP,
  hurtFlashUntil: 0,
  deadSince: null,
  gold: PLAYER_STARTING_GOLD,
  level: 1,
  xp: 0,
  xpToNext: XP_FIRST_LEVEL,
  attackDamage: PLAYER_BASE_DAMAGE,
  levelUpFlashUntil: 0,
}

type HpListener = (hp: number, max: number, dead: boolean) => void
const hpSubs = new Set<HpListener>()
type GoldListener = (gold: number) => void
const goldSubs = new Set<GoldListener>()
export interface PlayerStats {
  level: number
  xp: number
  xpToNext: number
}
type StatsListener = (stats: PlayerStats) => void
const statsSubs = new Set<StatsListener>()

export function getPlayer(): PlayerLive {
  return state
}

export function setPlayerPos(
  x: number,
  y: number,
  z: number,
  moving: boolean,
  facing?: number,
): void {
  state.x = x
  state.y = y
  state.z = z
  state.moving = moving
  if (facing !== undefined) state.facing = facing
}

export function isPlayerAlive(): boolean {
  return state.hp > 0
}

/**
 * Deal damage to the player. If `fromX/fromZ` are given and the player is
 * blocking with the attacker inside the shield's front cone, most of the hit is
 * negated and a chunk of block stamina is spent.
 */
export function damagePlayer(amount: number, now: number, fromX?: number, fromZ?: number): void {
  if (state.hp <= 0) return

  let dmg = amount
  const blk = getBlockState()
  if (blk.blocking && fromX !== undefined && fromZ !== undefined) {
    const dx = fromX - state.x
    const dz = fromZ - state.z
    const len = Math.hypot(dx, dz) || 1
    const dot = (dx / len) * Math.sin(state.facing) + (dz / len) * Math.cos(state.facing)
    if (dot > BLOCK_CONE_DOT) {
      dmg = amount * (1 - BLOCK_REDUCTION)
      absorbBlockedHit()
      playBlock()
      addShake(0.1, 0.14)
      spawnFloat('BLOCK', '#bcd4ff', state.x, state.y + 2.4, state.z)
    }
  }
  if (dmg <= 0) {
    // Fully absorbed — flash the shield feedback but don't touch HP.
    return
  }

  state.hp = Math.max(0, state.hp - dmg)
  // Red floating damage on the player — distinct from the yellow/white numbers
  // shown over enemies the player hits.
  spawnFloat(`-${Math.round(dmg)}`, '#ff5a4a', state.x, state.y + 2.2, state.z)
  state.hurtFlashUntil = now + 0.35
  playHurt()
  if (state.hp <= 0) {
    state.deadSince = now
    playPlayerDeath()
  } else {
    playPlayerHurtVoice()
  }
  addShake(state.hp <= 0 ? 0.5 : 0.22, state.hp <= 0 ? 0.5 : 0.25)
  notifyHp()
}

/** Full reset to a fresh game (new run / wave-survival restart). Wipes all
 *  progression, unlike respawnPlayer which keeps it. */
export function resetPlayer(): void {
  state.x = PLAYER_SPAWN.x
  state.y = PLAYER_SPAWN.y
  state.z = PLAYER_SPAWN.z
  state.moving = false
  state.hp = PLAYER_MAX_HP
  state.maxHp = PLAYER_MAX_HP
  state.hurtFlashUntil = 0
  state.deadSince = null
  state.gold = PLAYER_STARTING_GOLD
  state.level = 1
  state.xp = 0
  state.xpToNext = XP_FIRST_LEVEL
  state.attackDamage = PLAYER_BASE_DAMAGE
  state.levelUpFlashUntil = 0
  state.facing = Math.PI
  resetBlock()
  notifyHp()
  notifyGold()
  notifyStats()
}

/** Respawn keeps progression (level/xp/gold/maxHp) — only hp + position reset. */
export function respawnPlayer(): void {
  state.hp = state.maxHp
  state.deadSince = null
  state.hurtFlashUntil = 0
  state.x = PLAYER_SPAWN.x
  state.y = PLAYER_SPAWN.y
  state.z = PLAYER_SPAWN.z
  notifyHp()
}

export function subscribeHp(fn: HpListener): () => void {
  hpSubs.add(fn)
  fn(state.hp, state.maxHp, state.deadSince !== null)
  return () => {
    hpSubs.delete(fn)
  }
}

function notifyHp(): void {
  hpSubs.forEach((fn) => fn(state.hp, state.maxHp, state.deadSince !== null))
}

export function getGold(): number {
  return state.gold
}

export function addGold(n: number): void {
  state.gold += n
  if (n > 0) playGoldPickup()
  notifyGold()
}

/** Returns true if the spend succeeded. */
export function spendGold(n: number): boolean {
  // Debug cheat: unlimited money never deducts and always succeeds. (Refund
  // calls pass a negative n — those still apply so gold isn't lost.)
  if (isUnlimitedMoney() && n >= 0) return true
  if (state.gold < n) return false
  state.gold -= n
  notifyGold()
  return true
}

export function healPlayer(n: number): void {
  state.hp = Math.min(state.maxHp, state.hp + n)
  notifyHp()
}

export function getAttackDamage(): number {
  return state.attackDamage
}

/** Hero upgrade tree: raise max HP (and heal by the same amount). */
export function bumpMaxHp(n: number): void {
  state.maxHp += n
  state.hp = Math.min(state.maxHp, state.hp + n)
  notifyHp()
}

/** Hero upgrade tree: raise base attack damage. */
export function bumpAttackDamage(n: number): void {
  state.attackDamage += n
  notifyStats()
}

/** Grants xp and resolves any resulting level-ups (heals to full, raises stats). */
export function addXp(n: number): void {
  if (state.hp <= 0) return
  state.xp += n
  let leveled = false
  while (state.xp >= state.xpToNext) {
    state.xp -= state.xpToNext
    state.level += 1
    state.maxHp += HP_PER_LEVEL
    state.attackDamage += DAMAGE_PER_LEVEL
    state.hp = state.maxHp // level-up fully heals
    state.xpToNext = XP_FIRST_LEVEL * state.level
    leveled = true
  }
  if (leveled) {
    state.levelUpFlashUntil = performance.now() * 0.001 + 1.2
    playLevelUpFanfare()
    addShake(0.2, 0.3)
    notifyHp()
  }
  notifyStats()
}

export function subscribeStats(fn: StatsListener): () => void {
  statsSubs.add(fn)
  fn({ level: state.level, xp: state.xp, xpToNext: state.xpToNext })
  return () => {
    statsSubs.delete(fn)
  }
}

function notifyStats(): void {
  const s: PlayerStats = { level: state.level, xp: state.xp, xpToNext: state.xpToNext }
  statsSubs.forEach((fn) => fn(s))
}

export function subscribeGold(fn: GoldListener): () => void {
  goldSubs.add(fn)
  fn(state.gold)
  return () => {
    goldSubs.delete(fn)
  }
}

function notifyGold(): void {
  goldSubs.forEach((fn) => fn(state.gold))
}
