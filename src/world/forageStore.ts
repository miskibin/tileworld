import { tileAt, tileTopY } from './tileMap'

// A foragable resource field — collectibles you gather just by walking up to
// them (the "forage" verb), as opposed to ore which you mine by hitting. Marsh
// herbs and forest apples are both instances of this ONE store, made by
// makeForageStore(); each module (herbStore / appleStore) holds its own live
// instance. Pure module-level state, matching the rest of the codebase: discrete
// changes, no per-frame channel — the view reads the field off React state and
// the live objects off the getters.

export interface ForageState {
  id: number
  x: number
  y: number
  z: number
  seed: number
  collected: boolean
  /** elapsed-seconds timestamp of the last collect; drives respawn. 0 when never
   *  collected. */
  collectedAt: number
}

export interface ForageStore {
  /** Register a plant at (x,z); y snaps to the tile top (1 over water/void). */
  create(x: number, z: number, seed: number): ForageState
  /** Clear the field + id counter (new game / unmount). */
  reset(): void
  /** Every plant, collected or not. */
  all(): ForageState[]
  /** Only the still-gatherable plants. */
  active(): ForageState[]
  /** Mark one foraged at time `now` (elapsed seconds); returns false if it was
   *  already taken. The stamp lets it respawn `respawn` seconds later. */
  collect(item: ForageState, now?: number): boolean
  /** Revive any collected plant whose respawn delay has elapsed by `now`
   *  (elapsed seconds). Returns true if at least one regrew. Cheap to call every
   *  frame from the field's useFrame. */
  tick(now: number): boolean
  /** The respawn delay this field was built with (seconds). */
  readonly respawn: number
}

/** Build an independent forage field. State is captured in the closure, so two
 *  instances (herbs, apples) never share plants. `respawn` is how long a gathered
 *  plant takes to regrow (seconds); the field's live count is the real per-trip
 *  cap, this just refills it for the next visit. */
export function makeForageStore(respawn = 90): ForageStore {
  const items: ForageState[] = []
  let nextId = 0
  return {
    respawn,
    create(x, z, seed) {
      const fx = Math.floor(x)
      const fz = Math.floor(z)
      const t = tileAt(fx, fz)
      const item: ForageState = {
        id: nextId++,
        x,
        y: t ? tileTopY(fx, fz) : 1,
        z,
        seed,
        collected: false,
        collectedAt: 0,
      }
      items.push(item)
      return item
    },
    reset() {
      items.length = 0
      nextId = 0
    },
    all() {
      return items
    },
    active() {
      return items.filter((i) => !i.collected)
    },
    collect(item, now = 0) {
      if (item.collected) return false
      item.collected = true
      item.collectedAt = now
      return true
    },
    tick(now) {
      let revived = false
      for (const i of items) {
        if (i.collected && now - i.collectedAt >= respawn) {
          i.collected = false
          revived = true
        }
      }
      return revived
    },
  }
}
