// Reactive screen-grade juice: a transient "wince" charge the damage path adds
// to, polled once per frame by the ReactiveGrade driver in World.tsx (which folds
// it together with the player's HP ratio to drive the Vignette + HueSaturation
// passes that already run). No new render pass, no shader recompile — it only
// mutates plain uniform setters on effects we already pay for.
//
// Trauma-style decay (like fxStore's shake): events add a 0..1 charge that bleeds
// off continuously, so overlapping hits stack toward a cap instead of snapping.

// Live-tunable feel knobs, mutated by the leva panel (DebugBindings.tsx) and
// read each frame by the ReactiveGrade driver in World.tsx. Same live-holder
// pattern as audio's `audioMix`. Defaults are the shipping values.
export const gradeTunables = {
  baseDarkness: 0, // resting vignette darkness — 0 = no always-on static screen-edge frame (low-HP/hit still darken reactively)
  baseSaturation: 0.18, // resting hue/sat boost (richer; compensates AgX desaturation)
  lowThreshold: 0.35, // hp ratio below which dread ramps in
  lowDarken: 0.16, // extra vignette at 0 hp
  lowDesat: 0.25, // saturation pulled out at 0 hp
  heartbeat: 0.035, // low-hp edge throb amplitude
  winceDarken: 0.13, // vignette spike on a fresh hit
  winceDesat: 0.16, // saturation dip on a fresh hit
}

// Depth-of-field knobs. Live-holder pattern: mutated by leva (DebugBindings),
// applied each frame by DofDriver via a ref to the effect (no re-render/rebuild).
// The effect auto-focuses on the PLAYER, so there's no manual focus distance.
// focusRange = how many WORLD UNITS around the player stay sharp; bokehScale =
// blur strength (0 = off). NB: this postprocessing version's focus distance is in
// WORLD units (not normalised) — small fixed values just focused at the camera and
// blurred everything, which is why focusing on the player's world distance is the fix.
export const dofTunables = {
  focusRange: 70,
  bokehScale: 7,
}

let pulse = 0
let lastT = 0
const PULSE_DECAY = 3.2 // charge shed per second

/** Add a wince pulse (0..1). Called from the damage path; bigger hits add more. */
export function addGradePulse(amount: number): void {
  pulse = Math.min(1, pulse + amount)
}

/** Current wince level (0 when settled). Decays by real time elapsed. */
export function getGradePulse(now: number): number {
  if (lastT === 0) lastT = now
  const dt = Math.min(0.1, Math.max(0, now - lastT))
  lastT = now
  if (pulse > 0) pulse = Math.max(0, pulse - PULSE_DECAY * dt)
  return pulse
}

/** Clear any lingering pulse on a fresh run. */
export function resetGrade(): void {
  pulse = 0
}
