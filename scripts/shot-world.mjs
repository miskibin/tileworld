// One-off robust world capture: click Play hard, settle, optionally lift the
// camera so the edge biomes are visible. Writes scripts/<out>.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const out = process.argv[2] || 'scripts/shot-world.png'
const port = process.env.PORT || '5173'
// QUERY env overrides the URL query (default ?capture). Pass QUERY="" to load the
// FULL render path incl. ShaderWarmup — the path the camera-leak fix exercises.
const query = process.env.QUERY !== undefined ? process.env.QUERY : '?capture'
const url = `http://localhost:${port}/${query}`

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text()) })
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message))
  console.log(`→ ${url}`)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })

  const btn = page.locator('button.start-play')
  await btn.waitFor({ state: 'visible', timeout: 10000 })
  await btn.click({ force: true })
  console.log('  clicked Play')
  await page.waitForTimeout(500)
  const gone = await page.locator('button.start-play').count()
  console.log('  start-play buttons remaining:', gone)

  // Optional teleport: `node shot-world.mjs out.png <x> <z>` jumps the hero to a
  // grid tile (dev hook window.tp) so far biome features land in frame.
  const tx = process.argv[3] ? Number(process.argv[3]) : null
  const tz = process.argv[4] ? Number(process.argv[4]) : null
  if (tx !== null && tz !== null) {
    await page.waitForTimeout(800)
    const before = await page.evaluate(() => (window.ppos ? window.ppos() : null))
    const ok = await page.evaluate(([x, z]) => {
      const w = window
      if (typeof w.tp !== 'function') return false
      w.tp(x, z)
      return true
    }, [tx, tz])
    await page.waitForTimeout(600)
    const after = await page.evaluate(() => (window.ppos ? window.ppos() : null))
    console.log(`  teleport(${tx},${tz}):`, ok ? 'ok' : 'no window.tp', '| before', JSON.stringify(before), 'after', JSON.stringify(after))
  }

  await page.waitForTimeout(4000)
  const buf = await page.screenshot({ timeout: 60000 })
  writeFileSync(out, buf)
  console.log(`✓ wrote ${out} (${(buf.length / 1024).toFixed(0)} KB)`)
} finally {
  await browser.close()
}
