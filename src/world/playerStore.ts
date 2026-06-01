import { playGold, playHurt, playLevelUp } from '../audio/sfx'
import { addShake } from './fxStore'
import { isUnlimitedMoney } from './debugStore'

export const PLAYER_MAX_HP = 100
export const PLAYER_SPAWN = { x: 48, y: 1, z: 36 } as const
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

export function setPlayerPos(x: number, y: number, z: number, moving: boolean): void {
  state.x = x
  state.y = y
  state.z = z
  state.moving = moving
}

export function isPlayerAlive(): boolean {
  return state.hp > 0
}

export function damagePlayer(amount: number, now: number): void {
  if (state.hp <= 0) return
  state.hp = Math.max(0, state.hp - amount)
  state.hurtFlashUntil = now + 0.35
  if (state.hp <= 0) state.deadSince = now
  playHurt()
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
  notifyHp()
  notifyGold()
  notifyStats()
}

/** Respawn keeps progression (level/xp/gold/maxHp) — only hp + position reset. */
export function respawnPlayer(): void {
  respawnPlayerAt(PLAYER_SPAWN.x, PLAYER_SPAWN.y, PLAYER_SPAWN.z)
}

/** Like respawnPlayer but rises at a given spot — used by the succession
 *  mechanic, where the hero's spirit returns in the body of an heir villager
 *  who stood elsewhere on the field. Progression is fully preserved. */
export function respawnPlayerAt(x: number, y: number, z: number): void {
  state.hp = state.maxHp
  state.deadSince = null
  state.hurtFlashUntil = 0
  state.x = x
  state.y = y
  state.z = z
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
  if (n > 0) playGold()
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
    playLevelUp()
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
