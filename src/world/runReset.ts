// resetRun() — the single "wipe the run clean" entry point. Iterates the store
// registry and fires every per-run reset so "Play Again" / "Return to Menu" can
// restart IN MEMORY (no location.reload()). Pair it with bumpRun() (runStore) to
// remount <World>.
//
// What it does NOT touch: settings that should survive a restart — difficulty,
// quality, audio. Those are registered without a `reset` (difficulty) or not at
// all (quality, audio), so iterating the registry leaves them alone.
//
// Order: this only resets module-level state; the actual entity teardown/re-seed
// happens when bumpRun() remounts the scene. Callers do: resetRun() → set phase
// → bumpRun().

import { STORE_REGISTRY } from './storeRegistry'

/**
 * Reset all per-run simulation state to its starting values and close any open
 * modal/freeze so the world boots live after the remount. Idempotent — safe to
 * call from an already-clean state. To add a per-run store, add a descriptor with
 * a `reset` to storeRegistry.ts; nothing here changes.
 */
export function resetRun(): void {
  for (const store of STORE_REGISTRY) store.reset?.()
}
