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
  getCritChance,
  setCritChance,
  getLifesteal,
  setLifesteal,
  getMoveSpeedMult,
  setMoveSpeedMult,
  getCleave,
  setCleave,
  getBountyMult,
  setBountyMult,
  rollCrit,
  PLAYER_MAX_HP,
  PLAYER_STARTING_GOLD,
  PLAYER_BASE_DAMAGE,
} from './playerStore'
import { orkBountyGold, orkBountyXp } from './orkConfig'
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

  it('a dead player still banks earned xp but is never revived by the level-up heal', () => {
    // Reward orbs from a kill can land just after a fatal blow; that XP must
    // count (succession preserves progression), but the level-up full-heal must
    // NOT bring the corpse back to life.
    damagePlayer(999, 1)
    expect(isPlayerAlive()).toBe(false)
    const before = getPlayer().level
    addXp(500)
    const p = getPlayer()
    expect(p.level).toBeGreaterThan(before) // xp was banked / leveled
    expect(p.hp).toBe(0) // still dead — not revived by the heal
    expect(isPlayerAlive()).toBe(false)
  })
})

describe('upgrade bumps', () => {
  it('bumpMaxHp raises the ceiling and heals by the same amount', () => {
    damagePlayer(50, 1) // hp = PLAYER_MAX_HP - 50
    bumpMaxHp(20)
    expect(getPlayer().maxHp).toBe(PLAYER_MAX_HP + 20)
    expect(getPlayer().hp).toBe(PLAYER_MAX_HP - 30)
  })

  it('bumpAttackDamage raises attack damage', () => {
    bumpAttackDamage(5)
    expect(getAttackDamage()).toBe(PLAYER_BASE_DAMAGE + 5)
  })
})

describe('combat/economy upgrade flags', () => {
  it('default to neutral (no upgrade owned)', () => {
    expect(getCritChance()).toBe(0)
    expect(getLifesteal()).toBe(0)
    expect(getMoveSpeedMult()).toBe(1)
    expect(getCleave()).toBe(0)
    expect(getBountyMult()).toBe(1)
  })

  it('setters update the flag the getter returns', () => {
    setCritChance(0.2)
    setLifesteal(10)
    setMoveSpeedMult(1.18)
    setCleave(0.5)
    setBountyMult(1.5)
    expect(getCritChance()).toBe(0.2)
    expect(getLifesteal()).toBe(10)
    expect(getMoveSpeedMult()).toBe(1.18)
    expect(getCleave()).toBe(0.5)
    expect(getBountyMult()).toBe(1.5)
  })

  it('resetPlayer clears the flags back to neutral', () => {
    setCritChance(0.2)
    setBountyMult(1.5)
    resetPlayer()
    expect(getCritChance()).toBe(0)
    expect(getBountyMult()).toBe(1)
  })
})

describe('rollCrit', () => {
  it('returns base damage and crit=false when the roll misses the chance', () => {
    // r (0.5) >= critChance (0.2) → no crit.
    expect(rollCrit(40, 0.2, 0.5)).toEqual({ damage: 40, crit: false })
  })

  it('doubles damage and crit=true when the roll lands under the chance', () => {
    // r (0.1) < critChance (0.2) → crit.
    expect(rollCrit(40, 0.2, 0.1)).toEqual({ damage: 80, crit: true })
  })

  it('never crits at 0 chance, always crits at full chance', () => {
    expect(rollCrit(25, 0, 0).crit).toBe(false) // r=0 is not < 0
    expect(rollCrit(25, 1, 0.999).crit).toBe(true) // any r < 1 crits
  })
})

describe('ork bounty rewards', () => {
  // Exercises the real reward helpers Character.tsx uses on a kill — so a change
  // to the per-variant bounty table or the multiplier formula is actually caught
  // (the old test just re-derived `8 * mult` inline and could never regress).
  it('scales gold by ork variant and the bounty multiplier (rounded)', () => {
    expect(orkBountyGold('grunt', 1)).toBe(8)
    expect(orkBountyGold('shaman', 1)).toBe(18) // tougher variants are worth more
    expect(orkBountyGold('grunt', 1.5)).toBe(12) // 8 * 1.5
    expect(orkBountyGold('shaman', 1.5)).toBe(27) // round(18 * 1.5)
  })
  it('pays distinct XP per variant (no bounty multiplier)', () => {
    expect(orkBountyXp('grunt')).toBe(20)
    expect(orkBountyXp('scout')).toBe(14)
    expect(orkBountyXp('berserker')).toBe(30)
    expect(orkBountyXp('shaman')).toBe(34)
  })
})
