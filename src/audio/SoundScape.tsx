import { useEffect } from 'react'
import { useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { setListener, getListener, loadBuffer } from './audio'
import { useAudioEnabled } from './useAudioEnabled'
import { subscribePaused } from '../world/pauseStore'

export function SoundScape() {
  const camera = useThree((s) => s.camera)
  const enabled = useAudioEnabled()

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

  // Play/stop forest ambient + bg music in response to enabled flag
  useEffect(() => {
    if (!enabled) return
    const l = getListener()
    if (!l) return
    let cancelled = false
    let forest: THREE.Audio | null = null
    let music: THREE.Audio | null = null

    Promise.all([
      loadBuffer('/audio/forest-ambient.mp3'),
      loadBuffer('/audio/music.mp3'),
    ]).then(([forestBuf, musicBuf]) => {
      if (cancelled) return
      forest = new THREE.Audio(l)
      forest.setBuffer(forestBuf)
      forest.setLoop(true)
      forest.setVolume(0.32)
      forest.play()

      music = new THREE.Audio(l)
      music.setBuffer(musicBuf)
      music.setLoop(true)
      music.setVolume(0.22)
      music.play()
    })

    return () => {
      cancelled = true
      if (forest?.isPlaying) forest.stop()
      if (music?.isPlaying) music.stop()
    }
  }, [enabled])

  return null
}
