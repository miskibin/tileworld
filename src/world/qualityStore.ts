// Render quality tier. Three tiers gate the heaviest GPU work for a low→max ladder:
//   'low'    — no post-processing stack, no sun shadows (weakest / integrated GPUs)
//   'medium' — sun shadows + a LIGHT post stack: Bloom + colour grade + SMAA. Drops
//              the two priciest passes (GodRays + DepthOfField). Pretty but cheap.
//   'high'   — medium + GodRays + DepthOfField (the full cinematic stack). See PostFX
//              in World.tsx, which switches composer tree on `quality === 'high'`.
// dpr is pinned to 1 in all tiers (see App.tsx). Toggled with 'G' (cycles
// low→medium→high) and from the pause menu; persisted to localStorage. Module-level
// external store, same shape as the rest of src/world/*Store.ts.

export type Quality = 'low' | 'medium' | 'high'

const STORAGE_KEY = 'tileworld.quality'
const TIERS: Quality[] = ['low', 'medium', 'high']

function load(): Quality {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (v === 'low' || v === 'medium' || v === 'high') return v
    return 'high'
  } catch {
    return 'high'
  }
}

let quality: Quality = load()
const subs = new Set<(q: Quality) => void>()

// Set once the player picks a quality by hand (start screen / pause / 'G'). The
// perf governor (perfStore/PerfGovernor) reads this and stops SUGGESTING a lower
// tier once the player has engaged with the setting — it never changes quality
// itself, only prompts via a toast.
let manual = false

export function getQuality(): Quality {
  return quality
}

/** True once the player has chosen a quality themselves this session. */
export function isQualityManual(): boolean {
  return manual
}

export function setQuality(q: Quality): void {
  manual = true
  if (q === quality) return
  quality = q
  try {
    localStorage.setItem(STORAGE_KEY, q)
  } catch {
    /* private mode / no storage — runtime switch still works, just not persisted */
  }
  subs.forEach((fn) => fn(q))
}

/** Cycle low → medium → high → low. Bound to the 'G' key. */
export function cycleQuality(): void {
  const next = TIERS[(TIERS.indexOf(quality) + 1) % TIERS.length]
  setQuality(next)
}

export function subscribeQuality(fn: (q: Quality) => void): () => void {
  subs.add(fn)
  fn(quality)
  return () => {
    subs.delete(fn)
  }
}
