// Per-subtree draw-call attribution: hide each child group, re-render, measure
// the delta in total calls (color+shadow). Reveals where the ~1100 live.
import { chromium } from 'playwright'
const URL = 'http://localhost:5173/'
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox'] })
const ctx = await browser.newContext({ viewport: { width: 1024, height: 576 } })
await ctx.route('**://cdn.jsdelivr.net/**', async (route) => { try { const r = await fetch(route.request().url()); await route.fulfill({ status: r.status, headers: { 'access-control-allow-origin': '*' }, body: Buffer.from(await r.arrayBuffer()) }) } catch { await route.abort() } })
const page = await ctx.newPage(); page.on('pageerror', () => {}); page.setDefaultTimeout(120000)
await page.goto(URL, { waitUntil: 'domcontentloaded' })
let started = false
for (let i = 0; i < 25 && !started; i++) { await page.evaluate(() => document.querySelector('button.start-play')?.click()); await sleep(700); started = (await page.locator('.start-screen').count()) === 0 }
await sleep(8000)

const result = await page.evaluate(async () => {
  const r3f = window.__r3f, gl = r3f.gl, scene = r3f.scene, cam = r3f.camera
  gl.info.autoReset = false
  // SunShadow sets shadowMap.autoUpdate = false, so a bare gl.render() reuses
  // the cached shadow map and the per-subtree deltas would miss the shadow
  // pass. Force a shadow re-render each time so attribution covers colour +
  // shadow, which is what this diagnostic is meant to measure.
  const render = () => {
    gl.shadowMap.needsUpdate = true
    gl.info.reset()
    gl.render(scene, cam)
    return gl.info.render.calls
  }
  const base = render()
  // Collect all renderable-bearing subtrees up to depth 3, attribute by hiding.
  // Walk top groups; for each direct/grandchild group with >0 renderables, measure.
  const groups = []
  const collect = (o, depth) => {
    if (depth > 3) return
    let count = 0
    o.traverse((c) => { if ((c.isMesh || c.isInstancedMesh || c.isPoints) && c.visible) count++ })
    if (count > 0 && (o.isGroup || o.isScene)) {
      for (const ch of o.children) collect(ch, depth + 1)
    }
  }
  // Simpler: measure each direct child of scene, then each child of the big offset group.
  const measure = (obj) => {
    const wasVisible = obj.visible
    obj.visible = false
    const after = render()
    obj.visible = wasVisible
    render()
    return base - after
  }
  const rows = []
  for (const child of scene.children) {
    let renderables = 0
    child.traverse((c) => { if ((c.isMesh || c.isInstancedMesh || c.isPoints) && c.visible) renderables++ })
    if (renderables === 0) continue
    const delta = measure(child)
    const label = child.name || child.type
    rows.push({ label, renderables, drawCalls: delta, depth: 1 })
    // If this is a big group (the offset group), drill into its children.
    if (renderables > 30 && child.isGroup) {
      for (const gc of child.children) {
        let r2 = 0
        gc.traverse((c) => { if ((c.isMesh || c.isInstancedMesh || c.isPoints) && c.visible) r2++ })
        if (r2 === 0) continue
        const d2 = measure(gc)
        rows.push({ label: '  ' + (gc.name || gc.type), renderables: r2, drawCalls: d2, depth: 2 })
      }
    }
  }
  rows.sort((a, b) => b.drawCalls - a.drawCalls)
  return { base, rows }
})
console.log('BASE total draw calls:', result.base)
console.log('label\trenderables\tdrawCallsAttributed')
for (const r of result.rows) console.log(`${r.label}\t${r.renderables}\t${r.drawCalls}`)
await browser.close()
