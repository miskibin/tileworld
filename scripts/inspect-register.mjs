// Preload for `npm run inspect`, imported BEFORE tsx so it can:
//  1. Point tsx at tsconfig.app.json (which sets jsx: react-jsx — the automatic
//     runtime). Without it tsx emits classic React.createElement and mounting
//     fails with "React is not defined".
//  2. Register the inspect-env loader hook (see inspect-env.mjs), which strips
//     Vite-only `import.meta.env` references so store-importing models mount
//     headless under plain Node.
import { register } from 'node:module'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
process.env.TSX_TSCONFIG_PATH = join(here, '..', 'tsconfig.app.json')

register('./inspect-env.mjs', import.meta.url)
