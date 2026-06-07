// Tracks which shop weapons the Arsenal upgrade branch has unlocked. The shop
// reads this at open-time (getUnlockedWeapons) to extend its item list — there are
// no live subscribers, so this is plain module-level state, no pub/sub.

const unlocked = new Set<string>()

export function getUnlockedWeapons(): string[] {
  return [...unlocked]
}

export function isWeaponUnlocked(id: string): boolean {
  return unlocked.has(id)
}

export function unlockWeapon(id: string): void {
  unlocked.add(id)
}

export function resetUnlocks(): void {
  unlocked.clear()
}

export function serializeUnlocks(): string[] {
  return [...unlocked]
}

export function hydrateUnlocks(ids: string[]): void {
  unlocked.clear()
  for (const id of ids) unlocked.add(id)
}
