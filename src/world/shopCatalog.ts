// The goods a merchant sells, shared by the static castle Shop and the wandering
// village Traders so there's a single source of truth for what's for sale. Buying
// charges the Merchant-Guild-discounted price and drops the item into the hotbar.

import { spendGold } from './playerStore'
import { addItem } from './inventoryStore'
import { discountedPrice, type ShopItem } from './shopStore'
import { getUnlockedWeapons } from './weaponUnlockStore'
import { isUnlimitedMoney } from './debugStore'

// Buying adds the item to the player's hotbar (right-click to consume → heal).
// apply() fails if the player can't afford it or the bag is full.
function buy(price: number, itemId: string): boolean {
  // Charge the Merchant-Guild-discounted price (matches what ShopPanel shows).
  const charge = discountedPrice(price)
  if (!spendGold(charge)) return false
  if (!addItem(itemId)) {
    // Bag full — refund and reject so gold isn't lost. Skip the refund under
    // unlimited money, since spendGold didn't actually deduct (a negative spend
    // would otherwise credit free gold).
    if (!isUnlimitedMoney()) spendGold(-charge)
    return false
  }
  return true
}

const SHOP_ITEMS: ShopItem[] = [
  { id: 'bread', name: 'Bread', icon: '🍞', price: 4, apply: () => buy(4, 'bread') },
  { id: 'potion', name: 'Health Potion', icon: '🧪', price: 12, apply: () => buy(12, 'potion') },
  { id: 'feast', name: 'Tavern Feast', icon: '🍖', price: 28, apply: () => buy(28, 'feast') },
]

// Weapons that the Arsenal upgrade branch can unlock for sale. Added to the
// shop list at open-time only once their id is in weaponUnlockStore.
const WEAPON_CATALOG: Record<string, { name: string; icon: string; price: number }> = {
  axe: { name: 'Battle Axe', icon: '🪓', price: 45 },
  sword_gold: { name: 'Golden Blade', icon: '🗡️', price: 80 },
}

/** Base consumables plus any weapons the Arsenal branch has unlocked. */
export function buildShopItems(): ShopItem[] {
  const items = [...SHOP_ITEMS]
  for (const id of getUnlockedWeapons()) {
    const def = WEAPON_CATALOG[id]
    if (def) items.push({ id, name: def.name, icon: def.icon, price: def.price, apply: () => buy(def.price, id) })
  }
  return items
}
