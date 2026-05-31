// Repro + verification for the preview-screenshot timeout.
//
// Launches Playwright's chromium with the GPU DISABLED and WebGL forced onto
// SwiftShader (software) — the same no-GPU condition the headless preview tool
// runs under, which is what makes a full-postprocessing frame take >30s to paint
// and the screenshot time out. Then it screenshots the scene twice:
//   A) "/"          — full EffectComposer stack (the slow path)
//   B) "/?capture"  — capture mode: no post-processing, dpr 1 (the fix)
// and reports how long each screenshot took + whether the image is non-blank.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const BASE = 'http://localhost:5173'
const SHOT_TIMEOUT = 30000 // mirror the MCP tool's 30s budget

async function run(label, url) {
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-gpu',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--no-sandbox',
      '--disable-dev-shm-usage',
    ],
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  // Click Play and CONFIRM we left the StartScreen (the Play button is gone),
  // so the screenshot below actually exercises the 3D scene, not the menu.
  let entered = false
  try {
    const play = page.getByRole('button', { name: /play/i })
    await play.click({ timeout: 8000 })
    await play.waitFor({ state: 'detached', timeout: 8000 })
    entered = true
  } catch {
    entered = false
  }
  await page.waitForTimeout(2500)

  const tShot = Date.now()
  let ok = false, bytes = 0, err = ''
  try {
    const buf = await page.screenshot({ timeout: SHOT_TIMEOUT })
    bytes = buf.length
    ok = true
    writeFileSync(`scripts/_shot-${label}.png`, buf)
  } catch (e) {
    err = String(e).split('\n')[0]
  }
  const shotMs = Date.now() - tShot
  await browser.close()
  return { label, entered, ok, shotMs, bytes, err }
}

const full = await run('full', `${BASE}/`)
const capture = await run('capture', `${BASE}/?capture`)
console.log(JSON.stringify({ full, capture }, null, 2))
