import { useEffect, useState } from 'react'
import { isStarted, startGame, subscribeStarted } from '../world/gameStore'
import { setPaused } from '../world/pauseStore'

export function StartScreen() {
  const [started, setStarted] = useState<boolean>(isStarted())
  useEffect(() => subscribeStarted(setStarted), [])

  if (started) return null

  const play = () => {
    startGame()
    setPaused(false) // unfreeze the world
  }

  return (
    <div className="start-screen">
      <div className="start-card">
        <div className="start-kicker">A LOW-POLY ADVENTURE</div>
        <h1 className="start-title">TILEWORLD</h1>
        <p className="start-tagline">Drive the orks from the land.</p>
        <button className="start-play" onClick={play}>
          ▶ Play
        </button>
        <div className="start-controls">
          <span><b>WASD</b> move</span>
          <span><b>Shift</b> sprint</span>
          <span><b>Space</b> jump</span>
          <span><b>Mouse</b> look</span>
          <span><b>Click</b> attack</span>
          <span><b>E</b> shop</span>
          <span><b>Esc</b> pause</span>
        </div>
      </div>
    </div>
  )
}
