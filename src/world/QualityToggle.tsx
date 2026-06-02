import { useEffect } from 'react'
import { toggleQuality } from './qualityStore'

// Press 'G' to flip render quality (High ↔ Low). No on-screen chrome — the
// StartScreen controls list documents the key. Ignores the keypress while typing
// in an input (there are none today, but it keeps the listener well-behaved).
export function QualityToggle() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'g' && e.key !== 'G') return
      if (e.repeat) return
      const el = document.activeElement
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return
      toggleQuality()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return null
}
