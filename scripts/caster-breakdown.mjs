// Breaks the shadow casters down by top-level group so I know what to cut to make
// the shadow pass cheap enough to update every frame (smooth player shadow).
//   node scripts/caster-breakdown.mjs [port]
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
  await page.waitForTimeout(3500)
  const out = await page.evaluate(() => {
    const { scene } = window.__r3f
    const tally = {}
    let total = 0, instanced = 0
    const count = (root, tag) => {
      let c = 0, inst = 0
      root.traverse((o) => {
        if (o.isMesh && o.castShadow && o.visible) {
          c++; total++
          if (o.isInstancedMesh) { inst++; instanced++ }
        }
      })
      if (c) tally[tag] = { casters: c, instanced: inst }
    }
    scene.children.forEach((c, i) => {
      if (c.children && c.children.length > 8) c.children.forEach((gc, j) => count(gc, `${gc.type}[${i}.${j}]`))
      else count(c, `${c.type}[${i}]`)
    })
    const top = Object.entries(tally).sort((a, b) => b[1].casters - a[1].casters).slice(0, 16)
    return { total, instanced, top }
  })
  console.log(`total visible shadow casters: ${out.total} (instanced meshes: ${out.instanced})`)
  console.log('=== by group (casters / of which instanced) ===')
  for (const [k, v] of out.top) console.log(`  ${String(v.casters).padStart(4)}  (${v.instanced} inst)  ${k}`)
} finally {
  await browser.close()
}
