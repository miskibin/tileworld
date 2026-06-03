// Profiles the "fast movement near the map edge" lag. Teleports the live player
// (window.__player, dev-only) out toward an edge, steps it fast across several
// frames, and reports (a) any shader links that fire (shader compile), (b) the
// hottest useFrame subscribers at that position, (c) draw calls. Tells us whether
// the edge lag is shader, shadow pass, cull thrash, or specific entity AI.
//   node scripts/edge-profile.mjs [port] [gridX] [gridZ]
import { chromium } from 'playwright'

const port = process.argv[2] || '5184'
const ex = Number(process.argv[3] || 118)
const ez = Number(process.argv[4] || 60)
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.addInitScript(() => {
    window.__links = []
    const P = WebGL2RenderingContext.prototype
    const o = P.linkProgram
    P.linkProgram = function (p) { window.__links.push(performance.now()); return o.call(this, p) }
  })
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => !!window.__r3f && !!window.__player, { timeout: 120000 }).catch(() => {})
  await page.waitForFunction(() => window.__r3f?.scene?.environment != null, { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(4000) // warmup done

  const result = await page.evaluate(({ ex, ez }) => {
    const r = window.__r3f
    const pl = window.__player
    const linkBefore = window.__links.length

    // Step the player fast from near-centre out to the edge target, advancing the
    // sim each step so culling + shadow recenter + AI all react to the movement.
    let t = performance.now()
    const STEPS = 16
    const sx = pl.x, sz = pl.z
    for (let i = 1; i <= STEPS; i++) {
      pl.x = sx + ((ex - sx) * i) / STEPS
      pl.z = sz + ((ez - sz) * i) / STEPS
      pl.moving = true
      r.advance(t)
      t += 33
    }
    const edgeLinks = window.__links.length - linkBefore

    // Per-subscriber timing AT the edge position.
    const subs = r.internal.subscribers
    const getCb = (s) => (s.ref && typeof s.ref.current === 'function' ? s.ref.current : null)
    const cbs = subs.map(getCb).filter(Boolean)
    for (let w = 0; w < 2; w++) for (const cb of cbs) { try { cb(r, 0.016) } catch {} }
    const rows = cbs.map((cb) => {
      const t0 = performance.now()
      for (let k = 0; k < 20; k++) { try { cb(r, 0.016) } catch {} }
      let fp = cb.toString().replace(/\s+/g, ' ').slice(0, 70)
      return { ms: +((performance.now() - t0) / 20).toFixed(3), fp }
    }).sort((a, b) => b.ms - a.ms).slice(0, 12)

    const gl = r.gl
    return {
      edgeLinks,
      player: { x: +pl.x.toFixed(1), z: +pl.z.toFixed(1) },
      drawCalls: gl.info.render.calls,
      shadowEnabled: gl.shadowMap.enabled,
      top: rows,
    }
  }, { ex, ez })

  console.log(`edge target grid (${ex},${ez}) → player now`, result.player)
  console.log('shader links during fast edge move:', result.edgeLinks, '(0 = not shader)')
  console.log('draw calls:', result.drawCalls)
  console.log('\n=== hottest useFrame subscribers at the edge ===')
  for (const r2 of result.top) console.log(`  ${String(r2.ms).padStart(7)}ms  ${r2.fp}`)
} finally {
  await browser.close()
}
