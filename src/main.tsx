import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'

// Dev-only: keep the rAF loop running in backgrounded preview windows so screenshots
// don't capture an empty canvas.
if (import.meta.env.DEV) {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false })
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
