import { useEffect, useState } from 'react'
import { isStarted, setPhase, subscribePhase } from '../world/gameStore'

// Keycap + label pairs for the controls legend. Multi-key entries render one
// <kbd> chip per key (Z / X / C), single-string ones a single chip.
const CONTROLS: { keys: string[]; label: string }[] = [
  { keys: ['WASD'], label: 'Move' },
  { keys: ['Shift'], label: 'Sprint' },
  { keys: ['Space'], label: 'Jump' },
  { keys: ['Mouse'], label: 'Look' },
  { keys: ['Ctrl', 'Scroll'], label: 'Zoom' },
  { keys: ['L-Click'], label: 'Attack' },
  { keys: ['R-Click'], label: 'Block' },
  { keys: ['Q'], label: 'Eat' },
  { keys: ['Z', 'X', 'C'], label: 'Buffs' },
  { keys: ['I'], label: 'Bag' },
  { keys: ['E'], label: 'Interact' },
  { keys: ['Esc'], label: 'Pause' },
  { keys: ['G'], label: 'Graphics' },
]

export function StartScreen() {
  const [started, setStarted] = useState<boolean>(isStarted())
  useEffect(() => subscribePhase((p) => setStarted(p !== 'menu')), [])

  if (started) return null

  const play = () => {
    setPhase('prep')
  }

  return (
    <div className="start-screen">
      <div className="start-bg" />
      <div className="start-card">
        <div className="start-kicker">A LOW-POLY ADVENTURE</div>
        <h1 className="start-title">TILEWORLD</h1>
        <p className="start-tagline">Drive the orks from the land.</p>
        <div className="start-rule" />
        <button className="start-play" onClick={play}>
          <span>Play</span>
        </button>
        <div className="start-controls">
          {CONTROLS.map(({ keys, label }) => (
            <div className="ctrl" key={label}>
              <span className="ctrl-keys">
                {keys.map((k) => (
                  <kbd key={k}>{k}</kbd>
                ))}
              </span>
              <span className="ctrl-label">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
