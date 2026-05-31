// Headless screenshot of the running dev server — the working alternative to the
// preview/MCP screenshot tool, which cannot capture this WebGL canvas in its
// GPU-less environment (its Chrome has no SwiftShader fallback, so the WebGL
// surface is never composited and Page.captureScreenshot hangs).
//
// This launches a normal Playwright chromium with WebGL forced onto SwiftShader,
// which DOES render and capture. Usage (dev server must be running — `npm run dev`):
//
//   npm run shot                       → scene to scripts/shot.png
//   npm run shot -- map.png            → custom output file
//   npm run shot -- map.png "?capture" → custom URL query (defaults to ?capture,
//                                        the lighter render path; see renderMode.ts)
//   npm run shot -- menu.png "" --no-play   → don't click Play (capture StartScreen)
//
// Capture mode (?capture) is recommended: it drops post-processing + shadows so
// the software-rendered frame paints faster.
import { chromium } from 'playwright'
import { writeFileSync } from 'node:fs'

const args = process.argv.slice(2)
const out = args[0] || 'scripts/shot.png'
const query = args[1] !== undefined ? args[1] : '?capture'
const noPlay = args.includes('--no-play')
const port = process.env.PORT || '5173'
const url = `http://localhost:${port}/${query}`

const browser = await chromium.launch({
  headless: true,
  args: [
    '--disable-gpu',
    '--use-gl=angle',
    '--use-angle=swiftshader', // software WebGL — renders without a real GPU
    '--no-sandbox',
    '--disable-dev-shm-usage',
  ],
})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  console.log(`→ ${url}`)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })

  if (!noPlay) {
    // World boots paused behind the StartScreen — click Play to reveal the scene.
    try {
      await page.getByRole('button', { name: /play/i }).click({ timeout: 8000 })
    } catch {
      await page.locator('button').first().click({ timeout: 8000 }).catch(() => {})
    }
  }
  // Let the scene mount, textures load, and a few frames paint.
  await page.waitForTimeout(3000)

  const buf = await page.screenshot({ timeout: 60000 })
  writeFileSync(out, buf)
  console.log(`✓ wrote ${out} (${(buf.length / 1024).toFixed(0)} KB)`)
} finally {
  await browser.close()
}
