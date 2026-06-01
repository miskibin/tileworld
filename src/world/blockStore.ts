// Shield-block state — a hand-rolled external store (same shape as the others).
// Hold right-mouse to raise the shield: frontal hits are largely negated but a
// stamina bar drains while held and on each blocked hit; empty → the shield is
// forced down and locked until stamina recovers. This stops the player from
// turtling permanently.
//
// All timing lives in ONE owner: Character.tsx's useFrame advances stamina with
// its dt. damagePlayer() only ever *subtracts* a chunk on a blocked hit (no
// timestamps), so the two time bases (performance.now vs the r3f clock) never
// mix here. The HUD polls getBlockState() via rAF (no per-frame React churn).

export const BLOCK_STAMINA_MAX = 1
export const BLOCK_DRAIN_HOLD = 0.3 // per second while the shield is up (~3.3s)
export const BLOCK_DRAIN_PER_HIT = 0.18 // extra drain each time a hit is blocked
export const BLOCK_REGEN = 0.34 // per second once recovering
export const BLOCK_REGEN_DELAY = 0.6 // seconds of no block activity before regen
export const BLOCK_RECOVER_THRESHOLD = 0.25 // must refill to here to unlock
export const BLOCK_REDUCTION = 0.85 // fraction of frontal damage negated
export const BLOCK_CONE_DOT = 0.3 // cos(~72°) — front arc the shield covers

export interface BlockState {
  /** right-mouse held (set by HotbarInput) */
  wantBlock: boolean
  /** actually blocking this frame (resolved by Character) */
  blocking: boolean
  /** 0..1 */
  stamina: number
  /** true once stamina hit 0; blocks disabled until it recovers */
  locked: boolean
  /** seconds remaining before stamina may regen again */
  regenPause: number
}

const state: BlockState = {
  wantBlock: false,
  blocking: false,
  stamina: BLOCK_STAMINA_MAX,
  locked: false,
  regenPause: 0,
}

/** Live, mutable state — read/written every frame in useFrame. */
export function getBlockState(): BlockState {
  return state
}

/** Right-mouse down/up → request (or release) the shield. */
export function setWantBlock(want: boolean): void {
  state.wantBlock = want
}

/**
 * Called from damagePlayer() when a frontal hit is blocked: drain a chunk of
 * stamina, pause regen, and lock the shield if it empties. Returns nothing —
 * Character resolves the lock→unlock transition on the next frame.
 */
export function absorbBlockedHit(): void {
  state.stamina = Math.max(0, state.stamina - BLOCK_DRAIN_PER_HIT)
  state.regenPause = BLOCK_REGEN_DELAY
  if (state.stamina <= 0) {
    state.locked = true
    state.blocking = false
  }
}

export function resetBlock(): void {
  state.wantBlock = false
  state.blocking = false
  state.stamina = BLOCK_STAMINA_MAX
  state.locked = false
  state.regenPause = 0
}
