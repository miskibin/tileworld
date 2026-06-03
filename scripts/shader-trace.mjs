// Instruments the WebGL context to record EVERY shader linkProgram + the
// material it belongs to (via its #define fingerprint), so I can see exactly
// which shaders compile after the precompile is supposed to be done — i.e. what
// still compiles during gameplay and causes the freezes. Runs on the real repo's
// dev server (software GL is fine — linkProgram still fires when content first
// renders, GPU speed is irrelevant to WHICH shaders compile).
//   node scripts/shader-trace.mjs [port]
import { chromium } from 'playwright'

const port = process.argv[2] || '5179'
const browser = await chromium.launch({
  headless: true,
  args: ['--disable-gpu', '--use-gl=angle', '--use-angle=swiftshader', '--no-sandbox', '--disable-dev-shm-usage'],
})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })

  // Hook the GL context BEFORE any page script: map shader→source, program→shaders,
  // and on linkProgram record the fragment shader's #define fingerprint + phase.
  await page.addInitScript(() => {
    window.__phase = 'load'
    window.__links = []
    const P = WebGL2RenderingContext.prototype
    const shSrc = new Map()
    const prog = new Map()
    const oSS = P.shaderSource
    const oAS = P.attachShader
    const oLP = P.linkProgram
    P.shaderSource = function (sh, src) { shSrc.set(sh, src); return oSS.call(this, sh, src) }
    P.attachShader = function (p, sh) { const a = prog.get(p) || []; a.push(sh); prog.set(p, a); return oAS.call(this, p, sh) }
    P.linkProgram = function (p) {
      let frag = ''
      for (const sh of prog.get(p) || []) {
        const s = shSrc.get(sh) || ''
        if (s.includes('gl_FragColor') || s.includes('pc_fragColor') || /void main/.test(s) && s.includes('FRAGMENT')) frag = s
        else if (!frag && s.includes('}')) frag = s
      }
      const defs = (frag.match(/#define [A-Z0-9_]+/g) || []).map((d) => d.replace('#define ', '')).join(',')
      window.__links.push({ t: Math.round(performance.now()), phase: window.__phase, defs })
      return oLP.call(this, p)
    }
  })

  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => !!window.__r3f, { timeout: 120000 }).catch(() => {})
  // wait until the HDRI environment has loaded (so the envMap precompile pass has
  // fired) + buffer, so the read isn't a timing artifact of the slow SwiftShader HDRI
  await page.waitForFunction(() => window.__r3f?.scene?.environment != null, { timeout: 60000 }).catch(() => {})
  await page.waitForTimeout(4000)

  const loadCount = await page.evaluate(() => window.__links.length)

  // TEST 1: does a 2nd full-scene gl.compile add NEW programs? If yes, the
  // precompile didn't cover the scene (timing / coverage bug).
  const test1 = await page.evaluate(() => {
    window.__phase = 'compile2'
    const { gl, scene, camera } = window.__r3f
    const before = window.__links.length
    gl.compile(scene, camera)
    return { newLinks: window.__links.length - before, programs: gl.info.programs.length }
  })

  // TEST 2: force EVERYTHING visible (undo all culls) + compile again → reveals
  // programs that only the currently-hidden/culled content needs.
  const test2 = await page.evaluate(() => {
    window.__phase = 'allVisible'
    const { gl, scene, camera } = window.__r3f
    scene.traverse((o) => { o.visible = true; o.matrixWorldAutoUpdate = true })
    const before = window.__links.length
    gl.compile(scene, camera)
    return { newLinks: window.__links.length - before }
  })

  const all = await page.evaluate(() => window.__links)
  // Summaries
  const byPhase = {}
  for (const l of all) byPhase[l.phase] = (byPhase[l.phase] || 0) + 1
  const explore = all.filter((l) => l.phase === 'compile2' || l.phase === 'allVisible')
  const fps = {}
  for (const l of explore) fps[l.defs] = (fps[l.defs] || 0) + 1

  console.log('links during LOAD (mount+precompile):', loadCount)
  console.log('TEST1 2nd gl.compile → new programs:', test1.newLinks, '(total programs now', test1.programs + ')')
  console.log('TEST2 all-visible gl.compile → new programs:', test2.newLinks)
  console.log('by phase:', JSON.stringify(byPhase))
  console.log('\n=== define-fingerprints of programs NOT covered by precompile (top) ===')
  Object.entries(fps).sort((a, b) => b[1] - a[1]).slice(0, 20).forEach(([d, n]) => {
    console.log(`  x${n}  ${d.slice(0, 160)}`)
  })
} finally {
  await browser.close()
}
