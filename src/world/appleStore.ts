import { makeForageStore } from './forageStore'

// Forest apples: foragable fruit dotted through the western wood. Like marsh
// herbs (and unlike ore, which you mine by hitting) you gather an apple just by
// walking up to it — the forest's easy "forage" reward to pair with the hunt. A
// thin ForageStore instance; AppleTrees.tsx places + renders them. Shared forage
// logic lives in forageStore (and is tested there).

export const appleStore = makeForageStore()

export const resetApples = appleStore.reset
