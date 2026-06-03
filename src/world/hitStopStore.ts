// Hit-stop: a global simulation time-scale, separate from the binary freeze in
// pauseStore. On a connect we briefly drop deltaTime toward 0 for movement /
// animation / particle stepping while the renderer keeps drawing — the brain
// reads that micro-pause as the *weight* of the blow. A kill freezes longer than
// a plain hit so a takedown feels different.
//
// Per-frame channel only (no notify, no React): combat code calls triggerHitStop()
// and every entity useFrame multiplies its dt by getTimeScale(). Tracked on
// performance.now() so the pause lasts a fixed wall-clock span regardless of how
// many frames render during it.

let stopUntil = 0

/** Freeze the sim (dt→0) for `durationSec` of real time. Overlapping calls extend. */
export function triggerHitStop(durationSec: number): void {
  const now = performance.now() * 0.001
  stopUntil = Math.max(stopUntil, now + durationSec)
}

/** Simulation time multiplier: 0 while a hit-stop is active, else 1. */
export function getTimeScale(): number {
  return performance.now() * 0.001 < stopUntil ? 0 : 1
}

/** Clear any active hit-stop (used on reset / scene teardown). */
export function resetHitStop(): void {
  stopUntil = 0
}
