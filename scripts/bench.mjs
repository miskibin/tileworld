// Headless benchmark: boots the game, dismisses StartScreen, samples
// renderer.info (draw calls / triangles / geometries / programs) and FPS over
// a few seconds. Proxies the drei <Text> font CDN through Node (the sandbox
// blocks it, which otherwise Suspends the Canvas). Prints a JSON summary.
import { chromium } from 'playwright'

const URL = 'http://localhost:5173/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'],
})
const ctx = await browser.newContext({ viewport: { width: 1024, height: 576 }, deviceScaleFactor: 1 })
await ctx.route('**://cdn.jsdelivr.net/**', async (route) => {
  try {
    const r = await fetch(route.request().url())
    const body = Buffer.from(await r.arrayBuffer())
    await route.fulfill({ status: r.status, headers: { 'access-control-allow-origin': '*' }, body })
  } catch { await route.abort() }
})
const page = await ctx.newPage()
page.on('pageerror', () => {})
page.setDefaultTimeout(120000)

await page.goto(URL, { waitUntil: 'domcontentloaded' })

let started = false
for (let i = 0; i < 25 && !started; i++) {
  await page.evaluate(() => document.querySelector('button.start-play')?.click())
  await sleep(700)
  started = (await page.locator('.start-screen').count()) === 0
}
if (!started) { console.log(JSON.stringify({ error: 'StartScreen never dismissed' })); await browser.close(); process.exit(1) }

// Let the scene fully populate (HDRI, shadows, mobs spawn, first frames).
await sleep(8000)

// Sample renderer.info over N reads. __r3f.gl is the WebGLRenderer.
// info.render.calls resets each frame, so read it live; geometries/programs
// are cumulative resource counts.
const samples = []
for (let i = 0; i < 12; i++) {
  const s = await page.evaluate(() => {
    const r3f = window.__r3f
    if (!r3f || !r3f.gl) return null
    const info = r3f.gl.info
    return {
      calls: info.render.calls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      programs: info.programs ? info.programs.length : -1,
    }
  })
  if (s) samples.push(s)
  await sleep(400)
}

// FPS over ~3s using rAF deltas inside the page.
const fps = await page.evaluate(() => new Promise((resolve) => {
  let frames = 0
  const t0 = performance.now()
  function tick() {
    frames++
    if (performance.now() - t0 < 3000) requestAnimationFrame(tick)
    else resolve(Math.round((frames / (performance.now() - t0)) * 1000))
  }
  requestAnimationFrame(tick)
}))

const med = (arr) => { const a = [...arr].sort((x, y) => x - y); return a[Math.floor(a.length / 2)] }
const summary = {
  drawCalls: med(samples.map((s) => s.calls)),
  drawCallsRange: [Math.min(...samples.map((s) => s.calls)), Math.max(...samples.map((s) => s.calls))],
  triangles: med(samples.map((s) => s.triangles)),
  geometries: med(samples.map((s) => s.geometries)),
  textures: med(samples.map((s) => s.textures)),
  programs: med(samples.map((s) => s.programs)),
  fps,
  nSamples: samples.length,
}
console.log(JSON.stringify(summary, null, 2))
await browser.close()
