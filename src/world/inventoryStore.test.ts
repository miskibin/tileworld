import { describe, it, expect, beforeEach, vi } from 'vitest'

// inventoryStore pulls in audio + player + buff side-effects at import; stub them
// so these pure inventory-logic tests stay deterministic and silent. healPlayer
// and applyBuff are spies so we can assert eat/use actually fire their effects.
vi.mock('../audio/sfx', () => ({
  playConsume: () => {},
  playEquip: () => {},
  playAbilityCast: () => {},
}))
const healPlayer = vi.fn()
const applyBuff = vi.fn()
vi.mock('./playerStore', () => ({ healPlayer: (n: number) => healPlayer(n) }))
vi.mock('./buffStore', () => ({ applyBuff: (...a: unknown[]) => applyBuff(...a) }))

import {
  addItem,
  consumeItem,
  hasItem,
  getInventory,
  resetInventory,
  eatFood,
  activateBuff,
  getFoodSlot,
  getBuffSlot,
  activateBagItem,
  unequipWeapon,
  unequipArmor,
  getWeaponBonus,
  getArmorDamageMult,
  toggleInventory,
  isInventoryOpen,
} from './inventoryStore'
import { getItemToasts, resetItemToasts } from './itemToastStore'

beforeEach(() => {
  resetInventory()
  resetItemToasts()
  healPlayer.mockClear()
  applyBuff.mockClear()
})

describe('consumeItem (bag)', () => {
  it('decrements a stack and reports success', () => {
    addItem('mercenary_contract', 2)
    expect(consumeItem('mercenary_contract')).toBe(true)
    expect(hasItem('mercenary_contract')).toBe(true) // one left
  })

  it('frees the slot when the last one is consumed', () => {
    addItem('mercenary_contract', 1)
    expect(consumeItem('mercenary_contract')).toBe(true)
    expect(hasItem('mercenary_contract')).toBe(false)
    expect(getInventory().bag.every((s) => s.itemId === null)).toBe(true)
  })

  it('returns false when the item is absent', () => {
    expect(consumeItem('mercenary_contract')).toBe(false)
  })
})

describe('eatFood (Q quick-slot)', () => {
  it('eats the next food, heals, and decrements it', () => {
    addItem('bread', 2)
    expect(eatFood()).toBe(true)
    expect(healPlayer).toHaveBeenCalledWith(15)
    expect(getFoodSlot()).toEqual({ itemId: 'bread', count: 1 })
  })

  it('auto-surfaces the next food item once a stack is depleted', () => {
    addItem('apple', 1)
    addItem('feast', 1)
    expect(getFoodSlot()?.itemId).toBe('apple') // first food in the bag
    eatFood() // apple gone
    expect(getFoodSlot()).toEqual({ itemId: 'feast', count: 1 })
  })

  it('also applies the buff on a dual heal+buff food (marsh herb)', () => {
    addItem('marsh_herb', 1)
    expect(eatFood()).toBe(true)
    expect(healPlayer).toHaveBeenCalledWith(30)
    expect(applyBuff).toHaveBeenCalledWith('resist', expect.any(Number), expect.any(Number))
  })

  it('returns false and does nothing when no food is held', () => {
    addItem('fur', 1) // a buff item, not food
    expect(eatFood()).toBe(false)
    expect(healPlayer).not.toHaveBeenCalled()
    expect(getFoodSlot()).toBeNull()
  })
})

describe('activateBuff (z/x/c quick-slots)', () => {
  it('uses the matching buff item for the requested kind', () => {
    addItem('fur', 1) // resist
    expect(activateBuff('resist')).toBe(true)
    expect(applyBuff).toHaveBeenCalledWith('resist', expect.any(Number), expect.any(Number))
    expect(getBuffSlot('resist')).toBeNull()
  })

  it('does not pull a food-tagged dual item into a buff slot', () => {
    addItem('marsh_herb', 1) // heals + resist, but tagged food
    expect(getBuffSlot('resist')).toBeNull()
    expect(activateBuff('resist')).toBe(false)
    expect(getFoodSlot()?.itemId).toBe('marsh_herb') // it belongs to food
  })

  it('returns false when no item of that buff kind is held', () => {
    expect(activateBuff('power')).toBe(false)
  })
})

