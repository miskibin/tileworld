// Tracks which shop weapons the Arsenal upgrade branch has unlocked. The shop
// reads this at open-time to extend its item list. Module-level pub/sub.

const unlocked = new Set<string>()
const subs = new Set<(ids: string[]) => void>()

export function getUnlockedWeapons(): string[] {
  return [...unlocked]
}

export function isWeaponUnlocked(id: string): boolean {
  return unlocked.has(id)
}

export function unlockWeapon(id: string): void {
  if (unlocked.has(id)) return
  unlocked.add(id)
  notify()
}

function notify(): void {
  const ids = [...unlocked]
  subs.forEach((fn) => fn(ids))
}

export function subscribeUnlocks(fn: (ids: string[]) => void): () => void {
  subs.add(fn)
  fn([...unlocked])
  return () => {
    subs.delete(fn)
  }
}

export function resetUnlocks(): void {
  unlocked.clear()
  notify()
}

export function serializeUnlocks(): string[] {
  return [...unlocked]
}

export function hydrateUnlocks(ids: string[]): void {
  unlocked.clear()
  for (const id of ids) unlocked.add(id)
  notify()
}
