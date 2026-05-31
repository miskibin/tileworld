// Shared faction taxonomy + hostility rules for creatures. Pure module — no
// store imports — so any store/AI file can depend on it without cycles.
//
// Two independent food-chains were requested:
//   • Rival ork camps attack each other (red vs blue). Orks ignore wildlife.
//   • Predators hunt prey. Prey flee predators (and bears, and the player).
// The player is handled specially in each AI (not represented here).

/** Which warband an ork belongs to. Different factions are mutually hostile. */
export type OrkFaction = 'red' | 'blue'

/** Behaviour class for a wild animal. */
export type AnimalFaction = 'predator' | 'prey' | 'boar'

/** Two orks fight when they belong to opposing camps. */
export function orksHostile(a: OrkFaction, b: OrkFaction): boolean {
  return a !== b
}

/** A predator hunts prey (deer/rabbit). Predators don't hunt each other. */
export function preysOn(hunter: AnimalFaction, target: AnimalFaction): boolean {
  return hunter === 'predator' && target === 'prey'
}

/** Prey flee anything that would harm them: predators and (enraged) boars. */
export function threatensPrey(f: AnimalFaction): boolean {
  return f === 'predator' || f === 'boar'
}
