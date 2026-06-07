import { useEffect, useState } from 'react'
import { isStarted, setPhase, subscribePhase } from '../world/gameStore'
import { openSettings } from '../world/settingsStore'
import { getSaveMeta, loadGame, type SaveMeta } from '../world/saveGame'
import { getQuality, subscribeQuality, type Quality } from '../world/qualityStore'
import {
  getDifficulty,
  setDifficulty,
  subscribeDifficulty,
  type Difficulty,
} from '../world/difficultyStore'

// Keycap + label pairs for the controls legend. Multi-key entries render one
// <kbd> chip per key (Z / X / C), single-string ones a single chip.
const CONTROLS: { keys: string[]; label: string }[] = [
  { keys: ['WASD'], label: 'Move' },
  { keys: ['Shift'], label: 'Sprint' },
  { keys: ['Space'], label: 'Jump' },
  { keys: ['Mouse'], label: 'Look' },
  { keys: ['L-Click'], label: 'Attack' },
  { keys: ['R-Click'], label: 'Block' },
  { keys: ['Q'], label: 'Eat' },
  { keys: ['Z', 'X', 'C'], label: 'Buffs' },
  { keys: ['E'], label: 'Interact' },
  { keys: ['I'], label: 'Bag' },
  { keys: ['Esc'], label: 'Pause' },
]

const DIFFICULTIES: { id: Difficulty; label: string }[] = [
  { id: 'easy', label: 'Easy' },
  { id: 'normal', label: 'Normal' },
  { id: 'hard', label: 'Hard' },
]

// Quit only makes sense in the Tauri desktop shell — a browser tab can't close
// itself unless script-opened. Detect the webview and hide the button otherwise.
const IS_TAURI =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI__' in window)

export function StartScreen() {
  const [started, setStarted] = useState<boolean>(isStarted())
  const [difficulty, setDifficultyState] = useState<Difficulty>(getDifficulty())
  // On 'low', skip leaning on the live render behind the menu — show a cheap
  // static gradient instead so weak GPUs aren't hammered on the title screen.
  const [quality, setQualityState] = useState<Quality>(getQuality())
  // Snapshot whether a resumable checkpoint exists (read once — it only changes
  // while a run is live, behind this screen).
  const [saveMeta] = useState<SaveMeta | null>(getSaveMeta)

  useEffect(() => subscribePhase((p) => setStarted(p !== 'menu')), [])
  useEffect(() => subscribeDifficulty(setDifficultyState), [])
  useEffect(() => subscribeQuality(setQualityState), [])

  if (started) return null

  // Start a fresh run (its first dawn autosaves over any existing checkpoint).
  const play = () => setPhase('prep')
  // Resume the saved checkpoint — loadGame remounts the world at that dawn.
  const resume = () => loadGame()
  const quit = () => window.close()

  return (
    <div className="start-screen start-cinematic">
      {quality === 'low' && <div className="start-static-bg" />}

      <div className="start-menu">
        <div className="start-kicker">A LOW-POLY ADVENTURE</div>
        <h1 className="start-title">
          <span>TILE</span>
          <span>WORLD</span>
        </h1>
        <p className="start-tagline">Drive the orks from the land.</p>

        {saveMeta ? (
          <>
            <button className="start-play" onClick={resume}>
              <span>▶ Continue · Night {saveMeta.night}</span>
            </button>
            <button className="start-opt start-newgame" onClick={play}>
              <span>New Game</span>
            </button>
          </>
        ) : (
          <button className="start-play" onClick={play}>
            <span>▶ Play</span>
          </button>
        )}

        <div className="start-difficulty">
          <span className="start-diff-label">Difficulty</span>
          <div className="seg" role="group" aria-label="Difficulty">
            {DIFFICULTIES.map((d) => (
              <button
                key={d.id}
                className={'seg-btn' + (d.id === difficulty ? ' seg-on' : '')}
                onClick={() => setDifficulty(d.id)}
                aria-pressed={d.id === difficulty}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div className="start-actions">
          <button className="start-opt" onClick={openSettings}>
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Settings</span>
          </button>
          {IS_TAURI && (
            <button className="start-opt" onClick={quit}>
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <path d="M16 17l5-5-5-5M21 12H9" />
              </svg>
              <span>Quit</span>
            </button>
          )}
        </div>
      </div>

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
  )
}
