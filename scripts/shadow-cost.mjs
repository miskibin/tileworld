// Measures the sun-shadow pass cost: how many extra draw calls a shadow re-render
// adds, and how many shadow casters exist. SunShadow forces a shadow re-render
// every ~6 frames WHILE MOVING (ANIM_REFRESH_INTERVAL) + on every >6-unit
// recenter — so a heavy shadow pass = a periodic stutter while moving fast.
//   node scripts/shadow-cost.mjs [port]
import { chromium } from 'playwright'
const port = process.argv[2] || '5185'
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => !!window.__r3f, { timeout: 120000 }).catch(() => {})
  await page.waitForTimeout(4000)
  const out = await page.evaluate(() => {
    const { gl, scene, camera } = window.__r3f
    let casters = 0
    scene.traverse((o) => { if (o.isMesh && o.castShadow) casters++ })
    // base frame (no shadow re-render)
    gl.shadowMap.needsUpdate = false
    gl.render(scene, camera)
    const base = gl.info.render.calls
    // frame WITH a shadow re-render
    gl.shadowMap.needsUpdate = true
    gl.render(scene, camera)
    const withShadow = gl.info.render.calls
    return { casters, base, withShadow, shadowPassCalls: withShadow - base, mapSize: gl.shadowMap.enabled }
  })
  console.log(JSON.stringify(out, null, 2))
} finally {
  await browser.close()
}
