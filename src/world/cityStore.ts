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
  /** Keep Archers upgrade — auto-firing bowmen on the keep roof */
  keepArchers: boolean
  /** global villager armour tier (0 = none); applies to all villagers */
  villagerArmorTier: number
  /** Ballista — heavy single-target turret outside the north gate */
  ballistaBuilt: boolean
  /** Healing Shrine — regenerates player HP while inside the city */
  shrineBuilt: boolean
  /** Tax Office — pays a gold stipend each time a wave is cleared */
  taxOffice: boolean
}

const state: CityState = {
  housesBuilt: 0,
  wallsBuilt: false,
  gateBuilt: false,
  towersBuilt: false,
  farmBuilt: false,
  keepArchers: false,
  villagerArmorTier: 0,
  ballistaBuilt: false,
  shrineBuilt: false,
  taxOffice: false,
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

export function setKeepArchers(v: boolean): void {
  state.keepArchers = v
  notify()
}

export function bumpVillagerArmor(): void {
  state.villagerArmorTier += 1
  notify()
}

export function setBallistaBuilt(v: boolean): void {
  state.ballistaBuilt = v
  notify()
}

export function setShrineBuilt(v: boolean): void {
  state.shrineBuilt = v
  notify()
}

export function setTaxOffice(v: boolean): void {
  state.taxOffice = v
  notify()
}

export function serializeCity(): CityState {
  return { ...state }
}

export function hydrateCity(s: CityState): void {
  Object.assign(state, s)
  notify()
}

export function resetCity(): void {
  state.housesBuilt = 0
  state.wallsBuilt = false
  state.gateBuilt = false
  state.towersBuilt = false
  state.farmBuilt = false
  state.keepArchers = false
  state.villagerArmorTier = 0
  state.ballistaBuilt = false
  state.shrineBuilt = false
  state.taxOffice = false
  notify()
}
