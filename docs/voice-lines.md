# Hero voice lines

All spoken hero VO + the grunt takes, the exact lyrics, where the files live, and
what triggers each. Keep this in sync when you add/re-record a line — it's the
source of truth for matching the voice later.

## Voice + recording settings

- **Voice:** ElevenLabs — *"Sully - Mature, Deep and Intriguing"*, settings `sp100 s50 sb75 v3`.
- **Spoken-thought style prompt:** plain casual inner thought, neutral flat tone,
  fast natural delivery, mumbled offhand muttering to himself, dry, a cappella,
  no music, lowercase mumble, matter-of-fact. (Markup: `...` = trailing pause,
  `—` = clipped, `(…)` = quieter aside, `[sighs]` etc. = performance tag.)
- **Grunt style prompt:** male non-verbal vocalizations, gruff weary knight, short
  physical grunts/pain sounds, a cappella, no words, raw, not sung.
- **Post:** cut per line, ~30ms in / 80ms out fade, 44.1 kHz mp3. Spoken lines kept
  at source level (~−1 to −2 dB peak); the `narration` mix bus (0.57) sets final
  loudness. Grunts normalized to −3 dB peak.

## Routing

All hero VO goes through `sayHeroLine(key, url, {once, minGap})` in
[src/world/voiceStore.ts](../src/world/voiceStore.ts): single-mouth (never over another
line), 14 s global min-gap, once-per-run by default. Missing clips no-op and retry.
The single voice node + fade-stop live in [src/audio/audio.ts](../src/audio/audio.ts)
(`playVoice` / `stopVoice` / `isVoicePlaying`). Grunts use the pooled `playSfx` and
are gated by `canGrunt()` in [src/audio/sfx.ts](../src/audio/sfx.ts).

## Biome lines — `public/audio/vo/`

Fire once on first entry to a biome (`BIOME_VO` in Character.tsx). 'grass' = home,
suppressed until the hero has visited a wilderness biome first. Fade out if he
leaves the biome mid-line.

| File | Biome | Lyrics |
|---|---|---|
| `home.mp3` | grass (castle) | "Home, finally. Safe here. Guess I ring the bell when I'm ready, then they come." |
| `forest.mp3` | forest | "Oh, a forest. Looks like good hunting. Might find some apples too. Huh, prisoners. Maybe I can help them." |
| `desert.mp3` | desert | "Desert, great. It's hot. Something worth hunting out here, I bet. Are those captives? I could get them out." |
| `snow.mp3` | snow | "Brr, freezing up here. Bet there's beasts to hunt. Maybe loot in the ice. Someone's locked in that cage. Should I free them?" |
| `rock.mp3` | rock | "All this rock. That's a lot of ore. I could mine some. The walls could use the stone." |
| `swamp.mp3` | swamp | "Ugh, the marsh. [sighs] Slow going. Oh, herbs. Those patch me up, and the poison stings less. Shouldn't stay long, though." |

## Event lines — `public/audio/vo/`

| File | Key | Trigger | Lyrics |
|---|---|---|---|
| `night.mp3` | `night:<wave>` | ≤15 s left in the prep day | "Getting dark. Night soon. Maybe I wandered too far." |
| `chest.mp3` | `chest` (repeatable) | open a chest (F) | "Ooh, a chest." |
| `hurt.mp3` | `low-hp` (repeatable) | HP first drops under 30% | "I'm hurt. Ugh, could use some herbs." |
| `stone.mp3` | `first-stone` | first ore mined (`addStone`) | "Huh, stone. I could shore up the castle walls with this." |
| `rescue.mp3` | `first-rescue` | first camp cleared (CampCage) | "There, you're free. Get to the castle. You'll fight at my side now." |

## Player grunts — `public/audio/` (non-verbal, Sully grunt session)

Pooled, random take per event, low pitch jitter; `canGrunt()` blocks them while a
line plays and rate-limits to one per 1.6 s.

| Files | Function | Trigger | Sound |
|---|---|---|---|
| `player-swing-1.mp3`, `-2` | `playPlayerAttack` | ~1/3 of melee swings | exertion grunt — "hnf / hah / hyup" |
| `player-hurt-1.mp3`, `-2`, `-3` | `playPlayerHurtVoice` | taking a non-fatal hit | pain — "ugh / argh / nngh" |
| `player-jump-1.mp3` | `playPlayerJump` | ~40% of jumps | effort — "hup" |
| `player-death-1.mp3`, `-2` | `playPlayerDeath` | killing blow (via `playVoice`) | falling scream — "aaargh / gaaah" |

## Backlog — lines to record next (not wired yet)

Same voice/style. When recorded, drop in `public/audio/vo/` and wire via `sayHeroLine`.

- **first herb foraged** → `herb.mp3`: e.g. "herbs… these'll keep me on my feet at night."
- **first apple** → maybe covered by the forest line; skip unless wanted.
- **war bell, during prep** → `bell.mp3`: e.g. "the bell. ring it when i'm ready, and night comes early."
