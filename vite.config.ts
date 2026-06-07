/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Relative asset paths so the built dist/ runs from any sub-path: an itch.io
  // zip (served from a hashed folder) and the Tauri webview (loads from file://)
  // both need './' rather than the default '/'.
  base: './',
  test: {
    // Logic-only suite: pure store/AI/pathfinding modules, no DOM or three.js
    // scene needed. SFX no-op without an AudioContext, so stores test as-is.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
