import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { setListener, getListener, loadBuffer, audioMix, registerLoops } from './audio'
import { useAudioEnabled } from './useAudioEnabled'
import { subscribePaused, isFrozen } from '../world/pauseStore'
import { getPhase } from '../world/gameStore'
import { isBossWave } from '../world/waveStore'
import { combatActive } from '../world/combatStore'

// Ease speed for the day↔night music crossfade (≈ a couple-second blend).
const CROSSFADE_RATE = 0.9
// Title-screen theme crossfade: the menu hymn fades out (and the gameplay loops
// fade in underneath) over ~1.5s once the player leaves the menu.
const MENU_FADE_RATE = 1.3
// The menu theme is the foreground while on the title screen, so it sits louder
// than the in-game background music (audioMix.music ≈ 0.22). Scaled relative to
// that slider (so mute/tuning still works) and clamped so a cranked slider can't
// distort.
const MENU_GAIN = 2.3
const MENU_MAX = 0.9
// Day combat layer: a drum loop that swells over the calm hymn while the hero is
// in a confirmed ork fight (debounced in combatStore), then fades back out.
const COMBAT_FADE_RATE = 1.6 // snappier in/out than the day↔night blend
const COMBAT_DUCK = 1 // fully replace the calm hymn with the combat track while fighting

