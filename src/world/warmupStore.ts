// True while ShaderWarmup is doing its at-load full-map render passes. During
// this window: the distance culls keep EVERYTHING visible (isCulled returns
// false, Cullable treats every structure as near) and MouseLookCamera yields the
// camera to the warm-up. That lets the REAL render loop — including the post
// EffectComposer in High and the direct path in Low — render the whole map and
// compile every shader program gameplay will ever use, instead of compiling
// approximations that get re-compiled the first time you travel into an area.
//
// The LoadingScreen subscribes here so it can cover the screen while warming —
// the warm-up sweeps the camera top-down over the island, which otherwise reads
// as a jarring perspective jump behind the menu before the vista settles.
let warming = false
const subs = new Set<(v: boolean) => void>()

export const isWarming = (): boolean => warming

export const setWarming = (v: boolean): void => {
  if (warming === v) return
  warming = v
  subs.forEach((fn) => fn(warming))
}

export function subscribeWarming(fn: (v: boolean) => void): () => void {
  subs.add(fn)
  fn(warming)
  return () => {
    subs.delete(fn)
  }
}
