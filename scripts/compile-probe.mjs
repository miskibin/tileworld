// Pinpoint the travel-stutter cause WITHOUT relying on (throttling-sensitive)
// frame timing. Teleports to each biome and reads two robust counters:
//   - gl.info.programs.length  → grows when a NEW shader compiles at runtime
//     (a warm-up gap: that content stutters on first view).
//   - gathered point-light count → if it CHANGES, three recompiles EVERY lit
//     material (the "point-light count stutter" the project memory warns about).
// Dev server (teleport hook + window.__r3f). node scripts/compile-probe.mjs [port]
import { chromium } from 'playwright'

const port = process.argv[2] || '5173'
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => !!window.__r3f && typeof window.tp === 'function', { timeout: 60000 }).catch(() => {})
  // Let the at-load ShaderWarmup finish behind the StartScreen, THEN play.
  await page.waitForTimeout(8000)
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('*')].find((e) => /^\s*▶?\s*Play\s*▶?\s*$/i.test(e.textContent || '') && e.children.length <= 1)
    el && el.click()
  })
  await page.waitForTimeout(3000)

  const sample = (label) =>
    page.evaluate((lbl) => {
      const r = window.__r3f
      const gl = r.gl
      const scene = r.scene
      let lights = 0
      scene.traverse((o) => {
        if (!o.isPointLight) return
        // three gathers a light only if it AND every ancestor is visible.
        let vis = o.visible
        let p = o.parent
        while (vis && p) { vis = p.visible; p = p.parent }
        if (vis) lights++
      })
      return {
        label: lbl,
        programs: gl.info.programs ? gl.info.programs.length : -1,
        pointLights: lights,
        drawCalls: gl.info.render.calls,
      }
    }, label)

  const rows = []
  const go = async (label, x, z) => {
    if (x !== null) await page.evaluate(([px, pz]) => window.tp(px, pz), [x, z])
    await page.waitForTimeout(2500) // settle + let any first-view compile happen
    rows.push(await sample(label))
  }

  await go('castle (baseline)', 72, 58)
  await go('snow', 26, 24)
  await go('desert', 112, 28)
  await go('rock', 122, 58)
  await go('forest', 32, 80)
  await go('swamp', 72, 92)
  await go('trader village', 96, 34)
  await go('NW village', 66, 32)
  await go('back to castle', 72, 58)

  console.log('label'.padEnd(20), 'programs', 'pointLights', 'drawCalls')
  let prevP = rows[0].programs
  for (const r of rows) {
    const grew = r.programs > prevP ? `  (+${r.programs - prevP} NEW shaders)` : ''
    console.log(r.label.padEnd(20), String(r.programs).padStart(8), String(r.pointLights).padStart(11), String(r.drawCalls).padStart(9), grew)
    prevP = r.programs
  }
} finally {
  await browser.close()
}
