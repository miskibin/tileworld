# AGENTS.md

See `README.md` and `CLAUDE.md` for the architecture overview and the full list of
standard commands (`npm run dev` / `build` / `lint` / `test` / `preview` / `inspect` / `shot`).

## Cursor Cloud specific instructions

- **What this is:** a single-player browser 3D game (React 19 + react-three-fiber + three.js + Vite).
  There is **no backend, database, or external service** — the only thing to "run" is the Vite dev
  server. Dependencies are plain npm (`package-lock.json`); the update script runs `npm install`.
- **Run it:** `npm run dev` serves on `http://localhost:5173/`. The game boots **paused behind a
  Start screen** — click **Play** to enter the world, then WASD + mouse-look to move/attack. Manual
  verification means watching it in a real browser (the scene is WebGL).
- **`npm run lint` currently exits non-zero** on a clean checkout: there is a pre-existing
  `react-hooks/set-state-in-effect` error in `src/world/Wildlife.tsx` (plus warnings). This is not
  caused by your changes — don't assume you broke the build if lint fails only on that error.
- **`npm test`** (vitest) is fast and covers pure logic only (pathfinding, waves, stores); it mocks
  the three.js layer, so it never validates anything visual. **`npm run build`** (`tsc -b` + bundle)
  is the real typecheck/correctness gate.
- **Screenshots:** the headless preview `screenshot` tool cannot capture this WebGL scene (see
  `CLAUDE.md`). Use `npm run shot` (Playwright + SwiftShader, dev server must be up) or test via a
  real browser.
- **Tauri desktop build** (`npm run tauri:*`, `src-tauri/`) needs a Rust toolchain that is **not**
  part of this setup; the browser dev server is the development target here.
