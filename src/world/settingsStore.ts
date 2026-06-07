// Settings panel open/close. The panel itself (SettingsPanel.tsx) is shared by
// the StartScreen and the PauseMenu. Like the shop / upgrade tree / inventory,
// having it open freezes the world (ORed into pauseStore.isFrozen). Module-level
// external store, same shape as the rest.

let open = false
const subs = new Set<(v: boolean) => void>()

export function isSettingsOpen(): boolean {
  return open
}

export function setSettingsOpen(v: boolean): void {
  if (open === v) return
  open = v
  subs.forEach((fn) => fn(open))
}

export function openSettings(): void {
  setSettingsOpen(true)
}

export function closeSettings(): void {
  setSettingsOpen(false)
}

export function subscribeSettings(fn: (v: boolean) => void): () => void {
  subs.add(fn)
  fn(open)
  return () => {
    subs.delete(fn)
  }
}
