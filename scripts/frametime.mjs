// Micro-lag probe: records per-frame dt + main-thread long-tasks (the actual
// hitches the user feels) against the PRODUCTION preview build, driven with real
// keyboard input. Production is what matters — dev has synchronous shader-error
// checks that stall and don't exist in the shipped app. Marks tag each phase so a
// spike can be attributed (warmup / idle / travel).
//   node scripts/frametime.mjs [port]
import { chromium } from 'playwright'

const port = process.argv[2] || '4174'
const browser = await chromium.launch({
  headless: false,
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--no-sandbox'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  const renderer = await page.evaluate(() => {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info')
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'
  })
  console.log('GPU:', renderer)

  // Instrument before anything renders.
  await page.evaluate(() => {
    const w = window
    w.__ft = { dts: [], spikes: [], longtasks: [], curMark: 'load' }
    w.__mark = (m) => { w.__ft.curMark = m }
    let last = performance.now()
    const loop = () => {
      const now = performance.now()
      const dt = now - last
      last = now
      w.__ft.dts.push(dt)
      if (dt > 33) w.__ft.spikes.push({ t: Math.round(now), dt: Math.round(dt), mark: w.__ft.curMark })
      requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
    try {
      new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          w.__ft.longtasks.push({ t: Math.round(e.startTime), dur: Math.round(e.duration), mark: w.__ft.curMark })
        }
      }).observe({ entryTypes: ['longtask'] })
    } catch {}
  })

  const phase = async (mark, ms, keys = []) => {
    await page.evaluate((m) => window.__mark(m), mark)
    for (const k of keys) await page.keyboard.down(k)
    await page.waitForTimeout(ms)
    for (const k of keys) await page.keyboard.up(k)
  }

  // Let ShaderWarmup run its course BEHIND the StartScreen first (a real player
  // doesn't click Play in the same millisecond the page loads). Compile stalls
  // here are acceptable — they're hidden behind the menu.
  await phase('startscreen-warmup', 8000)
  // Now Play.
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find((e) => /^\s*▶?\s*Play\s*▶?\s*$/i.test(e.textContent || '') && e.children.length <= 1)
    el && el.click()
  })
  await phase('post-play', 3000)
  await phase('idle', 6000)
  // Sprint across the map (camera-relative forward) — crosses biomes/structures.
  await phase('travel-fwd', 9000, ['ShiftLeft', 'KeyW'])
  await phase('travel-turn', 7000, ['ShiftLeft', 'KeyD'])
  await phase('travel-back', 8000, ['ShiftLeft', 'KeyS'])
  await phase('idle2', 4000)

  const r = await page.evaluate(() => {
    const ft = window.__ft
    const dts = ft.dts.slice().sort((a, b) => a - b)
    const pct = (p) => Math.round(dts[Math.floor(dts.length * p)] || 0)
    const byMark = {}
    for (const s of ft.spikes) byMark[s.mark] = (byMark[s.mark] || 0) + 1
    return {
      frames: ft.dts.length,
      fps_est: Math.round(1000 / (pct(0.5) || 16)),
      ms_median: pct(0.5), ms_p95: pct(0.95), ms_p99: pct(0.99), ms_max: Math.round(Math.max(...ft.dts)),
      frames_over_33ms: ft.dts.filter((d) => d > 33).length,
      frames_over_50ms: ft.dts.filter((d) => d > 50).length,
      frames_over_100ms: ft.dts.filter((d) => d > 100).length,
      spikes_by_phase: byMark,
      top_longtasks: ft.longtasks.sort((a, b) => b.dur - a.dur).slice(0, 20),
      top_spikes: ft.spikes.sort((a, b) => b.dt - a.dt).slice(0, 15),
    }
  })
  console.log(JSON.stringify(r, null, 2))
} finally {
  await browser.close()
}