describe('activateBagItem (click in the panel)', () => {
  it('equips a weapon and removes it from the bag', () => {
    addItem('sword_iron', 1)
    const i = getInventory().bag.findIndex((s) => s.itemId === 'sword_iron')
    activateBagItem(i)
    expect(getInventory().equippedId).toBe('sword_iron')
    expect(getWeaponBonus()).toBe(15)
    expect(hasItem('sword_iron')).toBe(false) // moved into the equip slot
  })

  it('swaps the previously equipped weapon back into the bag', () => {
    addItem('sword_iron', 1)
    addItem('axe', 1)
    activateBagItem(getInventory().bag.findIndex((s) => s.itemId === 'sword_iron'))
    activateBagItem(getInventory().bag.findIndex((s) => s.itemId === 'axe'))
    expect(getInventory().equippedId).toBe('axe')
    expect(hasItem('sword_iron')).toBe(true) // returned to the bag
  })

  it('equips armor and applies its damage reduction', () => {
    addItem('leather_armor', 1)
    activateBagItem(getInventory().bag.findIndex((s) => s.itemId === 'leather_armor'))
    expect(getInventory().equippedArmorId).toBe('leather_armor')
    expect(getArmorDamageMult()).toBeCloseTo(0.85) // 1 - 0.15
  })

  it('eats a consumable when clicked', () => {
    addItem('bread', 1)
    activateBagItem(getInventory().bag.findIndex((s) => s.itemId === 'bread'))
    expect(healPlayer).toHaveBeenCalledWith(15)
    expect(hasItem('bread')).toBe(false)
  })

  it('leaves a token inert', () => {
    addItem('mercenary_contract', 1)
    const i = getInventory().bag.findIndex((s) => s.itemId === 'mercenary_contract')
    activateBagItem(i)
    expect(getInventory().bag[i].count).toBe(1)
    expect(getInventory().equippedId).toBeNull()
  })
})

describe('unequip returns gear to the bag', () => {
  it('unequips a weapon and clears the bonus', () => {
    addItem('sword_iron', 1)
    activateBagItem(getInventory().bag.findIndex((s) => s.itemId === 'sword_iron'))
    unequipWeapon()
    expect(getInventory().equippedId).toBeNull()
    expect(getWeaponBonus()).toBe(0)
    expect(hasItem('sword_iron')).toBe(true)
  })

  it('unequips armor and restores full damage taken', () => {
    addItem('leather_armor', 1)
    activateBagItem(getInventory().bag.findIndex((s) => s.itemId === 'leather_armor'))
    unequipArmor()
    expect(getInventory().equippedArmorId).toBeNull()
    expect(getArmorDamageMult()).toBe(1)
    expect(hasItem('leather_armor')).toBe(true)
  })
})

describe('pickup toasts', () => {
  it('fires a toast when an item is picked up', () => {
    addItem('bread', 1)
    expect(getItemToasts().map((t) => t.itemId)).toContain('bread')
  })

  it('does not fire a toast when gear is swapped/returned to the bag', () => {
    addItem('sword_iron', 1) // one genuine pickup → one toast
    activateBagItem(getInventory().bag.findIndex((s) => s.itemId === 'sword_iron')) // equip
    unequipWeapon() // returns to the bag — must be silent
    const swordToasts = getItemToasts().filter((t) => t.itemId === 'sword_iron')
    expect(swordToasts).toHaveLength(1)
    expect(swordToasts[0].count).toBe(1) // not bumped by the silent return
  })
})

describe('inventory open flag', () => {
  it('toggles open/closed', () => {
    expect(isInventoryOpen()).toBe(false)
    toggleInventory()
    expect(isInventoryOpen()).toBe(true)
    toggleInventory()
    expect(isInventoryOpen()).toBe(false)
  })
})
