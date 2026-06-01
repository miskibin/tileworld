import { useEffect, useState } from 'react'
import { getPlayer } from '../world/playerStore'
import { getWave, subscribeWave, type WaveProgress } from '../world/waveStore'
import { getCastle, subscribeCastle, type CastleState } from '../world/castleStore'
import { getPhase, subscribePhase, getDefeatReason, type GamePhase } from '../world/gameStore'
import { getVillagers, subscribeVillagers } from '../world/villagerStore'
import { playVictory } from '../audio/sfx'

export function Objective() {
  const [phase, setPhase] = useState<GamePhase>(() => getPhase())
  const [wave, setWave] = useState<WaveProgress>(() => getWave())
  const [castle, setCastle] = useState<CastleState>(() => getCastle())
  const [townsfolk, setTownsfolk] = useState<number>(() => getVillagers().length)

  useEffect(() => subscribePhase(setPhase), [])
  useEffect(() => subscribeWave((s) => setWave({ ...s })), [])
  useEffect(() => subscribeCastle((s) => setCastle({ ...s })), [])
  useEffect(() => subscribeVillagers((l) => setTownsfolk(l.length)), [])

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
    const bloodline = getDefeatReason() === 'bloodline'
    return (
      <div className="victory-screen defeat-screen">
        <div className="victory-title">
          {bloodline ? 'The Line Has Ended' : 'The Keep Has Fallen'}
        </div>
        <div className="victory-sub">
          {bloodline
            ? `The last of your line fell with no one left to take up the blade — wave ${Math.max(1, wave.index + 1)} of ${wave.total}.`
            : `You held until wave ${Math.max(1, wave.index + 1)} of ${wave.total}.`}
        </div>
        <button className="victory-again" onClick={() => location.reload()}>
          Play Again
        </button>
      </div>
    )
  }

  // prep / wave: banner + castle HP bar.
  const hpPct = Math.max(0, (castle.hp / castle.maxHp) * 100)
  return (
    <div className="objective-banner">
      <span className="objective-label">
        {phase === 'prep'
          ? `Wave ${wave.index + 2} incoming…`
          : `Wave ${wave.index + 1} / ${wave.total}`}
      </span>
      {phase === 'wave' && (
        <span className="objective-count">{wave.enemiesAlive} orks left</span>
      )}
      <div className="castle-hp">
        <span className="castle-hp-label">Keep</span>
        <div className="castle-hp-track">
          <div className="castle-hp-fill" style={{ width: `${hpPct}%` }} />
        </div>
      </div>
      {/* Townsfolk = the run's pool of lives. Each death passes the blade to one
          of them; when none remain, the next fall ends the run. */}
      <span className={`objective-townsfolk${townsfolk === 0 ? ' is-last' : ''}`}>
        🛡 {townsfolk} {townsfolk === 1 ? 'heir' : 'heirs'}
      </span>
    </div>
  )
}
