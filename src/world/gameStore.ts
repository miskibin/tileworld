// Tracks whether the player has dismissed the start screen and begun playing.
// The world is paused (via pauseStore) until the game starts.
let started = false
const subs = new Set<(v: boolean) => void>()

export function isStarted(): boolean {
  return started
}

export function startGame(): void {
  if (started) return
  started = true
  subs.forEach((fn) => fn(started))
}

export function subscribeStarted(fn: (v: boolean) => void): () => void {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}
