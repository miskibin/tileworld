import { makeForageStore, type ForageState } from './forageStore'

// Marsh herbs: foragable plants strewn through the swamp. Walk up to gather one
// — each yields a Marsh Herb item (heal + resist, see inventoryStore). The
// swamp's slow + poison hazard (see Character) is what makes foraging risky. A
// thin ForageStore instance; HerbPlants.tsx places + renders them. Shared
// forage logic lives in forageStore (and is tested there).

export type HerbState = ForageState

export const herbStore = makeForageStore()

export const createHerb = herbStore.create
export const resetHerbs = herbStore.reset
export const getHerbs = herbStore.all
export const getActiveHerbs = herbStore.active
export const collectHerb = herbStore.collect
