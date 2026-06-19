import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const out = process.argv[2] || 'artifacts/hero-knight-model.png'
const port = process.env.PORT || '5173'
const url = `http://localhost:${port}/hero-model.html`

mkdirSync(dirname(out), { recursive: true })

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

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 })
  console.log(`→ ${url}`)
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => Boolean((window).__heroModelReady), undefined, { timeout: 15000 })
  await page.waitForTimeout(750)

  const buf = await page.screenshot({ timeout: 60000 })
  writeFileSync(out, buf)
  console.log(`✓ wrote ${out} (${(buf.length / 1024).toFixed(0)} KB)`)
} finally {
  await browser.close()
}
