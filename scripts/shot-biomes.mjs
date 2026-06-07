// Capture a clean, post-processed screenshot of each biome for the README gallery.
// One chromium launch: load the FULL render path (no ?capture → AgX grade, bloom,
// reflective water, shadows), wait out the ShaderWarmup cover, click Play, hide all
// HUD/debug chrome, then teleport the hero (dev hook window.tp) into each biome and
// shoot. Dev server must be running (npm run dev). Writes docs/screenshots/<name>.png.
import { chromium } from 'playwright'
import { writeFileSync, mkdirSync } from 'node:fs'

const port = process.env.PORT || '5173'
const url = `http://localhost:${port}/` // full render path (no ?capture)
const OUT_DIR = 'docs/screenshots'
mkdirSync(OUT_DIR, { recursive: true })

// New-space grid coords (202×152 map) computed from REGIONS via fromBase().
// Mountain biomes (snow/rock) are framed from their grass-side approach so the
// massif fills the view instead of dropping the hero onto a cliff.
// Optional CLI filter: `node shot-biomes.mjs castle` re-shoots only that one
// (the others are deterministic enough to keep; lets us iterate one frame).
const only = process.argv[2]
const ALL = [
  // Keep shot: spawn faces the keep (north). Back the hero due south, out of the
  // war-bell interact range (no canvas "Press E" prompt), keep ahead in frame.
  { name: 'castle', tp: [101, 90] },
  { name: 'snow', tp: [44, 40] },
  { name: 'desert', tp: [150, 44] },
  { name: 'forest', tp: [50, 110] },
  { name: 'swamp', tp: [101, 124] },
  { name: 'rock', tp: [156, 80] },
]
const SHOTS = only ? ALL.filter((s) => s.name === only) : ALL

// Hide every DOM overlay so only the rendered world is captured: the game HUD
// (.hud), the leva debug panel (stitches-hashed .leva-c-*), and the r3f-perf meter
// (.top-left). The interaction prompts are canvas-rendered (not DOM) — avoided by
// teleport placement instead.
const HIDE_CHROME = `
  .hud{display:none!important}
  [class*="leva-c-"],div[class^="leva-"]{display:none!important}
  .top-left,#r3f-perf{display:none!important}
`

const browser = await chromium.launch({
  headless: true,
  args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  page.on('pageerror', (e) => console.log('  [pageerror]', e.message))
  console.log(`→ ${url}`)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })

  // Full render shows the LoadingScreen cover while ShaderWarmup compiles every
  // program (camera sweeps the island top-down). It intercepts clicks, so wait for
  // it to APPEAR then fade out before starting. (Waiting only for 'detached' races:
  // it isn't mounted yet at domcontentloaded, so detached resolves instantly.)
  console.log('  waiting out shader warmup…')
  await page.waitForSelector('.loading-screen', { state: 'visible', timeout: 5000 }).catch(() => {})
  await page.waitForSelector('.loading-screen', { state: 'detached', timeout: 14000 }).catch(() => {})
  await page.waitForTimeout(800)

  // Fire the onClick directly (bypasses any lingering overlay / mid-render re-mount).
  const started = await page.evaluate(() => {
    const b = document.querySelector('button.start-play')
    if (!b) return false
    b.click()
    return true
  })
  console.log('  Play clicked:', started)
  // Settle: let the menu→prep transition land and the start view paint a few frames.
  await page.waitForTimeout(3500)

  await page.addStyleTag({ content: HIDE_CHROME })

  for (const shot of SHOTS) {
    if (shot.tp) {
      const ok = await page.evaluate(([x, z]) => {
        if (typeof window.tp !== 'function') return false
        window.tp(x, z)
        return true
      }, shot.tp)
      const after = await page.evaluate(() => (window.ppos ? window.ppos() : null))
      console.log(`  tp ${shot.name}(${shot.tp}):`, ok ? 'ok' : 'NO window.tp', '→', JSON.stringify(after))
    }
    // Software render is slow; let the new area stream in (cull) + frames settle.
    await page.waitForTimeout(shot.tp ? 6000 : 4000)
    const file = `${OUT_DIR}/${shot.name}.png`
    writeFileSync(file, await page.screenshot({ timeout: 60000 }))
    console.log(`  ✓ ${file}`)
  }
} finally {
  await browser.close()
}
