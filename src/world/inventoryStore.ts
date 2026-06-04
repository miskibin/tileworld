import { healPlayer } from './playerStore'
import { playConsume, playEquip, playAbilityCast } from '../audio/sfx'
import { applyBuff, type BuffKind } from './buffStore'

// 8-slot Minecraft-style hotbar. Items are consumables (E / right-click → heal),
// weapons (select/equip → attack bonus + held mesh), or armor (equip → re-skins
// the knight + reduces incoming damage). Weapon and armor occupy separate equip
// slots, so you can wield a sword AND wear plate at once.

// 'token' = a key/quest item that just sits in the bag (the Mercenary Contract
// spent to recruit a trader). It can't be eaten or equipped — activate/select
// leave it inert; only consumeItem() removes it.
export type ItemKind = 'consumable' | 'weapon' | 'armor' | 'token'

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
  /** armor: plate metalness when worn (leather matte → gold shiny); default 0.25 */
  armorMetal?: number
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
  // Foraged in the swamp (see HerbPlants) — a heal + damage-resist poultice to
  // stockpile for a hard night. The forager's reward for braving the bog hazard.
  marsh_herb: {
    id: 'marsh_herb', name: 'Marsh Herb', icon: '🌿', kind: 'consumable', stackable: true,
    heal: 30,
    buff: { kind: 'resist', durationMs: 14000, mag: 0.6 },
  },
  stone_maul: { id: 'stone_maul', name: 'Stone Maul', icon: '🔨', kind: 'weapon', damageBonus: 26, stackable: false },
  // ─── Wearable armor (equip → re-skins the knight + cuts incoming damage) ──
  leather_armor: { id: 'leather_armor', name: 'Leather Armor', icon: '🦺', kind: 'armor', defense: 0.15, armorTint: '#7a5230', armorMetal: 0.18, stackable: false },
  iron_armor: { id: 'iron_armor', name: 'Iron Cuirass', icon: '🛡️', kind: 'armor', defense: 0.28, armorTint: '#aeb4c0', armorMetal: 0.6, stackable: false },
  gold_armor: { id: 'gold_armor', name: 'Gilded Plate', icon: '👑', kind: 'armor', defense: 0.4, armorTint: '#e8b84b', armorMetal: 0.85, stackable: false },
  // ─── Key items (tokens) ───────────────────────────────────────
  // Rare ork/chest drop spent to recruit a trader into the militia (see recruit.ts).
  mercenary_contract: { id: 'mercenary_contract', name: 'Mercenary Contract', icon: '📜', kind: 'token', stackable: true },
}

export const HOTBAR_SIZE = 8

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

/** Equip a weapon (sets the held mesh id + attack bonus). Internal helper. */
function equipWeapon(def: ItemDef): void {
  state.weaponBonus = def.damageBonus ?? 0
  state.equippedId = def.id
  playEquip()
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
    equipWeapon(def)
  } else if (def?.kind === 'armor' && state.equippedArmorId !== def.id) {
    equipArmor(def)
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

/** Total count of an item across the hotbar (stacks live in one slot, but scan
 *  anyway so non-stackables count too). */
function countItem(itemId: string): number {
  let n = 0
  for (const s of state.slots) if (s.itemId === itemId) n += s.count
  return n
}

/** True if the player holds at least one of `itemId`. */
export function hasItem(itemId: string): boolean {
  return countItem(itemId) > 0
}

/** Remove `count` of `itemId` from the bag. Returns false (and changes nothing)
 *  if the player doesn't hold that many. Used by recruiting to spend a token. */
export function consumeItem(itemId: string, count = 1): boolean {
  if (countItem(itemId) < count) return false
  let remaining = count
  for (const s of state.slots) {
    if (remaining <= 0) break
    if (s.itemId !== itemId) continue
    const take = Math.min(s.count, remaining)
    s.count -= take
    remaining -= take
    if (s.count <= 0) {
      s.itemId = null
      s.count = 0
    }
  }
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
    equipWeapon(def)
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
