let paused = false
const subs = new Set<(v: boolean) => void>()

export function isPaused(): boolean {
  return paused
}

export function setPaused(v: boolean): void {
  if (paused === v) return
  paused = v
  subs.forEach((fn) => fn(v))
}

export function togglePaused(): void {
  setPaused(!paused)
}

export function subscribePaused(fn: (v: boolean) => void): () => void {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}
