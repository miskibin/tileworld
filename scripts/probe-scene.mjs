// One-off: count scene objects + draw calls in the running game, and break down
// where the Object3D nodes come from (the per-frame updateMatrixWorld/traverse
// cost scales with this). Dev server must be running. Headed = real GPU.
import { chromium } from 'playwright'

const port = process.argv[2] || '5173'
const browser = await chromium.launch({ headless: false, args: ['--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => !!window.__r3f, { timeout: 60000 }).catch(() => {})
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find((e) => /^\s*▶?\s*Play\s*▶?\s*$/i.test(e.textContent || '') && e.children.length <= 1)
    el && el.click()
  })
  await page.waitForTimeout(5000) // warmup + settle

  const out = await page.evaluate(() => {
    const r3f = window.__r3f
    const scene = r3f.scene
    const gl = r3f.gl
    let total = 0, meshes = 0, instanced = 0, instancedInstances = 0, lights = 0, groups = 0, points = 0
    scene.traverse((o) => {
      total++
      if (o.isInstancedMesh) { instanced++; instancedInstances += o.count }
      else if (o.isMesh) meshes++
      if (o.isLight) lights++
      if (o.type === 'Group') groups++
      if (o.isPoints) points++
    })
    // Per top-level-child subtree object counts, to find the biggest contributors.
    const byChild = []
    for (const c of scene.children) {
      let n = 0
      c.traverse(() => n++)
      byChild.push({ name: c.name || c.type, n })
    }
    byChild.sort((a, b) => b.n - a.n)
    // The world offset group holds every in-world system. Attribute mesh counts to
    // each of its direct children + a sample material colour so the system is
    // identifiable, and how many of those meshes have matrixAutoUpdate on (the
    // per-frame compose cost).
    const big = scene.children.find((c) => c.children.length > 5) || scene
    const byGrandchild = []
    for (const c of big.children) {
      let nMesh = 0, nNode = 0, autoUp = 0
      let color = ''
      c.traverse((o) => {
        nNode++
        if (o.matrixAutoUpdate) autoUp++
        if ((o.isMesh || o.isInstancedMesh) && !color) {
          const m = Array.isArray(o.material) ? o.material[0] : o.material
          color = m && m.color ? '#' + m.color.getHexString() : (o.isInstancedMesh ? 'inst' : '?')
          nMesh++
        } else if (o.isMesh || o.isInstancedMesh) nMesh++
      })
      if (nMesh > 0) byGrandchild.push({ name: c.name || c.type, meshes: nMesh, nodes: nNode, autoUp, color })
    }
    byGrandchild.sort((a, b) => b.meshes - a.meshes)
    const info = gl.info
    return {
      total, meshes, instanced, instancedInstances, lights, groups, points,
      offsetChildCount: big.children.length,
      drawCalls: info.render.calls, triangles: info.render.triangles,
      programs: info.programs ? info.programs.length : -1,
      topSystems: byGrandchild.slice(0, 22),
    }
  })
  console.log(JSON.stringify(out, null, 2))
} finally {
  await browser.close()
}
