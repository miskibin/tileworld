# Web-sourced audio — accepted & wired

12 voices/SFX downloaded from OpenGameArt, accepted, and wired into the stores.
Files live in [`public/audio/`](../public/audio/) and play through `playSfx` in
[sfx.ts](../src/audio/sfx.ts). All non-spatial clips are kept quiet (base vol
0.22–0.5) so they sit under combat.

| File | Trigger | Wired in | License |
|------|---------|----------|---------|
| player-attack-grunt.ogg | Hero melee swing (~1 in 3, so it punctuates) | [Character.tsx](../src/world/Character.tsx) `playPlayerAttack` | CC0 |
| player-hurt.ogg | Hero takes a non-fatal hit | [playerStore.ts](../src/world/playerStore.ts) `damagePlayer` | CC0 |
| player-death-scream.ogg | Hero HP hits 0 (once) | [playerStore.ts](../src/world/playerStore.ts) `damagePlayer` | CC0 |
| monster-snarl.ogg | Ork aggro/attack (added to grunt pool) | [sfx.ts](../src/audio/sfx.ts) `ORK_GRUNTS` | CC0 |
| monster-growl.ogg | Ork aggro/attack (added to grunt pool) | [sfx.ts](../src/audio/sfx.ts) `ORK_GRUNTS` | CC0 |
| monster-roar-big.ogg | Heavy ork roar/charge (added to roar pool) | [sfx.ts](../src/audio/sfx.ts) `ORK_ROARS` | CC0 |
| wave-start-roar.ogg | A wave begins | [waveStore.ts](../src/world/waveStore.ts) `beginWave` | CC0 |
| gold-pickup.ogg | Gold gained (replaces synth blips) | [playerStore.ts](../src/world/playerStore.ts) `addGold` | CC0 |
| level-up-orchestra.wav | Level up (replaces synth arpeggio) | [playerStore.ts](../src/world/playerStore.ts) `addXp` | **CC-BY 3.0** |
| ability-cast.ogg | Hotbar consumable used | [inventoryStore.ts](../src/world/inventoryStore.ts) `activateSlot` | CC0 |
| shop-open.ogg | Merchant shop panel opens | [shopStore.ts](../src/world/shopStore.ts) `openShop` | CC0 |
| menu-select.ogg | Upgrade-tree purchase confirmed | [upgradeStore.ts](../src/world/upgradeStore.ts) `purchase` | CC0 |

Each sampled clip degrades to a procedural synth (or silent no-op) if the file
fails to load, matching the existing creature-voice pattern.

## Attribution (REQUIRED — ships with the game)

- **level-up-orchestra.wav** — "Level Up Sound Effects" by **Bart Kelsey**, CC-BY 3.0 — https://opengameart.org/content/level-up-sound-effects

## Sources (CC0 — attribution optional, kept for provenance)

- Hero + monster voices, gold — "80 CC0 creature SFX" / "80 CC0 RPG SFX" by **rubberduck** — https://opengameart.org/content/80-cc0-creature-sfx · https://opengameart.org/content/80-cc0-rpg-sfx

> Not sourced this pass: a CC0 brass war-horn (wave-start uses a horde roar instead),
> and a male-voice "effort grunt" pack (CC-BY-SA, outside the chosen CC0+CC-BY scope).
