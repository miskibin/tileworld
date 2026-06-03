// True while ShaderWarmup is doing its at-load full-map render passes. During
// this window: the distance culls keep EVERYTHING visible (isCulled returns
// false, Cullable treats every structure as near) and MouseLookCamera yields the
// camera to the warm-up. That lets the REAL render loop — including the post
// EffectComposer in High and the direct path in Low — render the whole map and
// compile every shader program gameplay will ever use, instead of compiling
// approximations that get re-compiled the first time you travel into an area.
let warming = false
export const isWarming = (): boolean => warming
export const setWarming = (v: boolean): void => {
  warming = v
}
