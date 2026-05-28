let showPaths = false
const subs = new Set<(v: boolean) => void>()

export function isShowPaths(): boolean {
  return showPaths
}

export function setShowPaths(v: boolean): void {
  if (showPaths === v) return
  showPaths = v
  subs.forEach((fn) => fn(v))
}

export function subscribeShowPaths(fn: (v: boolean) => void): () => void {
  subs.add(fn)
  return () => {
    subs.delete(fn)
  }
}
