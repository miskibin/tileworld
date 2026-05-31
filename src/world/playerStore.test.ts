import { describe, it, expect, beforeEach } from 'vitest'
import {
  resetPlayer,
  getPlayer,
  isPlayerAlive,
  damagePlayer,
  respawnPlayer,
  healPlayer,
  addGold,
  getGold,
  spendGold,
  addXp,
  bumpMaxHp,
  bumpAttackDamage,
  getAttackDamage,
  PLAYER_MAX_HP,
  PLAYER_STARTING_GOLD,
  PLAYER_BASE_DAMAGE,
} from './playerStore'
import { setUnlimitedMoney } from './debugStore'

// SFX/FX called by these mutators no-op in node (no AudioContext, harmless
// shake state), so the store can be exercised directly. resetPlayer gives each
// test a fresh run.
beforeEach(() => {
  resetPlayer()
  setUnlimitedMoney(false)
})

describe('damagePlayer', () => {
  it('subtracts hp and arms the hurt flash', () => {
    damagePlayer(30, 10)
    expect(getPlayer().hp).toBe(PLAYER_MAX_HP - 30)
    expect(getPlayer().hurtFlashUntil).toBe(10.35)
  })

  it('clamps hp at 0 and records death', () => {
    damagePlayer(999, 5)
    expect(getPlayer().hp).toBe(0)
    expect(getPlayer().deadSince).toBe(5)
    expect(isPlayerAlive()).toBe(false)
  })

  it('a dead player takes no further damage', () => {
    damagePlayer(999, 5)
    damagePlayer(10, 6)
    expect(getPlayer().hp).toBe(0)
    expect(getPlayer().deadSince).toBe(5) // unchanged
  })
})

describe('respawnPlayer', () => {
  it('restores hp and position but keeps progression', () => {
    addXp(50) // level up first
    const leveled = getPlayer().level
    damagePlayer(999, 1)
    respawnPlayer()
    expect(getPlayer().hp).toBe(getPlayer().maxHp)
    expect(getPlayer().deadSince).toBeNull()
    expect(getPlayer().level).toBe(leveled) // progression survives
  })
})

describe('healPlayer', () => {
  it('clamps to maxHp', () => {
    damagePlayer(40, 1)
    healPlayer(1000)
    expect(getPlayer().hp).toBe(getPlayer().maxHp)
  })
})

describe('gold', () => {
  it('starts at the configured amount', () => {
    expect(getGold()).toBe(PLAYER_STARTING_GOLD)
  })

  it('addGold accumulates', () => {
    addGold(15)
    expect(getGold()).toBe(PLAYER_STARTING_GOLD + 15)
  })

  it('spendGold succeeds when affordable and deducts', () => {
    expect(spendGold(10)).toBe(true)
    expect(getGold()).toBe(PLAYER_STARTING_GOLD - 10)
  })

  it('spendGold fails when too poor and leaves gold intact', () => {
    expect(spendGold(PLAYER_STARTING_GOLD + 1)).toBe(false)
    expect(getGold()).toBe(PLAYER_STARTING_GOLD)
  })

  it('unlimited-money cheat always succeeds without deducting', () => {
    setUnlimitedMoney(true)
    expect(spendGold(99999)).toBe(true)
    expect(getGold()).toBe(PLAYER_STARTING_GOLD)
  })
})

describe('addXp / level curve', () => {
  it('below the threshold grants xp but no level', () => {
    addXp(10)
    expect(getPlayer().level).toBe(1)
    expect(getPlayer().xp).toBe(10)
    expect(getPlayer().xpToNext).toBe(50)
  })

  it('crossing the threshold levels up, heals full, and raises stats', () => {
    addXp(50)
    const p = getPlayer()
    expect(p.level).toBe(2)
    expect(p.xp).toBe(0)
    expect(p.maxHp).toBe(PLAYER_MAX_HP + 20)
    expect(p.hp).toBe(p.maxHp) // level-up fully heals
    expect(p.attackDamage).toBe(PLAYER_BASE_DAMAGE + 8)
    expect(p.xpToNext).toBe(100) // 50 * level
  })

  it('a single grant can carry through multiple levels', () => {
    addXp(200) // 50 -> L2 (rem 150), 100 -> L3 (rem 50), 150 not met
    const p = getPlayer()
    expect(p.level).toBe(3)
    expect(p.xp).toBe(50)
    expect(p.xpToNext).toBe(150)
    expect(p.maxHp).toBe(PLAYER_MAX_HP + 40)
    expect(p.attackDamage).toBe(PLAYER_BASE_DAMAGE + 16)
  })

  it('a dead player gains no xp', () => {
    damagePlayer(999, 1)
    addXp(500)
    expect(getPlayer().level).toBe(1)
    expect(getPlayer().xp).toBe(0)
  })
})

describe('upgrade bumps', () => {
  it('bumpMaxHp raises the ceiling and heals by the same amount', () => {
    damagePlayer(50, 1) // hp 50
    bumpMaxHp(20)
    expect(getPlayer().maxHp).toBe(PLAYER_MAX_HP + 20)
    expect(getPlayer().hp).toBe(70)
  })

  it('bumpAttackDamage raises attack damage', () => {
    bumpAttackDamage(5)
    expect(getAttackDamage()).toBe(PLAYER_BASE_DAMAGE + 5)
  })
})
