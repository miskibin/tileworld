// Where do the draw calls live? Renders one frame, reads gl.info, and breaks the
// scene's meshes down by their top-level group so I can target the biggest
// draw-call source (draw-call submission is the user's real remaining CPU cost).
//   node scripts/measure-drawcalls.mjs [port]
import { chromium } from 'playwright'

const port = process.argv[2] || '5173'
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => !!window.__r3f, { timeout: 120000 }).catch(() => {})
  await page.waitForTimeout(3000)
  const out = await page.evaluate(() => {
    const { gl, scene, camera } = window.__r3f
    gl.render(scene, camera)
    const info = { calls: gl.info.render.calls, tris: gl.info.render.triangles }
    // Count meshes per immediate child of the scene (and of the grid-offset group).
    let regular = 0, instanced = 0, casters = 0
    const bySystem = {}
    const walk = (obj, tag) => {
      obj.traverse((o) => {
        if (!o.isMesh) return
        if (o.isInstancedMesh) instanced++; else regular++
        if (o.castShadow) casters++
        bySystem[tag] = bySystem[tag] || { meshes: 0, instanced: 0, casters: 0 }
        bySystem[tag].meshes++
        if (o.isInstancedMesh) bySystem[tag].instanced++
        if (o.castShadow) bySystem[tag].casters++
      })
    }
    // The big offset group holds the world; tag by its children's index/type.
    scene.children.forEach((c, i) => {
      if (c.children && c.children.length > 8) {
        c.children.forEach((gc, j) => walk(gc, `child[${i}][${j}] ${gc.type}`))
      } else {
        walk(c, `scene[${i}] ${c.type}`)
      }
    })
    const top = Object.entries(bySystem)
      .map(([k, v]) => [k, v])
      .sort((a, b) => (b[1].meshes - b[1].instanced) - (a[1].meshes - a[1].instanced))
      .slice(0, 18)
    return { info, totals: { regular, instanced, casters }, top }
  })
  console.log(`draw calls=${out.info.calls}  tris=${out.info.tris}`)
  console.log(`meshes: regular=${out.totals.regular} instanced=${out.totals.instanced} shadowCasters=${out.totals.casters}`)
  console.log(`\n=== biggest non-instanced mesh sources (≈ draw calls) ===`)
  for (const [k, v] of out.top) {
    console.log(`  ${String(v.meshes - v.instanced).padStart(4)} draws (${v.casters} casters)  ${k}`)
  }
} finally {
  await browser.close()
}
