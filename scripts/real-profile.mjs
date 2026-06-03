// REAL profiler: headed Chrome with the actual GPU (no SwiftShader), drives the
// player on a loop along the MAP EDGES, and records a CDP CPU profile during that
// travel — then ranks the hottest functions. This is the scenario the user says
// stutters worst. Dev server must be running on the given port.
//   node scripts/real-profile.mjs [port] [seconds]
import { chromium } from 'playwright'

const port = process.argv[2] || '5186'
const seconds = Number(process.argv[3] || 9)

const browser = await chromium.launch({
  headless: false, // real window -> real GPU
  args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--no-sandbox'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const cdp = await page.context().newCDPSession(page)
  console.log(`→ http://localhost:${port}/`)
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })

  // Confirm we're on a real GPU, not software.
  const renderer = await page.evaluate(() => {
    const c = document.createElement('canvas')
    const gl = c.getContext('webgl2') || c.getContext('webgl')
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info')
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unknown'
  })
  console.log('GPU renderer:', renderer)

  await page.waitForFunction(() => !!window.__r3f && !!window.__charpos, { timeout: 120000 }).catch(() => {})
  // Start the game (Play) so it's the real gameplay path.
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find((e) => /^\s*▶?\s*Play\s*▶?\s*$/i.test(e.textContent || '') && e.children.length <= 1)
    el && el.click()
  })
  await page.waitForTimeout(4000) // warmup precompile + settle

  // Drive the player on a loop hitting several map edges (grid coords).
  await page.evaluate(() => {
    const WPS = [[115, 58], [115, 82], [55, 84], [22, 70], [18, 45], [40, 22], [78, 18], [110, 30]]
    let wi = 0
    const SPEED = 0.5 // tiles/frame ≈ sprint
    const step = () => {
      const p = window.__charpos
      if (!p) return
      const [tx, tz] = WPS[wi % WPS.length]
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz)
      if (d < 1.2) wi++
      else { p.x += (dx / d) * SPEED; p.z += (dz / d) * SPEED }
      if (window.__player) window.__player.moving = true
      window.__raf = requestAnimationFrame(step)
    }
    step()
  })
  await page.waitForTimeout(800) // let it get moving toward the edge

  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 120 })
  await cdp.send('Profiler.start')
  console.log(`recording ${seconds}s of edge travel…`)
  await page.waitForTimeout(seconds * 1000)
  const { profile } = await cdp.send('Profiler.stop')
  const where = await page.evaluate(() => ({ x: +window.__charpos.x.toFixed(0), z: +window.__charpos.z.toFixed(0) }))

  // Aggregate SELF time per function via timeDeltas.
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const selfUs = new Map()
  const samples = profile.samples || []
  const deltas = profile.timeDeltas || []
  for (let i = 0; i < samples.length; i++) selfUs.set(samples[i], (selfUs.get(samples[i]) || 0) + Math.max(0, deltas[i] || 0))
  const byFn = new Map()
  for (const [id, us] of selfUs) {
    const n = byId.get(id); if (!n) continue
    const cf = n.callFrame
    const file = (cf.url || '').split('/').slice(-1)[0] || 'native'
    const key = `${cf.functionName || '(anon)'} @ ${file}:${cf.lineNumber + 1}`
    byFn.set(key, (byFn.get(key) || 0) + us)
  }
  const total = [...selfUs.values()].reduce((a, b) => a + b, 0) || 1
  const rows = [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
  console.log(`player ended near grid (${where.x},${where.z}); total sampled ${(total / 1000).toFixed(0)}ms`)
  console.log('=== hottest functions during edge travel (self time) ===')
  for (const [k, us] of rows) console.log(`${((us / total) * 100).toFixed(1).padStart(5)}%  ${(us / 1000).toFixed(0).padStart(6)}ms  ${k}`)
} finally {
  await browser.close()
}
