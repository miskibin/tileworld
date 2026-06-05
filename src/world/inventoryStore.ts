import { healPlayer } from './playerStore'
import { playConsume, playEquip, playAbilityCast } from '../audio/sfx'
import { applyBuff, BUFF_LABEL, type BuffKind } from './buffStore'
import { pushItemToast } from './itemToastStore'

// Inventory model: one general-purpose BAG holds everything you pick up, plus two
// equip slots (weapon + armor). There is no selectable hotbar anymore — instead:
//   • a FOOD quick-slot (Q) eats the next eatable item in the bag,
//   • three BUFF quick-slots (z/x/c) each use the next item tagged with that buff.
// All four quick-slots are *derived views* into the bag, not storage — when one is
// used up the next matching item surfaces automatically. Gear is equipped/eaten by
// clicking items in the openable inventory panel (see InventoryPanel.tsx).

// 'token' = a key/quest item that just sits in the bag (the Mercenary Contract
// spent to recruit a trader). It can't be eaten or equipped — activate leaves it
// inert; only consumeItem() removes it.
export type ItemKind = 'consumable' | 'weapon' | 'armor' | 'token'

// Which quick-slot a consumable surfaces in: the Food slot (Q) or one of the
// three buff slots (z/x/c). An item is tagged to exactly ONE slot — a heal+buff
// item like Marsh Herb is Food, and its buff is just a bonus when eaten.
export type QuickKind = 'food' | BuffKind

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
  /** consumable: which quick-slot surfaces it. Defaults to the buff kind, else 'food'. */
  quick?: QuickKind
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
  // stockpile for a hard night. Tagged `food` so it eats off Q; the resist is a
  // bonus on top of the heal (the tag decides where it shows, not what it does).
  marsh_herb: {
    id: 'marsh_herb', name: 'Marsh Herb', icon: '🌿', kind: 'consumable', stackable: true,
    heal: 30,
    buff: { kind: 'resist', durationMs: 14000, mag: 0.6 },
    quick: 'food',
  },
  // Foraged in the western forest (see AppleTrees) — a quick snack heal, the
  // woods' easy reward alongside the hunt.
  apple: {
    id: 'apple', name: 'Forest Apple', icon: '🍎', kind: 'consumable', stackable: true,
    heal: 18,
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

/** General-purpose bag capacity. Generous so pickups/shop buys rarely bounce. */
export const BAG_SIZE = 24

export interface Slot {
  itemId: string | null
  count: number
}

/** A derived quick-slot view (the next bag item that feeds Q / z / x / c). */
export interface QuickSlot {
  itemId: string
  count: number
}

interface InventoryState {
  bag: Slot[]
  /** equipped weapon's damage bonus (0 when fists/starter sword) */
  weaponBonus: number
  equippedId: string | null
  /** equipped armor id (null = bare knight); drives the model re-skin */
  equippedArmorId: string | null
  /** incoming-damage multiplier from worn armor (1 = none, 0.6 = −40%) */
  armorDamageMult: number
  /** true while the inventory panel is open (freezes the world like the shop) */
  open: boolean
}

function emptyBag(): Slot[] {
  return Array.from({ length: BAG_SIZE }, () => ({ itemId: null, count: 0 }))
}

const state: InventoryState = {
  bag: emptyBag(),
  weaponBonus: 0,
  equippedId: null,
  equippedArmorId: null,
  armorDamageMult: 1,
  open: false,
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

export function subscribeInventory(fn: () => void): () => void {
  subs.add(fn)
  fn() // seed with current state on subscribe, matching the other subscribeX stores
  return () => {
    subs.delete(fn)
  }
}

function notify(): void {
  subs.forEach((fn) => fn())
}

/** Which quick-slot a consumable feeds: explicit tag, else its buff kind, else food. */
function quickOf(def: ItemDef): QuickKind {
  return def.quick ?? def.buff?.kind ?? 'food'
}

/** The key that uses each quick-slot (shown in tooltips + pickup toasts). */
const QUICK_KEY: Record<QuickKind, string> = { food: 'Q', resist: 'Z', power: 'X', haste: 'C' }

/** One-line stat summary of an item — shared by the panel tooltip + pickup toast. */
export function itemStatLine(def: ItemDef): string {
  if (def.kind === 'weapon') return `+${def.damageBonus} attack`
  if (def.kind === 'armor') return `−${Math.round((def.defense ?? 0) * 100)}% damage taken`
  if (def.kind === 'token') return 'Key item'
  const parts: string[] = []
  if (def.heal) parts.push(`+${def.heal} HP`)
  if (def.buff) parts.push(`${BUFF_LABEL[def.buff.kind]} ${Math.round(def.buff.durationMs / 1000)}s`)
  return parts.join(' · ') || 'No effect'
}

/** Short "how to use it" hint for a freshly picked-up item (drives the toast note). */
export function pickupNote(def: ItemDef): string {
  if (def.kind === 'weapon' || def.kind === 'armor') return 'Equip in inventory (I)'
  if (def.kind === 'token') return 'Key item'
  const k = quickOf(def)
  return k === 'food' ? 'Eat with Q' : `Use with ${QUICK_KEY[k]}`
}

// ─── Bag management ──────────────────────────────────────────────

/** Drop an item into the bag with NO pickup toast — the shared insertion path.
 *  Used both by addItem (real pickups) and by gear swaps/unequips returning a
 *  piece to the bag (which must stay silent). Returns false if there's no room. */
function placeInBag(itemId: string, count = 1): boolean {
  const def = ITEM_DEFS[itemId]
  if (!def) return false
  if (def.stackable) {
    const existing = state.bag.find((s) => s.itemId === itemId)
    if (existing) {
      existing.count += count
      notify()
      return true
    }
  }
  const empty = state.bag.find((s) => s.itemId === null)
  if (!empty) return false
  empty.itemId = itemId
  empty.count = count
  notify()
  return true
}

/** Pick up an item: add it to the bag and (on success) announce it via a toast.
 *  This is the entry point for all genuine acquisitions — chests, forage, ground
 *  loot, shop buys. Returns false (no toast) if the bag is full. */
export function addItem(itemId: string, count = 1): boolean {
  const ok = placeInBag(itemId, count)
  if (ok) pushItemToast(itemId, count)
  return ok
}

/** Total count of an item across the bag. */
function countItem(itemId: string): number {
  let n = 0
  for (const s of state.bag) if (s.itemId === itemId) n += s.count
  return n
}

/** True if the player holds at least one of `itemId`. */
export function hasItem(itemId: string): boolean {
  return countItem(itemId) > 0
}

/** True if the bag could accept EVERY id in `ids` at once — accounts for empty
 *  slots plus stackable merges (a stackable id that already has, or gains, a
 *  stack costs no slot). Lets a caller (e.g. a chest) avoid granting loot it has
 *  no room for and silently dropping it. */
export function bagHasRoomFor(ids: string[]): boolean {
  let free = state.bag.reduce((n, s) => (s.itemId === null ? n + 1 : n), 0)
  const stacks = new Set(
    state.bag.filter((s) => s.itemId && ITEM_DEFS[s.itemId]?.stackable).map((s) => s.itemId),
  )
  for (const id of ids) {
    const def = ITEM_DEFS[id]
    if (!def) continue
    if (def.stackable && stacks.has(id)) continue // merges into an existing stack
    if (free <= 0) return false
    free -= 1
    if (def.stackable) stacks.add(id) // a later same-id now stacks on this new slot
  }
  return true
}

/** Remove `count` of `itemId` from the bag. Returns false (and changes nothing)
 *  if the player doesn't hold that many. Used by recruiting to spend a token. */
export function consumeItem(itemId: string, count = 1): boolean {
  if (countItem(itemId) < count) return false
  let remaining = count
  for (const s of state.bag) {
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

// ─── Quick-slots (derived views into the bag) ────────────────────

/** Bag index of the next consumable feeding the given quick-slot, or -1. */
function quickIndex(kind: QuickKind): number {
  return state.bag.findIndex((s) => {
    if (!s.itemId) return false
    const def = ITEM_DEFS[s.itemId]
    return !!def && def.kind === 'consumable' && quickOf(def) === kind
  })
}

/** Apply a consumable in bag slot `i` (heal + buff), then decrement it. */
function consumeConsumableAt(i: number): void {
  const slot = state.bag[i]
  if (!slot?.itemId) return
  const def = ITEM_DEFS[slot.itemId]
  if (!def || def.kind !== 'consumable') return
  if (def.heal) healPlayer(def.heal)
  if (def.buff) applyBuff(def.buff.kind, def.buff.durationMs, def.buff.mag)
  playConsume()
  playAbilityCast()
  slot.count -= 1
  if (slot.count <= 0) {
    slot.itemId = null
    slot.count = 0
  }
  notify()
}

/** Q: eat the next food in the bag. Returns false if none is held. */
export function eatFood(): boolean {
  const i = quickIndex('food')
  if (i < 0) return false
  consumeConsumableAt(i)
  return true
}

/** z/x/c: use the next item feeding the given buff slot. False if none. */
export function activateBuff(kind: BuffKind): boolean {
  const i = quickIndex(kind)
  if (i < 0) return false
  consumeConsumableAt(i)
  return true
}

function quickSlot(kind: QuickKind): QuickSlot | null {
  const i = quickIndex(kind)
  if (i < 0) return null
  const slot = state.bag[i]
  return { itemId: slot.itemId as string, count: slot.count }
}

/** The food item that Q would eat next (icon + count), or null. */
export function getFoodSlot(): QuickSlot | null {
  return quickSlot('food')
}

/** The item that the given buff key would use next (icon + count), or null. */
export function getBuffSlot(kind: BuffKind): QuickSlot | null {
  return quickSlot(kind)
}

// ─── Equipping (driven by clicks in the inventory panel) ─────────

/** Equip the weapon/armor in bag slot `i`, swapping any current piece back. */
function equipFromBag(i: number, type: 'weapon' | 'armor'): void {
  const slot = state.bag[i]
  if (!slot?.itemId) return
  const def = ITEM_DEFS[slot.itemId]
  if (!def) return
  const newId = slot.itemId
  // Remove the piece from the bag first (gear is non-stackable → free the slot),
  // so the now-empty slot can receive the previously equipped piece.
  slot.count -= 1
  if (slot.count <= 0) {
    slot.itemId = null
    slot.count = 0
  }
  if (type === 'weapon') {
    if (state.equippedId) placeInBag(state.equippedId)
    state.equippedId = newId
    state.weaponBonus = def.damageBonus ?? 0
  } else {
    if (state.equippedArmorId) placeInBag(state.equippedArmorId)
    state.equippedArmorId = newId
    state.armorDamageMult = 1 - (def.defense ?? 0)
  }
  playEquip()
  notify()
}

/** Click a bag slot: eat a consumable, equip a weapon/armor, or no-op a token. */
export function activateBagItem(i: number): void {
  const slot = state.bag[i]
  if (!slot?.itemId) return
  const def = ITEM_DEFS[slot.itemId]
  if (!def) return
  if (def.kind === 'consumable') consumeConsumableAt(i)
  else if (def.kind === 'weapon') equipFromBag(i, 'weapon')
  else if (def.kind === 'armor') equipFromBag(i, 'armor')
  // token: inert
}

/** Take the equipped weapon off and return it to the bag (no-op if bag full). */
export function unequipWeapon(): void {
  if (!state.equippedId) return
  if (!placeInBag(state.equippedId)) return
  state.equippedId = null
  state.weaponBonus = 0
  playEquip()
  notify()
}

/** Take the worn armor off and return it to the bag (no-op if bag full). */
export function unequipArmor(): void {
  if (!state.equippedArmorId) return
  if (!placeInBag(state.equippedArmorId)) return
  state.equippedArmorId = null
  state.armorDamageMult = 1
  playEquip()
  notify()
}

// ─── Open/close (modal freeze) ───────────────────────────────────

export function isInventoryOpen(): boolean {
  return state.open
}

export function setInventoryOpen(v: boolean): void {
  if (state.open === v) return
  state.open = v
  notify()
}

export function toggleInventory(): void {
  setInventoryOpen(!state.open)
}

export function resetInventory(): void {
  state.bag = emptyBag()
  state.weaponBonus = 0
  state.equippedId = null
  state.equippedArmorId = null
  state.armorDamageMult = 1
  state.open = false
  notify()
}
