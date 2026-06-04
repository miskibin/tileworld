import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'
import { requestTeleport, getPlayer } from './world/playerStore'

// Dev-only: keep the rAF loop running in backgrounded preview windows so screenshots
// don't capture an empty canvas.
if (import.meta.env.DEV) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
  // Debug/screenshot affordance: jump the hero to a grid tile so a headless shot
  // can frame far-flung biome features (ore foot, ork-camp cages, swamp herbs).
  ;(window as unknown as { tp?: (x: number, z: number) => void }).tp = (x, z) => requestTeleport(x, z)
  ;(window as unknown as { ppos?: () => { x: number; z: number } }).ppos = () => {
    const p = getPlayer()
    return { x: Math.round(p.x * 10) / 10, z: Math.round(p.z * 10) / 10 }
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
