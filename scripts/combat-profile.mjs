// Profile DURING COMBAT (the "micro lags while playing" scenario): trigger a
// wave, hold position at the keep, auto-swing, and record a CPU profile — then
// rank hottest self-time functions AND surface GC, since per-frame allocations
// (array .filter()/.map() in hot useFrames) cause the periodic GC stutters that
// read as micro-lag. Dev server must be running. node scripts/combat-profile.mjs [port] [sec]
import { chromium } from 'playwright'

const port = process.argv[2] || '5173'
const seconds = Number(process.argv[3] || 12)

const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const cdp = await page.context().newCDPSession(page)
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  // Frame-time + long-task recorder (long-tasks are robust to window throttling).
  await page.evaluate(() => {
    const w = window
    w.__ft = { dts: [], longtasks: [] }
    let last = performance.now()
    const loop = () => { const n = performance.now(); w.__ft.dts.push(n - last); last = n; requestAnimationFrame(loop) }
    requestAnimationFrame(loop)
    try { new PerformanceObserver((l) => { for (const e of l.getEntries()) w.__ft.longtasks.push(Math.round(e.duration)) }).observe({ entryTypes: ['longtask'] }) } catch {}
    w.__ftReset = () => { w.__ft.dts = []; w.__ft.longtasks = [] }
  })
  await page.waitForFunction(() => !!window.__r3f, { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(7000) // warmup behind StartScreen
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find((e) => /^\s*▶?\s*Play\s*▶?\s*$/i.test(e.textContent || '') && e.children.length <= 1)
    el && el.click()
  })
  await page.waitForTimeout(2000)
  // Start the night now (the HUD "Begin night" button = requestPrepSkip).
  const started = await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find((x) => /begin night|skip/i.test(x.textContent || ''))
    if (b) { b.click(); return true }
    return false
  })
  console.log('wave started via HUD:', started)
  await page.waitForTimeout(5000) // let orks spawn + march to the keep

  // Report live entity counts so we know combat is actually happening.
  const counts = await page.evaluate(() => {
    const scene = window.__r3f.scene
    let meshes = 0
    scene.traverse((o) => { if (o.isMesh) meshes++ })
    return { meshes, drawCalls: window.__r3f.gl.info.render.calls }
  })
  console.log('mid-combat:', JSON.stringify(counts))

  // Auto-swing at the incoming horde while recording.
  await page.mouse.move(640, 420)
  await page.mouse.down()
  await page.evaluate(() => window.__ftReset()) // measure only the combat window
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 })
  await cdp.send('Profiler.start')
  console.log(`recording ${seconds}s of combat…`)
  await page.waitForTimeout(seconds * 1000)
  const { profile } = await cdp.send('Profiler.stop')
  await page.mouse.up()

  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const selfUs = new Map()
  const samples = profile.samples || []
  const deltas = profile.timeDeltas || []
  for (let i = 0; i < samples.length; i++) selfUs.set(samples[i], (selfUs.get(samples[i]) || 0) + Math.max(0, deltas[i] || 0))
  const byFn = new Map()
  let gc = 0
  for (const [id, us] of selfUs) {
    const n = byId.get(id); if (!n) continue
    const cf = n.callFrame
    const name = cf.functionName || '(anon)'
    if (/garbage collector/i.test(name)) gc += us
    const file = (cf.url || '').split('/').slice(-1)[0] || 'native'
    const key = `${name} @ ${file}:${cf.lineNumber + 1}`
    byFn.set(key, (byFn.get(key) || 0) + us)
  }
  const ft = await page.evaluate(() => {
    const d = window.__ft.dts.slice().sort((a, b) => a - b)
    const pct = (p) => Math.round(d[Math.floor(d.length * p)] || 0)
    return {
      frames: d.length, median: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: Math.round(Math.max(...d)),
      over33: window.__ft.dts.filter((x) => x > 33).length, over50: window.__ft.dts.filter((x) => x > 50).length,
      longtasks: window.__ft.longtasks.sort((a, b) => b - a).slice(0, 12),
    }
  })
  console.log('FRAME TIMES during combat:', JSON.stringify(ft))
  const total = [...selfUs.values()].reduce((a, b) => a + b, 0) || 1
  const rows = [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
  console.log(`total sampled ${(total / 1000).toFixed(0)}ms;  GC self-time ${(gc / 1000).toFixed(0)}ms (${((gc / total) * 100).toFixed(1)}%)`)
  console.log('=== hottest functions during combat (self time) ===')
  for (const [k, us] of rows) console.log(`${((us / total) * 100).toFixed(1).padStart(5)}%  ${(us / 1000).toFixed(0).padStart(6)}ms  ${k}`)
} finally {
  await browser.close()
}
