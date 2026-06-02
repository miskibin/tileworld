// Dev "capture mode" — opt-in via a URL param: `?capture` (or `?lite`).
//
// A lighter render path for headless screenshots: it drops the whole
// post-processing stack (N8AO + GodRays + Bloom + SMAA), turns off shadows, and
// pins the device-pixel-ratio to 1 (see App.tsx + World.tsx). Under software
// WebGL (no GPU) that cuts a frame from ~16s to a few seconds, so `npm run shot`
// (scripts/screenshot.mjs) captures quickly. The scene still renders — it just
// loses the cinematic grade, which is irrelevant for a structural screenshot.
//
// NB: this does NOT fix the built-in preview/MCP `screenshot` tool — that one
// hangs regardless (verified: it still times out with post-processing off, the
// R3F loop stopped, AND all requestAnimationFrame neutered), because its
// headless Chrome cannot composite a WebGL surface for Page.captureScreenshot at
// all. Use `npm run shot`, which launches its own chromium with a working
// SwiftShader backend.
export const CAPTURE_MODE =
  typeof window !== 'undefined' &&
  /[?&](capture|lite)(?:&|=|$)/.test(window.location.search)

// Opt-in perf overlay: `?perf` shows the r3f-perf HUD + the PerfTrace console
// logger in ANY build (dev always shows them; this also turns them on in a
// production `npm run preview` so dev-vs-prod can be measured). Players never see
// them — they only appear in dev or when the URL explicitly asks.
export const PERF_MODE =
  typeof window !== 'undefined' && /[?&]perf(?:&|=|$)/.test(window.location.search)
