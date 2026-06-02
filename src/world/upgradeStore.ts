// Defines the click-driven upgrade tree. Each node, when purchased, spends gold
// and auto-applies its effect into the city / player / shop stores — no
// placement or targeting. Module-level pub/sub, mirroring the other stores.

import { spendGold, getGold, bumpMaxHp, bumpAttackDamage } from './playerStore'
import { isUnlimitedMoney } from './debugStore'
import { playMenuClick } from '../audio/sfx'
import {
  getCity,
  addHouse,
  setWallsBuilt,
  setGateBuilt,
  setTowersBuilt,
  setFarmBuilt,
  setKeepArchers,
  bumpVillagerArmor,
} from './cityStore'
import { reinforceCastle } from './castleStore'
import { setTowerMastery } from './towerStore'
import { unlockWeapon } from './weaponUnlockStore'
import { createVillager } from './villagerStore'
import { HOUSE_SLOTS, slotGroundY } from './cityPlan'

export type UpgradeBranch = 'economy' | 'defense' | 'hero' | 'arsenal'

export interface UpgradeNode {
  id: string
  branch: UpgradeBranch
  name: string
  desc: string
  icon: string
  cost: number
  /** must be purchased before this node unlocks */
  prereqId?: string
  /** spends gold + applies the effect; returns false if it couldn't be applied */
  apply: () => boolean
}

/** Spawn the next city house + its villager. Returns false if no slots remain. */
function buildNextHouse(): boolean {
  const city = getCity()
  if (city.housesBuilt >= HOUSE_SLOTS.length) return false
  const slot = HOUSE_SLOTS[city.housesBuilt]
  // City.tsx renders the house (and registers its blocker) off housesBuilt.
  addHouse()
  createVillager({
    x: slot.doorX,
    y: slotGroundY(slot.x, slot.z),
    z: slot.doorZ,
    facing: slot.rotation + Math.PI,
    homeX: slot.x,
    homeZ: slot.z,
    gardenX: slot.doorX,
    gardenZ: slot.doorZ,
    doorX: slot.doorX,
    doorZ: slot.doorZ,
    seed: 0.37 + city.housesBuilt * 1.31,
    paletteIndex: city.housesBuilt % 3,
  })
  return true
}

/** Build up to `n` houses (a district). Succeeds if at least one was built. */
function buildHouses(n: number): boolean {
  let built = 0
  for (let i = 0; i < n; i++) {
    if (!buildNextHouse()) break
    built++
  }
  return built > 0
}

