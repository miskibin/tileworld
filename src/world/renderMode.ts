// Dev/preview "capture mode" — opt-in via a URL param: `?capture` (or `?lite`).
//
// Why this exists: the headless browser behind the preview/screenshot tooling
// has no GPU, so WebGL falls back to software rendering (SwiftShader). The full
// scene is fine to *simulate* (JS/eval responds instantly) but a single painted
// frame is dominated by the post-processing stack — N8AO + GodRays(60 samples)
// + Bloom(large kernel) + SMAA — which is multi-pass full-screen work that takes
// far longer than the screenshot tool's 30s capture window under SwiftShader.
// The result: `eval` works, `screenshot` times out.
//
// Capture mode removes that stack and caps the device-pixel-ratio to 1, which
// cuts the per-frame cost enough for a software-rendered frame (and therefore a
// screenshot) to complete. The scene still renders — it just loses the
// cinematic grade (AO/god-rays/bloom/AA), which is irrelevant for a structural
// screenshot. Append `?capture` to the preview URL before taking a screenshot.
export const CAPTURE_MODE =
  typeof window !== 'undefined' &&
  /[?&](capture|lite)(?:&|=|$)/.test(window.location.search)
