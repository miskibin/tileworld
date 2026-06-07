// Defines the click-driven upgrade tree. Each node, when purchased, spends gold
// and auto-applies its effect into the city / player / shop stores — no
// placement or targeting. Module-level pub/sub, mirroring the other stores.

import {
  spendGold,
  getGold,
  getPlayer,
  bumpMaxHp,
  bumpAttackDamage,
  setCritChance,
  setLifesteal,
  setMoveSpeedMult,
  setCleave,
  setBountyMult,
} from './playerStore'
import { isUnlimitedMoney } from './debugStore'
import { getStone, spendStone } from './resourceStore'
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
  setBallistaBuilt,
  setShrineBuilt,
  setTaxOffice,
} from './cityStore'
import { getShopDiscount, setShopDiscount, resetShopDiscount } from './shopStore'
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
  /** stone (resourceStore) required alongside gold — mined in the rock highlands.
   *  Defense structures need it; other branches leave it unset (gold only). */
  stoneCost?: number
  /** must be purchased before this node unlocks */
  prereqId?: string
  /** spends gold + applies the effect; returns false if it couldn't be applied */
  apply: () => boolean
}

/** Spend a node's full cost (gold + any stone) atomically. Checks both up front
 *  so a node never deducts gold then fails on stone. Unlimited-money debug grants
 *  stone too. Defense nodes call this in place of a bare spendGold. */
