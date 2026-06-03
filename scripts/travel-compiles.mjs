// Real GPU, travel the edges, and capture the #define fingerprint of EVERY shader
// program that compiles WHILE TRAVELLING — the definitive "what is recompiling".
//   node scripts/travel-compiles.mjs [port] [seconds]
import { chromium } from 'playwright'
const port = process.argv[2] || '5186'
const seconds = Number(process.argv[3] || 8)
const browser = await chromium.launch({ headless: false, args: ['--ignore-gpu-blocklist', '--no-sandbox'] })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.addInitScript(() => {
    window.__phase = 'load'
    window.__links = []
    const P = WebGL2RenderingContext.prototype
    const shSrc = new Map(), prog = new Map()
    const oSS = P.shaderSource, oAS = P.attachShader, oLP = P.linkProgram
    P.shaderSource = function (sh, src) { shSrc.set(sh, src); return oSS.call(this, sh, src) }
    P.attachShader = function (p, sh) { const a = prog.get(p) || []; a.push(sh); prog.set(p, a); return oAS.call(this, p, sh) }
    P.linkProgram = function (p) {
      let frag = '', vert = ''
      for (const sh of prog.get(p) || []) { const s = shSrc.get(sh) || ''; if (s.includes('gl_FragColor') || s.includes('pc_fragColor')) frag = s; else vert = s }
      const all = vert + frag
      const defs = (frag.match(/#define [A-Z0-9_]+/g) || []).map((d) => d.replace('#define ', '')).join(',')
      let tag = 'generic-standard'
      if (all.includes('vTerrainWorldPos')) tag = 'TERRAIN(vision)'
      else if (all.includes('uTime') && all.includes('0.55')) tag = 'WATER'
      else if (defs.includes('TROIKA_DERIVED_MATERIAL_1')) tag = 'drei <Text>'
      else if (defs.includes('DEPTH_PACKING')) tag = 'SHADOW_DEPTH'
      else if (defs.includes('USE_ENVMAP')) tag = 'std+envmap'
      window.__links.push({ phase: window.__phase, defs, tag })
      return oLP.call(this, p)
    }
  })
  await page.goto(`http://localhost:${port}/`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => !!window.__r3f && !!window.__charpos, { timeout: 120000 }).catch(() => {})
  // Let the at-load ShaderWarmup finish AT THE MENU first: it waits for the HDRI
  // env, then drives a whole-map render for several frames. Press Play only after,
  // so travel-phase compiles aren't conflated with the warm-up's compiles.
  await page.waitForFunction(() => window.__r3f?.scene?.environment != null, { timeout: 20000 }).catch(() => {})
  await page.waitForTimeout(5000)
  await page.evaluate(() => { const el = [...document.querySelectorAll('*')].find((e) => /^\s*▶?\s*Play\s*▶?\s*$/i.test(e.textContent || '') && e.children.length <= 1); el && el.click() })
  await page.waitForTimeout(1200)
  const loadCount = await page.evaluate(() => window.__links.length)

  // Patch Material.prototype.needsUpdate setter to capture WHO sets it during travel.
  await page.evaluate(() => {
    window.__nuStacks = []
    let mat = null
    window.__r3f.scene.traverse((o) => { if (!mat && o.material) mat = Array.isArray(o.material) ? o.material[0] : o.material })
    if (!mat) return
    let proto = Object.getPrototypeOf(mat), desc = null
    while (proto) { desc = Object.getOwnPropertyDescriptor(proto, 'needsUpdate'); if (desc) break; proto = Object.getPrototypeOf(proto) }
    if (!desc || !desc.set) { window.__nuStacks.push('no setter found'); return }
    const origSet = desc.set
    Object.defineProperty(proto, 'needsUpdate', {
      configurable: true, get: desc.get,
      set(v) {
        if (v === true && window.__phase === 'travel' && window.__nuStacks.length < 6) {
          window.__nuStacks.push((new Error().stack || '').split('\n').slice(1, 7).join('  <  '))
        }
        origSet.call(this, v)
      },
    })
  })

  // travel + sample the visible light count so we can see if it churns
  await page.evaluate(() => {
    window.__phase = 'travel'
    window.__lc = { min: 1e9, max: 0 }
    window.__envChanges = 0
    window.__shadowChanges = 0
    window.__bgChanges = 0
    let lastEnv = window.__r3f.scene.environment
    let lastBg = window.__r3f.scene.background
    let lastShadows = -1
    window.__envWatch = setInterval(() => {
      const s = window.__r3f.scene
      if (s.environment !== lastEnv) { window.__envChanges++; lastEnv = s.environment }
      if (s.background !== lastBg) { window.__bgChanges++; lastBg = s.background }
      const dl = window.__r3f.gl.info ? 0 : 0
      let ns = 0
      s.traverse((o) => { if (o.isDirectionalLight && o.castShadow && o.visible && o.shadow && o.shadow.map) ns++ })
      if (ns !== lastShadows) { if (lastShadows !== -1) window.__shadowChanges++; lastShadows = ns }
    }, 50)
    const WPS = [[115, 58], [115, 82], [55, 84], [22, 70], [18, 45], [40, 22], [78, 18], [110, 30]]
    let wi = 0
    const step = () => {
      const p = window.__charpos; if (!p) return
      const [tx, tz] = WPS[wi % WPS.length]
      const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz)
      if (d < 1.2) wi++; else { p.x += dx / d * 0.5; p.z += dz / d * 0.5 }
      if (window.__player) window.__player.moving = true
      let n = 0; window.__r3f.scene.traverse((o) => { if (o.isLight && o.visible) n++ })
      window.__lc.min = Math.min(window.__lc.min, n); window.__lc.max = Math.max(window.__lc.max, n)
      window.__raf = requestAnimationFrame(step)
    }
    step()
  })
  await page.waitForTimeout(seconds * 1000)

  const out = await page.evaluate(() => {
    const travel = window.__links.filter((l) => l.phase === 'travel')
    const byTag = {}
    for (const l of travel) byTag[l.tag] = (byTag[l.tag] || 0) + 1
    // For terrain: are the travel define-strings ones we ALSO saw at load
    // (=genuine recompile) or brand new (=coverage gap)?
    const loadTerrain = new Set(window.__links.filter((l) => l.phase === 'load' && l.tag === 'TERRAIN(vision)').map((l) => l.defs))
    const travelTerrain = travel.filter((l) => l.tag === 'TERRAIN(vision)')
    let recompiled = 0, newVariant = 0
    for (const l of travelTerrain) (loadTerrain.has(l.defs) ? recompiled++ : newVariant++)
    return { travelCount: travel.length, lc: window.__lc, byTag: Object.entries(byTag).sort((a, b) => b[1] - a[1]), terrain: { loadDistinct: loadTerrain.size, recompiled, newVariant }, envChanges: window.__envChanges, bgChanges: window.__bgChanges, shadowChanges: window.__shadowChanges, nuStacks: window.__nuStacks || [] }
  })
  console.log(`programs linked during LOAD: ${loadCount}`)
  console.log(`programs linked during TRAVEL: ${out.travelCount}`)
  console.log(`visible light count during travel: min=${out.lc.min} max=${out.lc.max}  ${out.lc.min === out.lc.max ? '(stable)' : '*** CHURNING ***'}`)
  console.log('=== what recompiled while travelling (by material) ===')
  for (const [t, n] of out.byTag) console.log(`  x${String(n).padStart(4)}  ${t}`)
  console.log(`terrain: ${out.terrain.loadDistinct} distinct programs at load → during travel: ${out.terrain.recompiled} were RECOMPILES of load programs, ${out.terrain.newVariant} were NEW variants`)
  console.log(`during travel: scene.environment changed ${out.envChanges}x, background ${out.bgChanges}x, dir-shadow-map count ${out.shadowChanges}x`)
  console.log('=== stacks that set material.needsUpdate during travel ===')
  out.nuStacks.forEach((s, i) => console.log(`[${i}] ${s}`))
} finally {
  await browser.close()
}
