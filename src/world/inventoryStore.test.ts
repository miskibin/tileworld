import { describe, it, expect, beforeEach, vi } from 'vitest'

// inventoryStore pulls in audio + player + buff side-effects at import; stub them
// so these pure hotbar-logic tests stay deterministic and silent.
vi.mock('../audio/sfx', () => ({
  playConsume: () => {},
  playEquip: () => {},
  playAbilityCast: () => {},
}))
vi.mock('./playerStore', () => ({ healPlayer: () => {} }))
vi.mock('./buffStore', () => ({ applyBuff: () => {} }))

import {
  addItem,
  consumeItem,
  hasItem,
  activateSlot,
  getInventory,
  resetInventory,
  selectSlot,
} from './inventoryStore'

beforeEach(() => {
  resetInventory()
})

describe('consumeItem', () => {
  it('decrements a stack and reports success', () => {
    addItem('mercenary_contract', 2)
    expect(consumeItem('mercenary_contract')).toBe(true)
    expect(hasItem('mercenary_contract')).toBe(true) // one left
  })

  it('frees the slot when the last one is consumed', () => {
    addItem('mercenary_contract', 1)
    expect(consumeItem('mercenary_contract')).toBe(true)
    expect(hasItem('mercenary_contract')).toBe(false)
    expect(getInventory().slots.every((s) => s.itemId === null)).toBe(true)
  })

  it('returns false when the item is absent', () => {
    expect(consumeItem('mercenary_contract')).toBe(false)
  })
})

describe('token kind is inert in the hotbar', () => {
  it('activating a token neither heals nor consumes it', () => {
    addItem('mercenary_contract', 1)
    const slot = getInventory().slots.findIndex((s) => s.itemId === 'mercenary_contract')
    activateSlot(slot)
    expect(getInventory().slots[slot].count).toBe(1) // untouched
  })

  it('selecting a token slot does not equip it as a weapon/armor', () => {
    addItem('mercenary_contract', 1)
    const slot = getInventory().slots.findIndex((s) => s.itemId === 'mercenary_contract')
    selectSlot(slot)
    expect(getInventory().equippedId).toBeNull()
    expect(getInventory().equippedArmorId).toBeNull()
  })
})
