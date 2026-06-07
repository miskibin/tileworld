import { useEffect, useRef, useState } from 'react'
import { getPlayer } from '../world/playerStore'
import { getWave, subscribeWave, requestPrepSkip, type WaveProgress } from '../world/waveStore'
import { getCastle, subscribeCastle, type CastleState } from '../world/castleStore'
import { getPhase, setPhase, subscribePhase, getDefeatReason, type GamePhase } from '../world/gameStore'
import { getStandingVillagerCount, subscribeVillagers } from '../world/villagerStore'
import { resetRun } from '../world/runReset'
import { bumpRun, requestContinue } from '../world/runStore'
import { getSaveMeta } from '../world/saveGame'
import { playVictory } from '../audio/sfx'

// End-screen actions: an in-memory restart (no page reload). resetRun() wipes the
// run state; setPhase points the fresh world at prep (play) or the title (menu);
// bumpRun() remounts <World> so every entity re-seeds against the clean stores.
function playAgain(): void {
  resetRun()
  setPhase('prep')
  bumpRun()
}
function returnToMenu(): void {
  resetRun()
  setPhase('menu')
  bumpRun()
}
// Resume from the last dawn checkpoint after a defeat. Same clean remount as the
// others, but requestContinue() tells RunLoad (inside the fresh <World>) to restore
// the saved run once it has mounted, instead of starting over. Phase stays 'defeat'
// through the remount — the overlay hides it — until loadGame() switches to prep.
function continueFromDawn(): void {
  requestContinue()
  resetRun()
  bumpRun()
}

export function Objective() {
  const [phase, setPhase] = useState<GamePhase>(() => getPhase())
  const [wave, setWave] = useState<WaveProgress>(() => getWave())
  const [castle, setCastle] = useState<CastleState>(() => getCastle())
  const [townsfolk, setTownsfolk] = useState<number>(() => getStandingVillagerCount())
  // "Keep under attack" flash: raised whenever the keep's HP drops, cleared a
  // couple seconds after the last hit. Drives the alert badge + red bar + the
  // screen-edge pulse so the player always sees when the keep is being chipped.
  const [underAttack, setUnderAttack] = useState(false)
  const prevHpRef = useRef(getCastle().hp)
  const atkTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => subscribePhase(setPhase), [])
  useEffect(() => subscribeWave((s) => setWave({ ...s })), [])
  useEffect(() => {
    const unsub = subscribeCastle((s) => {
      setCastle({ ...s })
      if (s.hp < prevHpRef.current) {
        setUnderAttack(true)
        clearTimeout(atkTimer.current)
        atkTimer.current = setTimeout(() => setUnderAttack(false), 2200)
      }
      prevHpRef.current = s.hp
    })
    return () => {
      unsub()
      clearTimeout(atkTimer.current)
    }
  }, [])
  useEffect(() => subscribeVillagers(() => setTownsfolk(getStandingVillagerCount())), [])

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
        <div className="victory-actions">
          <button className="victory-again" onClick={playAgain}>
            Play Again
          </button>
          <button className="victory-menu" onClick={returnToMenu}>
            Main Menu
          </button>
        </div>
      </div>
    )
  }

  if (phase === 'defeat') {
    const bloodline = getDefeatReason() === 'bloodline'
    const p = getPlayer()
    // The dawn checkpoint survives a defeat, so offer a direct resume to its day.
    const save = getSaveMeta()
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
        <div className="victory-stats">
          <span>Level {p.level}</span>
          <span>{p.gold} ★ gold</span>
          <span>Reached wave {Math.max(1, wave.index + 1)} / {wave.total}</span>
        </div>
        <div className="victory-actions">
          {save && (
            <button className="victory-again" onClick={continueFromDawn}>
              Resume — Day {save.night}
            </button>
          )}
          <button className={save ? 'victory-menu' : 'victory-again'} onClick={playAgain}>
            New Game
          </button>
          <button className="victory-menu" onClick={returnToMenu}>
            Main Menu
          </button>
        </div>
      </div>
    )
  }

  // prep / wave: banner + castle HP bar.
  const hpPct = Math.max(0, (castle.hp / castle.maxHp) * 100)
  const secs = Math.max(0, wave.prepSecondsLeft)
  const mmss = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
  return (
    <>
      {underAttack && <div className="keep-alert-vignette" aria-hidden="true" />}
      <div className={`objective-banner${underAttack ? ' is-alarm' : ''}`}>
      <span className="objective-label">
        {phase === 'prep'
          ? `Day ${wave.index + 2} — ride out & prepare`
          : `Wave ${wave.index + 1} / ${wave.total}`}
      </span>
      {phase === 'prep' && (
        <div className="prep-timer">
          <span className="prep-clock">☀ {mmss}</span>
          <button className="prep-skip" onClick={() => requestPrepSkip()} title="Or ring the courtyard bell">
            Begin night ▶
          </button>
        </div>
      )}
      {phase === 'wave' && (
        <span className="objective-count">{wave.enemiesAlive} orks left</span>
      )}
      <div className={`castle-hp${underAttack ? ' is-hit' : ''}`}>
        <span className="castle-hp-label">Keep</span>
        <div className="castle-hp-track">
          <div className="castle-hp-fill" style={{ width: `${hpPct}%` }} />
        </div>
        {underAttack && <span className="keep-alert">⚠ Under attack</span>}
      </div>
      {/* Townsfolk = the run's pool of lives. Each death passes the blade to one
          of them; when none remain, the next fall ends the run. */}
      <span className={`objective-townsfolk${townsfolk === 0 ? ' is-last' : ''}`}>
        🛡 {townsfolk} {townsfolk === 1 ? 'heir' : 'heirs'}
      </span>
      </div>
    </>
  )
}
