// Measures the three.js render-loop CPU that the subscriber profiler can't see:
// scene.updateMatrixWorld() (the 2.9s item in the user's Chrome trace) + object
// counts. Pure matrix math, GPU-free, so the number is meaningful here.
//   node scripts/measure-render.mjs [port]
import { chromium } from 'playwright'

const port = process.argv[2] || '5173'
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.goto(`http://localhost:${port}/?capture`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => !!window.__r3f, { timeout: 120000 }).catch(() => {})
  await page.waitForTimeout(2000)
  const r = await page.evaluate(() => {
    const { scene } = window.__r3f
    let objects = 0, meshes = 0, autoUpdaters = 0
    scene.traverse((o) => {
      objects++
      if (o.isMesh) meshes++
      if (o.matrixAutoUpdate) autoUpdaters++
    })
    const N = 2000
    // force full recompute each iter (matrixWorldNeedsUpdate cascade)
    const t0 = performance.now()
    for (let i = 0; i < N; i++) { scene.matrixWorldNeedsUpdate = true; scene.updateMatrixWorld(true) }
    const ms = (performance.now() - t0) / N
    return { objects, meshes, autoUpdaters, updateMatrixWorld_msPerFrame: +ms.toFixed(3) }
  })
  console.log(JSON.stringify(r, null, 2))
} finally {
  await browser.close()
}
