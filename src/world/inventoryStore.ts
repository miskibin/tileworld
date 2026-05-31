import { healPlayer } from './playerStore'
import { playConsume, playEquip, playAbilityCast } from '../audio/sfx'

// 5-slot Minecraft-style hotbar. Items are either consumables (right-click to
// use → heal) or weapons (right-click to equip → sets player attack bonus).

export type ItemKind = 'consumable' | 'weapon'

export interface ItemDef {
  id: string
  name: string
  icon: string
  kind: ItemKind
  /** consumable: hp restored */
  heal?: number
  /** weapon: bonus added to base attack damage when equipped */
  damageBonus?: number
  /** consumables stack; weapons don't */
  stackable: boolean
}

export const ITEM_DEFS: Record<string, ItemDef> = {
  bread: { id: 'bread', name: 'Bread', icon: '🍞', kind: 'consumable', heal: 15, stackable: true },
  potion: { id: 'potion', name: 'Health Potion', icon: '🧪', kind: 'consumable', heal: 40, stackable: true },
  feast: { id: 'feast', name: 'Tavern Feast', icon: '🍖', kind: 'consumable', heal: 100, stackable: true },
  sword_iron: { id: 'sword_iron', name: 'Iron Sword', icon: '⚔️', kind: 'weapon', damageBonus: 15, stackable: false },
  sword_gold: { id: 'sword_gold', name: 'Golden Blade', icon: '🗡️', kind: 'weapon', damageBonus: 30, stackable: false },
  axe: { id: 'axe', name: 'Battle Axe', icon: '🪓', kind: 'weapon', damageBonus: 22, stackable: false },
}

export const HOTBAR_SIZE = 5

export interface Slot {
  itemId: string | null
  count: number
}

interface InventoryState {
  slots: Slot[]
  selected: number
  /** equipped weapon's damage bonus (0 when fists/starter sword) */
  weaponBonus: number
  equippedId: string | null
}

const state: InventoryState = {
  slots: Array.from({ length: HOTBAR_SIZE }, () => ({ itemId: null, count: 0 })),
  selected: 0,
  weaponBonus: 0,
  equippedId: null,
}

const subs = new Set<() => void>()

export function getInventory(): InventoryState {
  return state
}

export function getWeaponBonus(): number {
  return state.weaponBonus
}

export function subscribeInventory(fn: () => void): () => void {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}

function notify(): void {
  subs.forEach((fn) => fn())
}

export function selectSlot(i: number): void {
  if (i < 0 || i >= HOTBAR_SIZE) return
  state.selected = i
  // Auto-wield: selecting a weapon slot equips it, so the held model + damage
  // follow the hotbar (picking the axe = holding the axe). Consumables stay on
  // Q / right-click so simply browsing the bar doesn't eat them.
  const slot = state.slots[i]
  const def = slot?.itemId ? ITEM_DEFS[slot.itemId] : null
  if (def?.kind === 'weapon' && state.equippedId !== def.id) {
    state.weaponBonus = def.damageBonus ?? 0
    state.equippedId = def.id
    playEquip()
  }
  notify()
}

/** Add an item to the hotbar. Returns false if there's no room. */
export function addItem(itemId: string, count = 1): boolean {
  const def = ITEM_DEFS[itemId]
  if (!def) return false
  if (def.stackable) {
    const existing = state.slots.find((s) => s.itemId === itemId)
    if (existing) {
      existing.count += count
      notify()
      return true
    }
  }
  const empty = state.slots.find((s) => s.itemId === null)
  if (!empty) return false
  empty.itemId = itemId
  empty.count = count
  notify()
  return true
}

/** Right-click / activate the item in slot i: consume to heal, or equip a weapon. */
export function activateSlot(i: number): void {
  const slot = state.slots[i]
  if (!slot || !slot.itemId) return
  const def = ITEM_DEFS[slot.itemId]
  if (!def) return

  if (def.kind === 'consumable') {
    healPlayer(def.heal ?? 0)
    playConsume()
    playAbilityCast()
    slot.count -= 1
    if (slot.count <= 0) {
      slot.itemId = null
      slot.count = 0
    }
    notify()
  } else if (def.kind === 'weapon') {
    state.weaponBonus = def.damageBonus ?? 0
    state.equippedId = def.id
    playEquip()
    notify()
  }
}

/** Convenience: activate the currently selected slot. */
export function activateSelected(): void {
  activateSlot(state.selected)
}

export function resetInventory(): void {
  state.slots = Array.from({ length: HOTBAR_SIZE }, () => ({ itemId: null, count: 0 }))
  state.selected = 0
  state.weaponBonus = 0
  state.equippedId = null
  notify()
}
