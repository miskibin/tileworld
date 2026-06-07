import { type Quality } from './qualityStore'

// Perf governor — the decision core. A sampler (PerfGovernor.tsx) feeds it a
// rolling median FPS during live gameplay; if the frame rate is sustained below
// target on a tier above the floor, we SUGGEST a lower tier via a toast. We never
// change quality for the player — only prompt them. Pure functions here so the
// policy is unit-tested; the side effect (the notice) lives in the component.

const TIER_ORDER: Quality[] = ['low', 'medium', 'high']

/** Default FPS floor — below this (median) we consider a downgrade. */
export const FPS_FLOOR = 45

/** The next tier down, or null if already at the lowest. */
export function lowerTier(q: Quality): Quality | null {
  const i = TIER_ORDER.indexOf(q)
  return i > 0 ? TIER_ORDER[i - 1] : null
}

/** Median of a sample array. Empty → Infinity (so it never triggers a downgrade). */
export function median(xs: number[]): number {
  if (xs.length === 0) return Infinity
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export interface DowngradeInput {
  medianFps: number
  current: Quality
  manual: boolean
  alreadySuggested: boolean
  threshold?: number
}

/**
 * Should we SUGGEST a lower tier, and which? Returns the tier to suggest or null.
 * Never fires when the player picked the quality by hand, when we've already
 * suggested this run, when the median FPS is at/above the floor, or when we're
 * already at the lowest tier. The caller only prompts — it does not apply this.
 */
export function decideDowngrade(input: DowngradeInput): Quality | null {
  const { medianFps, current, manual, alreadySuggested, threshold = FPS_FLOOR } = input
  if (manual || alreadySuggested) return null
  if (medianFps >= threshold) return null
  return lowerTier(current)
}

// --- once-per-run latch (the sampler reads/sets these; resetRun clears it) ---
let suggested = false

export function hasSuggestedDowngrade(): boolean {
  return suggested
}

export function markSuggested(): void {
  suggested = true
}

export function resetPerf(): void {
  suggested = false
}
