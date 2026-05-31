import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { setListener, getListener, loadBuffer, audioMix, registerLoops } from './audio'
import { useAudioEnabled } from './useAudioEnabled'
import { subscribePaused } from '../world/pauseStore'
import { getPhase } from '../world/gameStore'

// Ease speed for the day↔night music crossfade (≈ a couple-second blend).
const CROSSFADE_RATE = 0.9

export function SoundScape() {
  const camera = useThree((s) => s.camera)
  const enabled = useAudioEnabled()

  const forestRef = useRef<THREE.Audio | null>(null)
  const dayMusicRef = useRef<THREE.Audio | null>(null)
  const nightMusicRef = useRef<THREE.Audio | null>(null)
  // 0 = peaceful day theme, 1 = night/wave dread theme. Eased toward the phase.
  const nightMix = useRef(0)

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
    ]).then(([forestBuf, dayBuf, nightBuf]) => {
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

      forestRef.current = forest
      dayMusicRef.current = dayMusic
      nightMusicRef.current = nightMusic

      // Debug panel retunes the day-music + ambient loops; the night track is
      // crossfaded against the same audioMix.music value in useFrame below.
      registerLoops(dayMusic, forest)
    })

    return () => {
      cancelled = true
      registerLoops(null, null)
      if (forestRef.current?.isPlaying) forestRef.current.stop()
      if (dayMusicRef.current?.isPlaying) dayMusicRef.current.stop()
      if (nightMusicRef.current?.isPlaying) nightMusicRef.current.stop()
      forestRef.current = null
      dayMusicRef.current = null
      nightMusicRef.current = null
    }
  }, [enabled])

  // Crossfade day↔night music with the game phase: the dread theme swells in
  // while a wave (night) is live and fades back to the day theme when cleared.
  // Reads audioMix.music live so the debug slider still scales both tracks.
  useFrame((_, dt) => {
    const day = dayMusicRef.current
    const night = nightMusicRef.current
    if (!day || !night) return
    const target = getPhase() === 'wave' ? 1 : 0
    nightMix.current += (target - nightMix.current) * Math.min(1, dt * CROSSFADE_RATE)
    const m = nightMix.current
    day.setVolume(audioMix.music * (1 - m))
    night.setVolume(audioMix.music * m)
  })

  return null
}
