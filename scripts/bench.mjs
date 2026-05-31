// Headless benchmark: boots the game, dismisses StartScreen, then measures
// draw calls PER FRAME across a window of consecutive frames (so on-demand
// shadow refreshing is captured as an average, not just sampled), plus
// triangles/geometries. Proxies the drei <Text> font CDN through Node.
import { chromium } from 'playwright'
const URL = 'http://localhost:5173/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1024, height: 576 }, deviceScaleFactor: 1 })
await ctx.route('**://cdn.jsdelivr.net/**', async (route) => { try { const r = await fetch(route.request().url()); await route.fulfill({ status: r.status, headers: { 'access-control-allow-origin': '*' }, body: Buffer.from(await r.arrayBuffer()) }) } catch { await route.abort() } })
const page = await ctx.newPage(); page.on('pageerror', () => {}); page.setDefaultTimeout(120000)
await page.goto(URL, { waitUntil: 'domcontentloaded' })

let started = false
for (let i = 0; i < 25 && !started; i++) { await page.evaluate(() => document.querySelector('button.start-play')?.click()); await sleep(700); started = (await page.locator('.start-screen').count()) === 0 }
if (!started) { console.log(JSON.stringify({ error: 'StartScreen never dismissed' })); await browser.close(); process.exit(1) }
await sleep(8000)

// Hook into the renderer to record calls on EVERY frame for ~120 frames.
// info.render.calls resets per frame (autoReset on by default), so read it at
// the END of each frame via a rAF chained right after R3F's loop.
const perFrame = await page.evaluate(() => new Promise((resolve) => {
  const gl = window.__r3f.gl
  const calls = []
  let n = 0
  function tick() {
    calls.push(gl.info.render.calls)
    if (++n < 120) requestAnimationFrame(tick)
    else resolve(calls)
  }
  requestAnimationFrame(tick)
}))

const nums = perFrame.filter((c) => c > 0)
const sum = nums.reduce((a, b) => a + b, 0)
const sorted = [...nums].sort((a, b) => a - b)
const summary = {
  drawCalls_avgPerFrame: Math.round(sum / nums.length),
  drawCalls_min: sorted[0],
  drawCalls_max: sorted[sorted.length - 1],
  drawCalls_median: sorted[Math.floor(sorted.length / 2)],
  framesSampled: nums.length,
  ...(await page.evaluate(() => {
    const info = window.__r3f.gl.info
    return { triangles_lastFrame: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures, programs: info.programs?.length ?? -1 }
  })),
}
console.log(JSON.stringify(summary, null, 2))
await browser.close()