function payCosts(node: UpgradeNode): boolean {
  const stone = node.stoneCost ?? 0
  if (stone > 0 && !isUnlimitedMoney() && getStone() < stone) return false
  if (!spendGold(node.cost)) return false
  if (stone > 0 && !isUnlimitedMoney()) spendStone(stone)
  return true
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
    desc: 'A cottage and townsfolk: a town guard who fights orks, and one more life for your bloodline.',
    icon: '🏠',
    cost: 20,
    apply() {
      if (getCity().housesBuilt >= HOUSE_SLOTS.length) return false
      if (!spendGold(this.cost)) return false
      return buildHouses(1)
    },
  },
  {
    id: 'eco_district_2',
    branch: 'economy',
    name: 'Market Row',
    desc: 'Another townsfolk: another guard at the walls, and another life in reserve.',
    icon: '🏠',
    cost: 45,
    prereqId: 'eco_district_1',
    apply() {
      if (getCity().housesBuilt >= HOUSE_SLOTS.length) return false
      if (!spendGold(this.cost)) return false
      return buildHouses(1)
    },
  },
  {
    id: 'eco_district_3',
    branch: 'economy',
    name: 'Craftsmen Quarter',
    desc: 'Another townsfolk guard and life — your line endures one ork longer.',
    icon: '🏡',
    cost: 80,
    prereqId: 'eco_district_2',
    apply() {
      if (getCity().housesBuilt >= HOUSE_SLOTS.length) return false
      if (!spendGold(this.cost)) return false
      return buildHouses(1)
    },
  },
  {
    id: 'eco_district_4',
    branch: 'economy',
    name: 'Thriving Town',
    desc: 'The last cottage: a final guard, and a final life for the bloodline.',
    icon: '🏘️',
    cost: 120,
    prereqId: 'eco_district_3',
    apply() {
      if (getCity().housesBuilt >= HOUSE_SLOTS.length) return false
      if (!spendGold(this.cost)) return false
      return buildHouses(1)
    },
  },
  {
    id: 'eco_farm',
    branch: 'economy',
    name: 'Granary Farm',
    desc: 'Villagers work the fields: +3 bread to your bag after every wave you survive.',
    icon: '🌾',
    cost: 35,
    apply() {
      if (getCity().farmBuilt) return false
      if (!spendGold(this.cost)) return false
      setFarmBuilt(true)
      return true
    },
  },
  {
    id: 'eco_bounty',
    branch: 'economy',
    name: 'Bounty',
    desc: '+50% gold from every ork you slay — reach the costly upgrades sooner.',
    icon: '💰',
    cost: 60,
    apply() {
      if (getPlayer().bountyMult > 1) return false
      if (!spendGold(this.cost)) return false
      setBountyMult(1.5)
      return true
    },
  },
  {
    id: 'eco_tax_office',
    branch: 'economy',
    name: 'Tax Office',
    desc: 'Collect 25 gold every time you clear a night wave — steady income to rebuild.',
    icon: '🏛️',
    cost: 75,
    apply() {
      if (getCity().taxOffice) return false
      if (!spendGold(this.cost)) return false
      setTaxOffice(true)
      return true
    },
  },
  {
    id: 'eco_merchant_guild',
    branch: 'economy',
    name: 'Merchant Guild',
    desc: '−20% on everything the wandering merchant sells.',
    icon: '⚖️',
    cost: 70,
    apply() {
      if (getShopDiscount() < 1) return false
      if (!spendGold(this.cost)) return false
      setShopDiscount(0.8)
      return true
    },
  },

  // ---- Defense: fortify the city ----
  {
    id: 'def_walls',
    branch: 'defense',
    name: 'Palisade Walls',
    desc: 'Ring the town in timber walls — orks must funnel to the gates instead of swarming in.',
    icon: '🧱',
    cost: 50,
    stoneCost: 20,
    apply() {
      if (!payCosts(this)) return false
      setWallsBuilt(true)
      return true
    },
  },
  {
    id: 'def_gate',
    branch: 'defense',
    name: 'Gatehouse',
    desc: 'Fortified gates on all four walls: your folk pass freely while orks pile up outside.',
    icon: '🚪',
    cost: 35,
    stoneCost: 10,
    prereqId: 'def_walls',
    apply() {
      if (!payCosts(this)) return false
      setGateBuilt(true)
      return true
    },
  },
  {
    id: 'def_towers',
    branch: 'defense',
    name: 'Watchtowers',
    desc: 'Four corner towers that auto-fire arrows at any ork in range.',
    icon: '🗼',
    cost: 80,
    stoneCost: 25,
    prereqId: 'def_walls',
    apply() {
      if (!payCosts(this)) return false
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
    desc: 'Bowmen on the keep roof rain arrows down on the courtyard all night.',
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
    desc: 'Greatly raises keep HP, and the keep slowly self-repairs between waves.',
    icon: '🏰',
    cost: 130,
    stoneCost: 30,
    apply() {
      if (!payCosts(this)) return false
      reinforceCastle()
      return true
    },
  },
  {
    id: 'def_armor_1',
    branch: 'defense',
    name: 'Town Guard Arms',
    desc: 'Arm the townsfolk: guards hit far harder (16 dmg) and chase orks from farther.',
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
    name: 'Veteran Guard',
    desc: 'Steel arms and drilling: guards hit harder still (23 dmg) and hold a wider watch.',
    icon: '🛡️',
    cost: 90,
    prereqId: 'def_armor_1',
    apply() {
      if (!spendGold(this.cost)) return false
      bumpVillagerArmor()
      return true
    },
  },
  {
    id: 'def_ballista',
    branch: 'defense',
    name: 'Ballista',
    desc: 'A heavy bolt-thrower at the north gate: long range, big single hits.',
    icon: '🎱',
    cost: 110,
    apply() {
      if (getCity().ballistaBuilt) return false
      if (!spendGold(this.cost)) return false
      setBallistaBuilt(true)
      return true
    },
  },
  {
    id: 'def_shrine',
    branch: 'defense',
    name: 'Healing Shrine',
    desc: 'A shrine that steadily heals the hero while you stay inside the walls.',
    icon: '⛲',
    cost: 95,
    apply() {
      if (getCity().shrineBuilt) return false
      if (!spendGold(this.cost)) return false
      setShrineBuilt(true)
      return true
    },
  },

  // ---- Hero: the player knight ----
  {
    id: 'hero_hp_1',
    branch: 'hero',
    name: 'Vigor',
    desc: '+18 max HP.',
    icon: '❤️',
    cost: 30,
    apply() {
      if (!spendGold(this.cost)) return false
      bumpMaxHp(18)
      return true
    },
  },
  {
    id: 'hero_hp_2',
    branch: 'hero',
    name: 'Greater Vigor',
    desc: '+35 max HP.',
    icon: '💗',
    cost: 70,
    prereqId: 'hero_hp_1',
    apply() {
      if (!spendGold(this.cost)) return false
      bumpMaxHp(35)
      return true
    },
  },
  {
    id: 'hero_dmg_1',
    branch: 'hero',
    name: 'Sharpened Blade',
    desc: '+4 attack damage.',
    icon: '⚔️',
    cost: 30,
    apply() {
      if (!spendGold(this.cost)) return false
      bumpAttackDamage(4)
      return true
    },
  },
  {
    id: 'hero_dmg_2',
    branch: 'hero',
    name: 'Honed Edge',
    desc: '+7 attack damage.',
    icon: '🗡️',
    cost: 70,
    prereqId: 'hero_dmg_1',
    apply() {
      if (!spendGold(this.cost)) return false
      bumpAttackDamage(7)
      return true
    },
  },
  {
    id: 'hero_crit',
    branch: 'hero',
    name: 'Crit Strike',
    desc: '14% chance for a swing to deal double damage.',
    icon: '💥',
    cost: 80,
    prereqId: 'hero_dmg_1',
    apply() {
      if (getPlayer().critChance > 0) return false
      if (!spendGold(this.cost)) return false
      setCritChance(0.14)
      return true
    },
  },
  {
    id: 'hero_lifesteal',
    branch: 'hero',
    name: 'Lifesteal',
    desc: 'Heal 7 HP every time you slay an ork.',
    icon: '🩸',
    cost: 90,
    prereqId: 'hero_hp_1',
    apply() {
      if (getPlayer().lifesteal > 0) return false
      if (!spendGold(this.cost)) return false
      setLifesteal(7)
      return true
    },
  },
  {
    id: 'hero_swift',
    branch: 'hero',
    name: 'Swift Boots',
    desc: 'Move 13% faster.',
    icon: '👢',
    cost: 60,
    apply() {
      if (getPlayer().moveSpeedMult > 1) return false
      if (!spendGold(this.cost)) return false
      setMoveSpeedMult(1.13)
      return true
    },
  },
  {
    id: 'hero_cleave',
    branch: 'hero',
    name: 'Cleave',
    desc: 'Strikes splash 21% damage to orks beside your target.',
    icon: '🌀',
    cost: 110,
    prereqId: 'hero_dmg_2',
    apply() {
      if (getPlayer().cleave > 0) return false
      if (!spendGold(this.cost)) return false
      setCleave(0.21)
      return true
    },
  },

  // ---- Arsenal: unlock shop weapons ----
  {
    id: 'ars_axe',
    branch: 'arsenal',
    name: 'Unlock Battle Axe',
    desc: 'Stocks the Battle Axe (+15 attack) at the wandering merchant.',
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
    desc: 'Stocks the Golden Blade (+21 attack) at the wandering merchant.',
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

// Progression pacing: gold income is ~200/night, so the raw tree was buyable in
// ~4 nights. Scale every cost up (rounded to 5) once at module load — apply(),
// canBuy() and the HUD all read node.cost live, so this single pass rescales the
// whole tree consistently. Together with the per-night ork HP ramp (waveStore)
// the difficulty stays ahead of the player instead of being out-bought early.
const UPGRADE_COST_SCALE = 1.6
for (const n of UPGRADE_NODES) n.cost = Math.round((n.cost * UPGRADE_COST_SCALE) / 5) * 5

const purchasedIds = new Set<string>()
const subs = new Set<(ids: ReadonlySet<string>) => void>()

export function isPurchased(id: string): boolean {
  return purchasedIds.has(id)
}

/** Whether a node is buyable now: not owned, prereq met, and affordable. */
export function canBuy(node: UpgradeNode): boolean {
  if (purchasedIds.has(node.id)) return false
  if (node.prereqId && !purchasedIds.has(node.prereqId)) return false
  if (isUnlimitedMoney()) return true
  if ((node.stoneCost ?? 0) > 0 && getStone() < node.stoneCost!) return false
  return getGold() >= node.cost
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

/** Saveable: the set of purchased node ids. Their EFFECTS are saved separately in
 *  the stores they mutate (city/castle/player/…), so hydrate only restores the set
 *  for the tree UI's owned/affordable gating — it must NOT re-run apply(). */
export function serializeUpgrades(): string[] {
  return [...purchasedIds]
}

export function hydrateUpgrades(ids: string[]): void {
  purchasedIds.clear()
  for (const id of ids) purchasedIds.add(id)
  notify()
}

export function resetUpgrades(): void {
  purchasedIds.clear()
  // The Merchant Guild discount is a global module flag (not in player/city
  // state), so clearing purchase records here must also drop it back to full
  // price, or it would leak across runs.
  resetShopDiscount()
  notify()
}
