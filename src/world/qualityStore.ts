// Render quality tier. Three tiers gate the heaviest GPU work for a low→max ladder:
//   'low'    — no post-processing stack, no sun shadows (weakest / integrated GPUs)
//   'medium' — full post stack (incl. god rays) + sun shadows; the prior 'high' look
//   'high'   — medium + heavy content extras (reflective water, dense grass, fuller
//              tree canopies) layered on by their own components (gated on === 'high')
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

export function getQuality(): Quality {
  return quality
}

export function setQuality(q: Quality): void {
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
