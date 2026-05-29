// Tracks what has been built/upgraded in the central city. Module-level pub/sub
// store mirroring debugStore.ts. Upgrade nodes mutate this; City.tsx and
// Villager.tsx subscribe to render the results.

export interface CityState {
  /** number of houses (and their villagers) built, fills HOUSE_SLOTS in order */
  housesBuilt: number
  wallsBuilt: boolean
  gateBuilt: boolean
  towersBuilt: boolean
  farmBuilt: boolean
  /** global villager armour tier (0 = none); applies to all villagers */
  villagerArmorTier: number
}

const state: CityState = {
  housesBuilt: 0,
  wallsBuilt: false,
  gateBuilt: false,
  towersBuilt: false,
  farmBuilt: false,
  villagerArmorTier: 0,
}

const subs = new Set<(s: CityState) => void>()

export function getCity(): CityState {
  return state
}

function notify(): void {
  subs.forEach((fn) => fn(state))
}

export function subscribeCity(fn: (s: CityState) => void): () => void {
  subs.add(fn)
  fn(state)
  return () => {
    subs.delete(fn)
  }
}

export function addHouse(): void {
  state.housesBuilt += 1
  notify()
}

export function setWallsBuilt(v: boolean): void {
  state.wallsBuilt = v
  notify()
}

export function setGateBuilt(v: boolean): void {
  state.gateBuilt = v
  notify()
}

export function setTowersBuilt(v: boolean): void {
  state.towersBuilt = v
  notify()
}

export function setFarmBuilt(v: boolean): void {
  state.farmBuilt = v
  notify()
}

export function bumpVillagerArmor(): void {
  state.villagerArmorTier += 1
  notify()
}

export function resetCity(): void {
  state.housesBuilt = 0
  state.wallsBuilt = false
  state.gateBuilt = false
  state.towersBuilt = false
  state.farmBuilt = false
  state.villagerArmorTier = 0
  notify()
}