export const UPGRADE_NODES: UpgradeNode[] = [
  // ---- Economy: grow the population ----
  {
    id: 'eco_district_1',
    branch: 'economy',
    name: "Settlers' District",
    desc: 'Raise two cottages and welcome two villagers.',
    icon: '🏠',
    cost: 20,
    apply() {
      if (getCity().housesBuilt >= HOUSE_SLOTS.length) return false
      if (!spendGold(this.cost)) return false
      return buildHouses(2)
    },
  },
  {
    id: 'eco_district_2',
    branch: 'economy',
    name: 'Market Row',
    desc: 'Two more cottages and villagers.',
    icon: '🏠',
    cost: 45,
    prereqId: 'eco_district_1',
    apply() {
      if (getCity().housesBuilt >= HOUSE_SLOTS.length) return false
      if (!spendGold(this.cost)) return false
      return buildHouses(2)
    },
  },
  {
    id: 'eco_district_3',
    branch: 'economy',
    name: 'Craftsmen Quarter',
    desc: 'Two more cottages and villagers.',
    icon: '🏡',
    cost: 80,
    prereqId: 'eco_district_2',
    apply() {
      if (getCity().housesBuilt >= HOUSE_SLOTS.length) return false
      if (!spendGold(this.cost)) return false
      return buildHouses(2)
    },
  },
  {
    id: 'eco_district_4',
    branch: 'economy',
    name: 'Thriving Town',
    desc: 'Two final cottages and villagers.',
    icon: '🏘️',
    cost: 120,
    prereqId: 'eco_district_3',
    apply() {
      if (getCity().housesBuilt >= HOUSE_SLOTS.length) return false
      if (!spendGold(this.cost)) return false
      return buildHouses(2)
    },
  },
  {
    id: 'eco_farm',
    branch: 'economy',
    name: 'Granary Farm',
    desc: 'Till a farm plot inside the walls.',
    icon: '🌾',
    cost: 35,
    apply() {
      if (getCity().farmBuilt) return false
      if (!spendGold(this.cost)) return false
      setFarmBuilt(true)
      return true
    },
  },

  // ---- Defense: fortify the city ----
  {
    id: 'def_walls',
    branch: 'defense',
    name: 'Palisade Walls',
    desc: 'Raise a wall around the city perimeter.',
    icon: '🧱',
    cost: 50,
    apply() {
      if (!spendGold(this.cost)) return false
      setWallsBuilt(true)
      return true
    },
  },
  {
    id: 'def_gate',
    branch: 'defense',
    name: 'Gatehouse',
    desc: 'Add fortified gates to all four walls.',
    icon: '🚪',
    cost: 35,
    prereqId: 'def_walls',
    apply() {
      if (!spendGold(this.cost)) return false
      setGateBuilt(true)
      return true
    },
  },
  {
    id: 'def_towers',
    branch: 'defense',
    name: 'Watchtowers',
    desc: 'Erect watchtowers at the four corners.',
    icon: '🗼',
    cost: 80,
    prereqId: 'def_walls',
    apply() {
      if (!spendGold(this.cost)) return false
      setTowersBuilt(true)
      return true
    },
  },
  {
    id: 'def_tower_mastery',
    branch: 'defense',
    name: 'Tower Mastery',
    desc: 'Watchtowers fire faster, farther, and hit harder.',
    icon: '🎯',
    cost: 120,
    prereqId: 'def_towers',
    apply() {
      if (!spendGold(this.cost)) return false
      setTowerMastery(true)
      return true
    },
  },
  {
    id: 'def_keep_archers',
    branch: 'defense',
    name: 'Keep Archers',
    desc: 'Station bowmen on the keep roof to rain arrows on attackers.',
    icon: '🏹',
    cost: 100,
    apply() {
      if (getCity().keepArchers) return false
      if (!spendGold(this.cost)) return false
      setKeepArchers(true)
      return true
    },
  },
  {
    id: 'def_reinforce',
    branch: 'defense',
    name: 'Reinforced Keep',
    desc: 'Greatly raise keep HP; it slowly self-repairs between waves.',
    icon: '🏰',
    cost: 130,
    apply() {
      if (!spendGold(this.cost)) return false
      reinforceCastle()
      return true
    },
  },
  {
    id: 'def_armor_1',
    branch: 'defense',
    name: 'Town Guard Armor',
    desc: 'Issue helmets to every villager.',
    icon: '🪖',
    cost: 40,
    apply() {
      if (!spendGold(this.cost)) return false
      bumpVillagerArmor()
      return true
    },
  },
  {
    id: 'def_armor_2',
    branch: 'defense',
    name: 'Plated Armor',
    desc: 'Upgrade every villager to plated armor.',
    icon: '🛡️',
    cost: 90,
    prereqId: 'def_armor_1',
    apply() {
      if (!spendGold(this.cost)) return false
      bumpVillagerArmor()
      return true
    },
  },

  // ---- Hero: the player knight ----
  {
    id: 'hero_hp_1',
    branch: 'hero',
    name: 'Vigor',
    desc: '+25 max HP.',
    icon: '❤️',
    cost: 30,
    apply() {
      if (!spendGold(this.cost)) return false
      bumpMaxHp(25)
      return true
    },
  },
  {
    id: 'hero_hp_2',
    branch: 'hero',
    name: 'Greater Vigor',
    desc: '+50 max HP.',
    icon: '💗',
    cost: 70,
    prereqId: 'hero_hp_1',
    apply() {
      if (!spendGold(this.cost)) return false
      bumpMaxHp(50)
      return true
    },
  },
  {
    id: 'hero_dmg_1',
    branch: 'hero',
    name: 'Sharpened Blade',
    desc: '+5 attack damage.',
    icon: '⚔️',
    cost: 30,
    apply() {
      if (!spendGold(this.cost)) return false
      bumpAttackDamage(5)
      return true
    },
  },
  {
    id: 'hero_dmg_2',
    branch: 'hero',
    name: 'Honed Edge',
    desc: '+10 attack damage.',
    icon: '🗡️',
    cost: 70,
    prereqId: 'hero_dmg_1',
    apply() {
      if (!spendGold(this.cost)) return false
      bumpAttackDamage(10)
      return true
    },
  },

  // ---- Arsenal: unlock shop weapons ----
  {
    id: 'ars_axe',
    branch: 'arsenal',
    name: 'Unlock Battle Axe',
    desc: 'Stock the Battle Axe in the shop.',
    icon: '🪓',
    cost: 50,
    apply() {
      if (!spendGold(this.cost)) return false
      unlockWeapon('axe')
      return true
    },
  },
  {
    id: 'ars_sword',
    branch: 'arsenal',
    name: 'Unlock Golden Blade',
    desc: 'Stock the Golden Blade in the shop.',
    icon: '🌟',
    cost: 90,
    prereqId: 'ars_axe',
    apply() {
      if (!spendGold(this.cost)) return false
      unlockWeapon('sword_gold')
      return true
    },
  },
]

const purchasedIds = new Set<string>()
const subs = new Set<(ids: ReadonlySet<string>) => void>()

export function getPurchased(): ReadonlySet<string> {
  return purchasedIds
}

export function isPurchased(id: string): boolean {
  return purchasedIds.has(id)
}

/** Whether a node is buyable now: not owned, prereq met, and affordable. */
export function canBuy(node: UpgradeNode): boolean {
  if (purchasedIds.has(node.id)) return false
  if (node.prereqId && !purchasedIds.has(node.prereqId)) return false
  return isUnlimitedMoney() || getGold() >= node.cost
}

/** Attempt to purchase a node. Returns true on success. */
export function purchase(node: UpgradeNode): boolean {
  if (!canBuy(node)) return false
  if (!node.apply()) return false
  purchasedIds.add(node.id)
  playMenuClick()
  notify()
  return true
}

function notify(): void {
  subs.forEach((fn) => fn(purchasedIds))
}

export function subscribeUpgrades(fn: (ids: ReadonlySet<string>) => void): () => void {
  subs.add(fn)
  fn(purchasedIds)
  return () => {
    subs.delete(fn)
  }
}

export function resetUpgrades(): void {
  purchasedIds.clear()
  notify()
}
