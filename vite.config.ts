/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: {
    // Logic-only suite: pure store/AI/pathfinding modules, no DOM or three.js
    // scene needed. SFX no-op without an AudioContext, so stores test as-is.
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
