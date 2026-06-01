import { healPlayer } from './playerStore'
import { playConsume, playEquip, playAbilityCast } from '../audio/sfx'
import { applyBuff, type BuffKind } from './buffStore'

// 6-slot Minecraft-style hotbar. Items are consumables (E / right-click → heal),
// weapons (select/equip → attack bonus + held mesh), or armor (equip → re-skins
// the knight + reduces incoming damage). Weapon and armor occupy separate equip
// slots, so you can wield a sword AND wear plate at once.

export type ItemKind = 'consumable' | 'weapon' | 'armor'

export interface ItemDef {
  id: string
  name: string
  icon: string
  kind: ItemKind
  /** consumable: hp restored */
  heal?: number
  /** weapon: bonus added to base attack damage when equipped */
  damageBonus?: number
  /** armor: fraction of incoming damage removed when worn (0.25 = −25%) */
  defense?: number
  /** armor: base colour the knight's plate is re-skinned to when worn */
  armorTint?: string
  /** consumables stack; weapons/armor don't */
  stackable: boolean
  /** consumable: timed buff granted on use (in addition to any heal) */
  buff?: { kind: BuffKind; durationMs: number; mag: number }
}

export const ITEM_DEFS: Record<string, ItemDef> = {
  bread: { id: 'bread', name: 'Bread', icon: '🍞', kind: 'consumable', heal: 15, stackable: true },
  potion: { id: 'potion', name: 'Health Potion', icon: '🧪', kind: 'consumable', heal: 40, stackable: true },
  feast: { id: 'feast', name: 'Tavern Feast', icon: '🍖', kind: 'consumable', heal: 100, stackable: true },
  sword_iron: { id: 'sword_iron', name: 'Iron Sword', icon: '⚔️', kind: 'weapon', damageBonus: 15, stackable: false },
  sword_gold: { id: 'sword_gold', name: 'Golden Blade', icon: '🗡️', kind: 'weapon', damageBonus: 30, stackable: false },
  axe: { id: 'axe', name: 'Battle Axe', icon: '🪓', kind: 'weapon', damageBonus: 22, stackable: false },
  // ─── Biome creature drops (Phase 2) ───────────────────────────
  fur: {
    id: 'fur', name: 'Thick Fur', icon: '🧥', kind: 'consumable', stackable: true,
    buff: { kind: 'resist', durationMs: 12000, mag: 0.6 },
  },
  venom: {
    id: 'venom', name: 'Venom Vial', icon: '🧫', kind: 'consumable', stackable: true,
    buff: { kind: 'power', durationMs: 12000, mag: 1.4 },
  },
  goat_charm: {
    id: 'goat_charm', name: 'Goat Charm', icon: '🔔', kind: 'consumable', stackable: true,
    buff: { kind: 'haste', durationMs: 12000, mag: 1.3 },
  },
  croc_steak: { id: 'croc_steak', name: 'Croc Steak', icon: '🥩', kind: 'consumable', heal: 70, stackable: true },
  elk_jerky: { id: 'elk_jerky', name: 'Elk Jerky', icon: '🍖', kind: 'consumable', heal: 35, stackable: true },
  stone_maul: { id: 'stone_maul', name: 'Stone Maul', icon: '🔨', kind: 'weapon', damageBonus: 26, stackable: false },
  // ─── Wearable armor (equip → re-skins the knight + cuts incoming damage) ──
  leather_armor: { id: 'leather_armor', name: 'Leather Armor', icon: '🦺', kind: 'armor', defense: 0.15, armorTint: '#7a5230', stackable: false },
  iron_armor: { id: 'iron_armor', name: 'Iron Cuirass', icon: '🛡️', kind: 'armor', defense: 0.28, armorTint: '#aeb4c0', stackable: false },
  gold_armor: { id: 'gold_armor', name: 'Gilded Plate', icon: '👑', kind: 'armor', defense: 0.4, armorTint: '#e8b84b', stackable: false },
}

export const HOTBAR_SIZE = 6

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
  /** equipped armor id (null = bare knight); drives the model re-skin */
  equippedArmorId: string | null
  /** incoming-damage multiplier from worn armor (1 = none, 0.6 = −40%) */
  armorDamageMult: number
}

const state: InventoryState = {
  slots: Array.from({ length: HOTBAR_SIZE }, () => ({ itemId: null, count: 0 })),
  selected: 0,
  weaponBonus: 0,
  equippedId: null,
  equippedArmorId: null,
  armorDamageMult: 1,
}

const subs = new Set<() => void>()

export function getInventory(): InventoryState {
  return state
}

export function getWeaponBonus(): number {
  return state.weaponBonus
}

/** Incoming-damage multiplier from worn armor (1 = none). Read by damagePlayer. */
export function getArmorDamageMult(): number {
  return state.armorDamageMult
}

/** Equip the armor item by id (sets the re-skin + defense). Internal helper. */
function equipArmor(def: ItemDef): void {
  state.equippedArmorId = def.id
  state.armorDamageMult = 1 - (def.defense ?? 0)
  playEquip()
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
  // Auto-equip: selecting a weapon/armor slot equips it, so the held model,
  // damage, and worn plate follow the hotbar (picking the axe = holding the
  // axe; picking plate = wearing it). Consumables stay on E / right-click so
  // simply browsing the bar doesn't eat them.
  const slot = state.slots[i]
  const def = slot?.itemId ? ITEM_DEFS[slot.itemId] : null
  if (def?.kind === 'weapon' && state.equippedId !== def.id) {
    state.weaponBonus = def.damageBonus ?? 0
    state.equippedId = def.id
    playEquip()
  } else if (def?.kind === 'armor' && state.equippedArmorId !== def.id) {
    equipArmor(def)
  }
  notify()
}

/** Move the selection by `dir` (±1), wrapping around the bar. Drives the
 *  scroll-wheel hotbar cycle; reuses selectSlot's auto-equip. */
export function cycleSelection(dir: number): void {
  const next = (state.selected + dir + HOTBAR_SIZE) % HOTBAR_SIZE
  selectSlot(next)
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
    if (def.buff) applyBuff(def.buff.kind, def.buff.durationMs, def.buff.mag)
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
  } else if (def.kind === 'armor') {
    equipArmor(def)
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
  state.equippedArmorId = null
  state.armorDamageMult = 1
  notify()
}
