// Headless CPU profiler for the running game — my own "Chrome DevTools
// Performance" recording, so I can debug real data without the user pasting
// traces. Launches Playwright chromium (SwiftShader, same as screenshot.mjs),
// drives the player around for a few seconds while recording a CDP CPU profile,
// then prints the hottest functions by SELF time.
//
// GPU is software here so absolute frame cost isn't the user's, but the JS
// hot-function ranking (obstacleCollidesAt, updateMatrixWorld, traverse, …) is
// GPU-independent — exactly what we're optimizing. Dev server must be running.
//
//   node scripts/profile.mjs [seconds] [port] [query]
//   node scripts/profile.mjs 10 5179 "?capture"
import { chromium } from 'playwright'

const seconds = Number(process.argv[2] || 10)
const port = process.argv[3] || process.env.PORT || '5173'
const query = process.argv[4] !== undefined ? process.argv[4] : '?capture'
const url = `http://localhost:${port}/${query}`

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
})

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const cdp = await page.context().newCDPSession(page)
  console.log(`→ ${url}`)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })

  // Wait for the R3F scene to mount.
  await page.waitForFunction(() => !!window.__r3f, { timeout: 120000 }).catch(() => {})
  await page.waitForTimeout(2000)

  // Drive the player: hold W and sweep the view so movement + collision + the
  // camera revealing new content all run (exercises obstacleCollidesAt, AI,
  // matrix updates). We dispatch real key events on window (useKeyboard listens
  // there) and never release, so the knight keeps walking through the scatter.
  await page.evaluate(() => {
    const k = (key, code) => window.dispatchEvent(new KeyboardEvent('keydown', { key, code, bubbles: true }))
    k('w', 'KeyW')
    let a = 0
    window.__sweep = setInterval(() => {
      a += 0.3
      window.dispatchEvent(new MouseEvent('mousemove', { movementX: Math.cos(a) * 40, movementY: 0, bubbles: true }))
    }, 100)
  })

  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 100 }) // µs
  await cdp.send('Profiler.start')
  console.log(`recording ${seconds}s…`)
  await page.waitForTimeout(seconds * 1000)
  const { profile } = await cdp.send('Profiler.stop')

  // Aggregate SELF time by node, using timeDeltas (µs) attributed to each sample.
  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const selfUs = new Map() // nodeId -> µs
  const samples = profile.samples || []
  const deltas = profile.timeDeltas || []
  for (let i = 0; i < samples.length; i++) {
    const id = samples[i]
    selfUs.set(id, (selfUs.get(id) || 0) + Math.max(0, deltas[i] || 0))
  }
  // Group by function identity.
  const byFn = new Map()
  for (const [id, us] of selfUs) {
    const n = byId.get(id)
    if (!n) continue
    const cf = n.callFrame
    const file = (cf.url || '').split('/').slice(-1)[0] || cf.url || 'native'
    const name = cf.functionName || '(anonymous)'
    const key = `${name} @ ${file}:${cf.lineNumber + 1}`
    byFn.set(key, (byFn.get(key) || 0) + us)
  }
  const total = [...selfUs.values()].reduce((a, b) => a + b, 0) || 1
  const rows = [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)

  console.log(`\n=== CPU self-time (${(total / 1000).toFixed(0)} ms sampled over ${seconds}s) ===`)
  for (const [key, us] of rows) {
    const pct = ((us / total) * 100).toFixed(1).padStart(5)
    const ms = (us / 1000).toFixed(1).padStart(7)
    console.log(`${pct}%  ${ms}ms  ${key}`)
  }
} finally {
  await browser.close()
}
