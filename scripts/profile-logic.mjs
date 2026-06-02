// Profiles the GAME LOGIC only — bypasses rendering, which under SwiftShader is
// software-emulated and swamps the trace. We grab the live R3F useFrame
// subscribers (player movement+collision, ork/animal/villager AI, …) and run
// them in a tight loop while CDP samples the CPU. This isolates pure JS cost
// (obstacleCollidesAt, pathfinding, matrix math) GPU-free — the real target.
//
//   node scripts/profile-logic.mjs [iterations] [port]
import { chromium } from 'playwright'

const iters = Number(process.argv[2] || 4000)
const port = process.argv[3] || process.env.PORT || '5173'
const url = `http://localhost:${port}/?capture`

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
})

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const cdp = await page.context().newCDPSession(page)
  console.log(`→ ${url}`)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => !!window.__r3f, { timeout: 120000 }).catch(() => {})
  await page.waitForTimeout(2000)

  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 80 })
  await cdp.send('Profiler.start')

  const measured = await page.evaluate((N) => {
    const r = window.__r3f
    const subs = r.internal.subscribers
    const getCb = (s) => (s.ref && typeof s.ref.current === 'function' ? s.ref.current : null)
    const cbs = subs.map(getCb).filter(Boolean)
    // Pretend the player is walking so Character runs its movement+collision.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w', code: 'KeyW', bubbles: true }))
    const t0 = performance.now()
    for (let i = 0; i < N; i++) {
      for (const cb of cbs) {
        try { cb(r, 0.016) } catch {}
      }
    }
    const ms = performance.now() - t0
    return { ms, frames: N, subs: cbs.length, msPerFrame: +(ms / N).toFixed(4) }
  }, iters)

  const { profile } = await cdp.send('Profiler.stop')

  const byId = new Map(profile.nodes.map((n) => [n.id, n]))
  const selfUs = new Map()
  const samples = profile.samples || []
  const deltas = profile.timeDeltas || []
  for (let i = 0; i < samples.length; i++) {
    const id = samples[i]
    selfUs.set(id, (selfUs.get(id) || 0) + Math.max(0, deltas[i] || 0))
  }
  const byFn = new Map()
  for (const [id, us] of selfUs) {
    const n = byId.get(id)
    if (!n) continue
    const cf = n.callFrame
    const file = (cf.url || '').split('/').slice(-1)[0] || 'native'
    const key = `${cf.functionName || '(anon)'} @ ${file}:${cf.lineNumber + 1}`
    byFn.set(key, (byFn.get(key) || 0) + us)
  }
  const total = [...selfUs.values()].reduce((a, b) => a + b, 0) || 1
  const rows = [...byFn.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)

  console.log(`\nlogic: ${measured.frames} frames × ${measured.subs} subs = ${measured.ms.toFixed(0)}ms (${measured.msPerFrame}ms/frame)`)
  console.log(`=== CPU self-time (top functions) ===`)
  for (const [key, us] of rows) {
    console.log(`${((us / total) * 100).toFixed(1).padStart(5)}%  ${(us / 1000).toFixed(1).padStart(7)}ms  ${key}`)
  }
} finally {
  await browser.close()
}