export function SoundScape() {
  const camera = useThree((s) => s.camera)
  const enabled = useAudioEnabled()

  const forestRef = useRef<THREE.Audio | null>(null)
  const dayMusicRef = useRef<THREE.Audio | null>(null)
  const nightMusicRef = useRef<THREE.Audio | null>(null)
  // Boss-fight theme — replaces the dread track for the final (boss) wave only.
  const bossMusicRef = useRef<THREE.Audio | null>(null)
  // Day combat layer — tense loop that swells over the hymn while fighting a threat.
  const dayCombatRef = useRef<THREE.Audio | null>(null)
  // Title-screen theme — owns the mix while on the menu, fades out on Play.
  const menuMusicRef = useRef<THREE.Audio | null>(null)
  // 1 = on the title screen, 0 = in game. Eased toward the phase.
  const menuMix = useRef(1)
  // 0 = peaceful day theme, 1 = night/wave dread theme. Eased toward the phase.
  const nightMix = useRef(0)
  // 0 = calm day, 1 = mid day-fight. Eased toward combat recency.
  const combatMix = useRef(0)

  // Mount listener once
  useEffect(() => {
    const l = new THREE.AudioListener()
    camera.add(l)
    setListener(l)
    return () => {
      camera.remove(l)
      setListener(null)
    }
  }, [camera])

  // Browsers boot the AudioContext suspended until a user gesture, so the menu
  // theme (which plays before the Play click) would stay silent. Resume on the
  // first pointer/key interaction anywhere — idempotent, also hardens gameplay
  // audio against a context that never got kicked.
  useEffect(() => {
    if (!enabled) return
    const resume = () => {
      const l = getListener()
      if (l && l.context.state === 'suspended') void l.context.resume()
    }
    window.addEventListener('pointerdown', resume)
    window.addEventListener('keydown', resume)
    return () => {
      window.removeEventListener('pointerdown', resume)
      window.removeEventListener('keydown', resume)
    }
  }, [enabled])

  // Pause/resume the AudioContext when game pause state flips.
  useEffect(() => {
    return subscribePaused((paused) => {
      const l = getListener()
      if (!l) return
      if (paused) {
        if (l.context.state === 'running') void l.context.suspend()
      } else {
        if (l.context.state === 'suspended') void l.context.resume()
      }
    })
  }, [])

  // Play/stop forest ambient + day & night music loops in response to enabled.
  useEffect(() => {
    if (!enabled) return
    const l = getListener()
    if (!l) return
    let cancelled = false

    Promise.all([
      loadBuffer('/audio/forest-ambient.mp3'),
      loadBuffer('/audio/hurdy-gurdy-hymn.mp3'),
      loadBuffer('/audio/soot-banner-dread.mp3'),
      loadBuffer('/audio/orc-march-tallow.mp3'),
    ]).then(([forestBuf, dayBuf, nightBuf, bossBuf]) => {
      if (cancelled) return

      const forest = new THREE.Audio(l)
      forest.setBuffer(forestBuf)
      forest.setLoop(true)
      forest.setVolume(audioMix.ambient)
      forest.play()

      const dayMusic = new THREE.Audio(l)
      dayMusic.setBuffer(dayBuf)
      dayMusic.setLoop(true)
      dayMusic.setVolume(audioMix.music)
      dayMusic.play()

      // Night/wave theme — starts silent, crossfaded up in useFrame during waves.
      const nightMusic = new THREE.Audio(l)
      nightMusic.setBuffer(nightBuf)
      nightMusic.setLoop(true)
      nightMusic.setVolume(0)
      nightMusic.play()

      // Boss theme — also silent until the boss wave, where it stands in for the
      // dread track (the two night themes are mutually exclusive, see useFrame).
      const bossMusic = new THREE.Audio(l)
      bossMusic.setBuffer(bossBuf)
      bossMusic.setLoop(true)
      bossMusic.setVolume(0)
      bossMusic.play()

      forestRef.current = forest
      dayMusicRef.current = dayMusic
      nightMusicRef.current = nightMusic
      bossMusicRef.current = bossMusic

      // Debug panel retunes the day-music + ambient loops; the night track is
      // crossfaded against the same audioMix.music value in useFrame below.
      registerLoops(dayMusic, forest)
    })

    // Menu theme loads on its own (same resilience as the combat layer): it
    // starts at full menu level and is faded out by the useFrame on Play.
    loadBuffer('/audio/menu-theme.mp3')
      .then((buf) => {
        if (cancelled) return
        const menu = new THREE.Audio(l)
        menu.setBuffer(buf)
        menu.setLoop(true)
        menu.setVolume(0)
        menu.play()
        menuMusicRef.current = menu
      })
      .catch(() => {})

    // Day combat layer loads on its own so a missing file (track not recorded
    // yet) can't take down the rest of the music — it just stays absent and the
    // useFrame combat block no-ops.
    loadBuffer('/audio/day-combat.mp3')
      .then((buf) => {
        if (cancelled) return
        const dc = new THREE.Audio(l)
        dc.setBuffer(buf)
        dc.setLoop(true)
        dc.setVolume(0)
        dc.play()
        dayCombatRef.current = dc
      })
      .catch(() => {})

    return () => {
      cancelled = true
      registerLoops(null, null)
      if (forestRef.current?.isPlaying) forestRef.current.stop()
      if (dayMusicRef.current?.isPlaying) dayMusicRef.current.stop()
      if (nightMusicRef.current?.isPlaying) nightMusicRef.current.stop()
      if (bossMusicRef.current?.isPlaying) bossMusicRef.current.stop()
      if (dayCombatRef.current?.isPlaying) dayCombatRef.current.stop()
      if (menuMusicRef.current?.isPlaying) menuMusicRef.current.stop()
      forestRef.current = null
      dayMusicRef.current = null
      nightMusicRef.current = null
      bossMusicRef.current = null
      dayCombatRef.current = null
      menuMusicRef.current = null
    }
  }, [enabled])

  // Crossfade day↔night music with the game phase: the dread theme swells in
  // while a wave (night) is live and fades back to the day theme when cleared.
  // Reads audioMix.music live so the debug slider still scales both tracks.
  useFrame((_, dt) => {
    if (isFrozen()) return // match the world's freeze-gate; phase can't change while frozen
    const day = dayMusicRef.current
    const night = nightMusicRef.current
    const boss = bossMusicRef.current
    if (!day || !night || !boss) return

    // Title-screen theme: full while on the menu, crossfades out (gameplay loops
    // fade in underneath via `gameGain`) once the player hits Play.
    const inMenu = getPhase() === 'menu'
    menuMix.current += ((inMenu ? 1 : 0) - menuMix.current) * Math.min(1, dt * MENU_FADE_RATE)
    const menu = menuMusicRef.current
    if (menu) menu.setVolume(Math.min(MENU_MAX, audioMix.music * MENU_GAIN) * menuMix.current)
    // While fully on the menu, keep the gameplay loops silent and skip their mix.
    if (menuMix.current > 0.999 && inMenu) {
      day.setVolume(0)
      night.setVolume(0)
      boss.setVolume(0)
      const dc0 = dayCombatRef.current
      if (dc0) dc0.setVolume(0)
      return
    }
    const gameGain = 1 - menuMix.current

    const target = getPhase() === 'wave' ? 1 : 0
    nightMix.current += (target - nightMix.current) * Math.min(1, dt * CROSSFADE_RATE)
    const m = nightMix.current

    // Day combat swell: ramp toward "fought a threat in the last COMBAT_WINDOW
    // seconds". Audible only during the day (scaled by 1-m), and it ducks the
    // calm hymn underneath. The combat track is optional — skip if not loaded.
    const fighting = combatActive() ? 1 : 0
    combatMix.current += (fighting - combatMix.current) * Math.min(1, dt * COMBAT_FADE_RATE)
    const cm = combatMix.current
    // `gameGain` fades the whole gameplay bed in as the menu theme fades out.
    const dayLevel = audioMix.music * (1 - m) * gameGain
    // Only duck the calm hymn when a combat track is actually loaded to swell in
    // its place — otherwise (file missing / failed to decode) ducking would leave
    // dead silence for the whole day fight.
    const dc = dayCombatRef.current
    day.setVolume(dayLevel * (dc ? 1 - COMBAT_DUCK * cm : 1))
    if (dc) dc.setVolume(dayLevel * cm)

    // The boss fight swaps the dread theme for the orc march — only one night
    // track is ever audible, so the other stays muted while `m` swells.
    const bossFight = isBossWave()
    night.setVolume(audioMix.music * m * gameGain * (bossFight ? 0 : 1))
    boss.setVolume(audioMix.music * m * gameGain * (bossFight ? 1 : 0))
  })

  return null
}
