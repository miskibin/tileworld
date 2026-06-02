// Render quality tier. 'high' = the full cinematic look (post-processing stack +
// sun shadows). 'low' drops both — the two biggest GPU costs — for weak /
// integrated GPUs, roughly doubling fps. dpr is already pinned to 1 in both
// tiers (see App.tsx), so the tier only gates post + shadows.
//
// Toggled at runtime with the 'G' key ([QualityToggle] in World) and persisted to
// localStorage so it survives reloads. Module-level external store, same shape as
// the rest of src/world/*Store.ts (live getter + notify on discrete change).

export type Quality = 'high' | 'low'

const STORAGE_KEY = 'tileworld.quality'

function load(): Quality {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'low' ? 'low' : 'high'
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
    /* private mode / no storage — runtime toggle still works, just not persisted */
  }
  subs.forEach((fn) => fn(q))
}

export function toggleQuality(): void {
  setQuality(quality === 'high' ? 'low' : 'high')
}

export function subscribeQuality(fn: (q: Quality) => void): () => void {
  subs.add(fn)
  fn(quality)
  return () => {
    subs.delete(fn)
  }
}
