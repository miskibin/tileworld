// Tracks whether the player is standing within interaction range of any
// world building (shop, town hall, …). Those buildings own the `E` key while
// you're next to them; the hotbar's "E = use/equip item" must stand down so a
// single E press doesn't both open the shop AND consume a potion.
//
// Each interactable reports its own range with a stable key; the set's size is
// the cheap "is any building in reach?" answer the hotbar reads at keypress
// time. No subscription channel — this is a per-keypress poll, not UI state.

const inRange = new Set<string>()

/** Report whether interactable `key` currently has the player in range. */
export function setInteractRange(key: string, near: boolean): void {
  if (near) inRange.add(key)
  else inRange.delete(key)
}

/** True if the player is within range of any building that claims `E`. */
export function isInteractInRange(): boolean {
  return inRange.size > 0
}
