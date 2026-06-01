// Pooled ground loot — a small floating token the player walks over to collect.
// Pure per-frame channel like impactStore: kill code calls spawnPickup(), and
// Pickups.tsx steps + collects every frame. No notify (only the 3D scene reads
// it). A token that can't be collected (hotbar full) stays on the ground.

export interface Pickup {
  id: number
  itemId: string
  x: number
  y: number
  z: number
  born: number // sec, for the bob/spin phase
}

const pickups: Pickup[] = []
let nextId = 0
const MAX = 64

/** Drop a loot token at a world-grid point. */
export function spawnPickup(itemId: string, x: number, y: number, z: number): void {
  if (pickups.length >= MAX) pickups.shift()
  pickups.push({ id: nextId++, itemId, x, y, z, born: performance.now() * 0.001 })
}

export function getPickups(): Pickup[] {
  return pickups
}

/** Remove a collected token by id. */
export function removePickup(id: number): void {
  const i = pickups.findIndex((p) => p.id === id)
  if (i !== -1) pickups.splice(i, 1)
}

export function resetPickups(): void {
  pickups.length = 0
  nextId = 0
}
