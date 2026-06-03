// ESM loader preload for `npm run inspect`.
//
// The model components import game stores (playerStore etc.) that reference
// `import.meta.env.DEV` — a Vite-only define. Under plain Node/tsx,
// `import.meta.env` is `undefined`, so the property read throws at module load
// and the inspector can't mount ANY store-importing model (Ork, Chest, ...).
//
// This hook neutralizes those Vite-only references at transform time by string-
// replacing them with literals, so the headless inspector runs without a bundler.
// It chains after tsx (registered first on the command line), so the source it
// sees is already transpiled JS.
import { readFile } from 'node:fs/promises'

export async function load(url, context, nextLoad) {
  const result = await nextLoad(url, context)
  // Only touch our own source files (skip node_modules for speed/safety).
  if (
    (result.format === 'module' || result.format === 'commonjs') &&
    url.startsWith('file:') &&
    url.includes('/src/') &&
    !url.includes('/node_modules/')
  ) {
    let src = result.source
    if (src == null) {
      // Some loaders return null source; read it ourselves.
      src = await readFile(new URL(url), 'utf8')
    } else if (typeof src !== 'string') {
      src = Buffer.from(src).toString('utf8')
    }
    if (src.includes('import.meta.env')) {
      // import.meta.env.DEV / .PROD / .MODE -> safe literals; bare env -> {}.
      src = src
        .replace(/import\.meta\.env\.DEV/g, 'false')
        .replace(/import\.meta\.env\.PROD/g, 'true')
        .replace(/import\.meta\.env\.MODE/g, '"production"')
        .replace(/import\.meta\.env\b/g, '({})')
      return { ...result, source: src }
    }
  }
  return result
}
