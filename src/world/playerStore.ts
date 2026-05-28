export const PLAYER_MAX_HP = 100
export const PLAYER_SPAWN = { x: 48, y: 1, z: 36 } as const
export const PLAYER_RESPAWN_DELAY = 2.4
export const PLAYER_STARTING_GOLD = 30

export interface PlayerLive {
  x: number
  z: number
  y: number
  moving: boolean
  hp: number
  hurtFlashUntil: number
  deadSince: number | null
  gold: number
}

const state: PlayerLive = {
  x: PLAYER_SPAWN.x,
  z: PLAYER_SPAWN.z,
  y: PLAYER_SPAWN.y,
  moving: false,
  hp: PLAYER_MAX_HP,
  hurtFlashUntil: 0,
  deadSince: null,
  gold: PLAYER_STARTING_GOLD,
}

type HpListener = (hp: number, max: number, dead: boolean) => void
const hpSubs = new Set<HpListener>()
type GoldListener = (gold: number) => void
const goldSubs = new Set<GoldListener>()

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
  notifyHp()
}

export function respawnPlayer(): void {
  state.hp = PLAYER_MAX_HP
  state.deadSince = null
  state.hurtFlashUntil = 0
  state.x = PLAYER_SPAWN.x
  state.y = PLAYER_SPAWN.y
  state.z = PLAYER_SPAWN.z
  notifyHp()
}

export function subscribeHp(fn: HpListener): () => void {
  hpSubs.add(fn)
  fn(state.hp, PLAYER_MAX_HP, state.deadSince !== null)
  return () => {
    hpSubs.delete(fn)
  }
}

function notifyHp(): void {
  hpSubs.forEach((fn) => fn(state.hp, PLAYER_MAX_HP, state.deadSince !== null))
}

export function getGold(): number {
  return state.gold
}

export function addGold(n: number): void {
  state.gold += n
  notifyGold()
}

/** Returns true if the spend succeeded. */
export function spendGold(n: number): boolean {
  if (state.gold < n) return false
  state.gold -= n
  notifyGold()
  return true
}

export function healPlayer(n: number): void {
  state.hp = Math.min(PLAYER_MAX_HP, state.hp + n)
  notifyHp()
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
