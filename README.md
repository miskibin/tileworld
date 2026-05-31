# tileworld

A single-player 3D action-RPG that runs entirely in the browser. Explore a procedurally generated island — castle, villages, ork camps, wandering wildlife — fight orks, level up, loot chests, and spend gold at the shop and upgrade tree. No backend, no install beyond `npm`.

Built with **React 19 + react-three-fiber + three.js + TypeScript + Vite**. The map, scattered props, mobs, and most sound effects are generated deterministically at runtime.

## Run it

```bash
npm install
npm run dev      # dev server with hot reload → open the printed localhost URL
```

## Controls

| Action | Input |
|--------|-------|
| Move | WASD / arrow keys |
| Sprint | Shift |
| Jump | Space |
| Look | Mouse |
| Attack | Left-click |
| Interact (chests) | F |
| Hotbar | Number keys 1–5 / right-click |
| Pause | Esc |

## Scripts

```bash
npm run dev      # Vite dev server (HMR)
npm run build    # typecheck (tsc -b) + production bundle
npm run lint     # eslint
npm run preview  # serve the production build
```

`npm run build` is the correctness gate — it typechecks before bundling. There is no test suite; verify changes by running the game.

## Architecture

See [CLAUDE.md](CLAUDE.md) for a full map of the codebase — the store pattern, grid coordinate system, navigation/pathfinding stack, per-frame game loop, HUD, and audio.
