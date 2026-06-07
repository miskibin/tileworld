// Run identity. `runId` bumps every time a fresh run starts (Play Again) or we
// drop back to the menu (Return to Menu). App.tsx keys the whole <World> subtree
// on it, so a bump remounts the scene — re-running every component's mount-time
// seeding (initial villagers/heirs, castle, ore nodes, props) against the
// freshly-reset stores. This is what lets restart happen IN MEMORY instead of a
// full page reload. Module-level external store, same shape as the rest.

let runId = 0
const subs = new Set<(id: number) => void>()

export function getRunId(): number {
  return runId
}

/** Start a new world generation — remounts <World> via its React key. Call
 *  AFTER resetRun() so the remounted components read clean stores. */
export function bumpRun(): void {
  runId += 1
  subs.forEach((fn) => fn(runId))
}

export function subscribeRun(fn: (id: number) => void): () => void {
  subs.add(fn)
  fn(runId)
  return () => {
    subs.delete(fn)
  }
}

// "Resume from the last dawn after a defeat" hands off across a remount. The defeat
// screen sets this, then does resetRun() + bumpRun() to remount a clean, freshly
// seeded <World> (procedural content — ore/herbs/animals — only re-seeds on mount,
// so an in-place restore would leave a barren map). RunLoad inside the new <World>
// consumes the flag and restores the checkpoint AFTER the fresh tree has mounted —
// the same clean-world precondition loadGame() needs from the menu.
let pendingContinue = false

/** Mark that the next remount should resume the saved checkpoint instead of a
 *  fresh run. Set right before resetRun() + bumpRun() on the defeat screen. */
export function requestContinue(): void {
  pendingContinue = true
}

/** Read-and-clear the pending-continue flag (RunLoad calls this on mount). */
export function consumeContinue(): boolean {
  const v = pendingContinue
  pendingContinue = false
  return v
}
