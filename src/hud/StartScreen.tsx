import { useEffect, useState } from 'react'
import { isStarted, setPhase, subscribePhase } from '../world/gameStore'

export function StartScreen() {
  const [started, setStarted] = useState<boolean>(isStarted())
  useEffect(() => subscribePhase((p) => setStarted(p !== 'menu')), [])

  if (started) return null

  const play = () => {
    setPhase('prep')
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
          <span><b>Scroll</b> zoom</span>
          <span><b>L-Click</b> attack</span>
          <span><b>R-Click</b> block</span>
          <span><b>Q</b> use item</span>
          <span><b>E</b> interact</span>
          <span><b>Esc</b> pause</span>
          <span><b>G</b> graphics</span>
        </div>
      </div>
    </div>
  )
}
