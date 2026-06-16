# tileworld

> [!IMPORTANT]
> **This is the original three.js / TypeScript prototype. The game has since been ported to Rust, and _all active development now happens there_ — as a new game called **Warbell**.**
>
> - ▶️ **Play this original in your browser:** **https://miskibin.github.io/tileworld/**
> - 🦀 **Warbell — the current Rust / Bevy game:** **[play & download](https://miskibin.github.io/warbell-game/)** · **[warbell-game repo](https://github.com/miskibin/warbell-game)**
>
> Everything below documents this original TS version. It still runs and plays fine — it's just no longer where the game grows. See the [side-by-side comparison](#threejs-original--rust-rebuild) below.

A single-player 3D action-RPG that runs entirely in the browser — explore a procedurally generated island, drive back the orks, and grow your castle. No backend, no install beyond `npm`.

![TileWorld — exploring the forest](docs/screenshots/forest.png)

Built with **React 19 + react-three-fiber + three.js + TypeScript + Vite**. The map, scattered props, mobs, and most sound effects are generated deterministically at runtime. Days are a free-roam prep window — mine, forage, hunt, and rescue across the biomes — then ring the war bell and hold the castle through the night.

## three.js original → Rust rebuild

Same game, rebuilt in **Bevy + Rust** as **[Warbell](https://miskibin.github.io/warbell-game/)** — chasing lighting, density, and combat fidelity the browser couldn't reach. **This repo (three.js)** on the left, **Warbell (Rust)** on the right.

<table>
  <tr><td colspan="2" align="center"><sub><b>Forest</b></sub></td></tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/forest.png" alt="Forest — three.js original"></td>
    <td width="50%"><img src="https://miskibin.github.io/warbell-game/screenshots/forest-biome.png" alt="Forest — Warbell (Rust)"></td>
  </tr>
  <tr><td colspan="2" align="center"><sub><b>Desert</b></sub></td></tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/desert.png" alt="Desert — three.js original"></td>
    <td width="50%"><img src="https://miskibin.github.io/warbell-game/screenshots/desert-biome.png" alt="Desert — Warbell (Rust)"></td>
  </tr>
  <tr><td colspan="2" align="center"><sub><b>Snowfields</b></sub></td></tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/snow.png" alt="Snow — three.js original"></td>
    <td width="50%"><img src="https://miskibin.github.io/warbell-game/screenshots/snow-biome.png" alt="Snow — Warbell (Rust)"></td>
  </tr>
  <tr><td colspan="2" align="center"><sub><b>Rock highlands</b></sub></td></tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/rock.png" alt="Rock — three.js original"></td>
    <td width="50%"><img src="https://miskibin.github.io/warbell-game/screenshots/rock-biome.png" alt="Rock — Warbell (Rust)"></td>
  </tr>
  <tr><td colspan="2" align="center"><sub><b>Swamp</b></sub></td></tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/swamp.png" alt="Swamp — three.js original"></td>
    <td width="50%"><img src="https://miskibin.github.io/warbell-game/screenshots/swamp-fortress.png" alt="Swamp — Warbell (Rust)"></td>
  </tr>
  <tr><td colspan="2" align="center"><sub><b>The keep</b></sub></td></tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/castle.png" alt="Keep — three.js original"></td>
    <td width="50%"><img src="https://miskibin.github.io/warbell-game/screenshots/castle-after.png" alt="Keep — Warbell (Rust)"></td>
  </tr>
</table>

## Run it

```bash
npm install
npm run dev      # dev server with hot reload → open the printed localhost URL
```

Prefer a desktop build? Grab the Windows installer (`.msi` / `.exe`) from the [latest release](https://github.com/miskibin/tileworld/releases/latest).

## Biomes

One island, six distinct regions — each answers a different need for the night ahead.

<table>
  <tr>
    <td width="50%"><img src="docs/screenshots/forest.png" alt="Forest"><br><b>Forest</b> — dense low woods to the west; shake the trees for apples.</td>
    <td width="50%"><img src="docs/screenshots/desert.png" alt="Desert"><br><b>Desert</b> — northeastern dunes dotted with ork camps; clear the guards to free captives who join your muster.</td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/snow.png" alt="Snowfields"><br><b>Snowfields</b> — the frozen north under a low white massif, scattered with pines and chests.</td>
    <td width="50%"><img src="docs/screenshots/swamp.png" alt="Swamp"><br><b>Swamp</b> — a murky southern marsh; forage marsh herbs, but mind the slow and the poison.</td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/screenshots/rock.png" alt="Rock highlands"><br><b>Rock highlands</b> — jagged eastern cliffs; mine ore boulders for the stone your walls and towers cost.</td>
    <td width="50%"><img src="docs/screenshots/castle.png" alt="The keep"><br><b>Grass heartland</b> — the open green centre where your keep stands and the muster ground forms.</td>
  </tr>
</table>

## Controls

| Action | Input |
|--------|-------|
| Move | WASD / arrow keys |
| Sprint | Shift |
| Jump | Space |
| Look | Mouse |
| Attack | Left-click |
| Block | Right-click |
| Interact (bell, chests, signposts) | E |
| Eat | Q |
| Buffs (resist / power / haste) | Z / X / C |
| Bag | I |
| Pause | Esc |

## Scripts

```bash
npm run dev      # Vite dev server (HMR)
npm run build    # typecheck (tsc -b) + production bundle — the correctness gate
npm run lint     # eslint
npm test         # vitest — pure-logic unit tests (pathfinding, waves, stores)
npm run preview  # serve the production build
npm run shot     # headless screenshot of the running dev server (Playwright + SwiftShader)
```

`npm run build` is the correctness gate (it typechecks before bundling); `npm test` covers the deterministic logic. Anything visual is verified by running the game.

## Architecture

See [CLAUDE.md](CLAUDE.md) for a full map of the codebase — the hand-rolled store pattern, the grid coordinate system, the navigation/pathfinding stack, the per-frame game loop, the HUD, and the procedural audio.
