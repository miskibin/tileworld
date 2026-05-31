import { useEffect, useState } from 'react'
import { getPlayer } from '../world/playerStore'
import { getWave, subscribeWave, requestPrepSkip, type WaveProgress } from '../world/waveStore'
import { getCastle, subscribeCastle, type CastleState } from '../world/castleStore'
import { getPhase, subscribePhase, type GamePhase } from '../world/gameStore'
import { playVictory } from '../audio/sfx'

export function Objective() {
  const [phase, setPhase] = useState<GamePhase>(() => getPhase())
  const [wave, setWave] = useState<WaveProgress>(() => getWave())
  const [castle, setCastle] = useState<CastleState>(() => getCastle())

  useEffect(() => subscribePhase(setPhase), [])
  useEffect(() => subscribeWave((s) => setWave({ ...s })), [])
  useEffect(() => subscribeCastle((s) => setCastle({ ...s })), [])

  // Release pointer-lock + play fanfare on victory.
  useEffect(() => {
    if (phase !== 'victory') return
    if (document.pointerLockElement) document.exitPointerLock()
    playVictory()
  }, [phase])

  useEffect(() => {
    if (phase !== 'defeat') return
    if (document.pointerLockElement) document.exitPointerLock()
  }, [phase])

  if (phase === 'menu') return null

  if (phase === 'victory') {
    const p = getPlayer()
    return (
      <div className="victory-screen">
        <div className="victory-title">Victory!</div>
        <div className="victory-sub">Every wave repelled. The keep stands.</div>
        <div className="victory-stats">
          <span>Level {p.level}</span>
          <span>{p.gold} ★ gold</span>
          <span>{wave.total} waves survived</span>
        </div>
        <button className="victory-again" onClick={() => location.reload()}>
          Play Again
        </button>
      </div>
    )
  }

  if (phase === 'defeat') {
    return (
      <div className="victory-screen defeat-screen">
        <div className="victory-title">The Keep Has Fallen</div>
        <div className="victory-sub">You held until wave {Math.max(1, wave.index + 1)} of {wave.total}.</div>
        <button className="victory-again" onClick={() => location.reload()}>
          Play Again
        </button>
      </div>
    )
  }

  // prep / wave: banner + castle HP bar.
  const hpPct = Math.max(0, (castle.hp / castle.maxHp) * 100)
  const secs = Math.max(0, wave.prepSecondsLeft)
  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  return (
    <div className="objective-banner">
      <span className="objective-label">
        {phase === 'prep'
          ? `Wave ${wave.index + 2} incoming…`
          : `Wave ${wave.index + 1} / ${wave.total}`}
      </span>
      {phase === 'prep' && (
        <div className="prep-timer">
          <span className="prep-clock">☀ {mmss}</span>
          <button className="prep-skip" onClick={() => requestPrepSkip()}>
            Skip ▶
          </button>
        </div>
      )}
      {phase === 'wave' && (
        <span className="objective-count">{wave.enemiesAlive} orks left</span>
      )}
      <div className="castle-hp">
        <span className="castle-hp-label">Keep</span>
        <div className="castle-hp-track">
          <div className="castle-hp-fill" style={{ width: `${hpPct}%` }} />
        </div>
      </div>
    </div>
  )
}
