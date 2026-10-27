# Audio pack: prompts and file spec

Put the files in `assets/audio/` with exactly these names (`.wav` or `.mp3`), then push (or run `python tools/pack_audio.py` to try them locally). Anything missing falls back to a built-in stand-in, so files can be added one at a time.

The packer trims silence from WAV files automatically, so exports from Google AI Studio can go in as they are.

## Voice-over with Google AI Studio (free: Create new dialog)

Open **aistudio.google.com → Playground → Generate speech** with **Gemini 3.8 Flash TTS**, then **Create new dialog**. Voice design needs a paid plan, but the 2,000+ built-in voices are free.

### 1. Pick the two voices (Speaker settings, right-hand panel)

Click each speaker card, search the voice library, press play to audition, and pick:

| Speaker | Role | Try first | Alternatives |
|---|---|---|---|
| Speaker 1 | **Lantern** (the oath) | **Neno** (deep and velvety) | Arlo (confident and clear), Jett (warm, deep), Cruz (poised) |
| Speaker 2 | **Ring** (the ring's AI) | **Kira** (cool and confident) | Hali (calm and comforting), Elio (calm), Olin (light and precise) |

### 2. One speech block per line, in this order

Use **+ Add speech block** for each line. Set the block's speaker, type the **Style** note into the Style box (it takes free text), and paste the line.

| # | Speaker | Style (free text) | Line |
|---|---|---|---|
| 1 | Ring | Calm status report, a little concern underneath, short pause between the sentences | Ring power at two percent. Recharge required. |
| 2 | Lantern | Slow and quiet, deep resolve, a breath after "day" | In brightest day... in blackest night, |
| 3 | Lantern | Firmer, steady and certain, a vow | No evil shall escape my sight. |
| 4 | Lantern | Lower and darker, almost a warning, draw out the last word | Let those who worship evil's might, |
| 5 | Lantern | Build from quiet intensity to full power; hold a beat after "power"; land the last words strong, not shouted | Beware my power... Green Lantern's light! |
| 6 | Ring | Clear and assured, a hint of quiet pride | Ring fully charged. |
| 7 | Ring | Warm, ceremonial and unhurried; small pause before "Earth's guardian" | Welcome, Green Lantern of Sector twenty-eight fourteen. Earth's guardian. |

The **Narration** style preset ("commanding, rich vocal modulation, dramatic pauses") is a good base for the oath lines if you prefer presets. Avoid expression tags such as `<laugh>`: they don't suit these lines.

### 3. Export

**Run**, listen, re-run any line you don't like, then download.

- **One file for the whole dialog:** save it as `assets/audio/vo_dialog.wav`. The packer splits it into the seven lines at the pauses between speakers, so leave a clear gap between blocks.
- **Or one file per line:** generate each block on its own and save it with its name: `vo_ring_low`, `vo_oath_1`, `vo_oath_2`, `vo_oath_3`, `vo_oath_4`, `vo_ring_full`, `vo_welcome` (`.wav`). A separate file always wins over the split dialog.

Once `vo_oath_1` exists, your new oath lines replace the old full oath track.

If a line is refused, use "Beware my power... the emerald light!" or "Welcome, Lantern of Sector twenty-eight fourteen. Earth's guardian." and update the matching text in `oath.js` / `script.js`.

## Sound effects (optional)

The loader already has built-in sound for all of these; a file only replaces it.

Written for ElevenLabs Sound Effects (set the duration), but any generator works. Add "no music".

| File | Length | Prompt |
|---|---|---|
| `sfx_pickup` | 0.6 s | Heavy metal ring lifted off a stone floor, brief soft scrape, then a faint low energy hum swells and fades. Close-up cinematic foley. |
| `sfx_knock_1`, `sfx_knock_2`, `sfx_knock_3` | 0.8 s | Heavy metal ring knocked hard against thick glass: sharp bright metallic clink with a short ring-out and a subtle low thud. Close, dry foley. (3 variations) |
| `sfx_drop` | 1.2 s | Metal ring dropped onto polished stone: two small bounces, then a short roll to a stop. Close foley. |
| `sfx_power_on` | 2.0 s | Alien power ring flickering to life: crackling electric sparks, a rising sci-fi energy charge and a soft bass swell, settling into a stable low hum. Cinematic. |
| `sfx_swish` | 0.5 s | Fast airy whoosh of a small object swung through the air. Cinematic. |
| `sfx_lock` | 1.2 s | Ring head sliding into a glass lens socket and locking: smooth seat, solid magnetic clunk, deep resonant energy thrum. Sci-fi, cinematic. |
| `sfx_release` | 1.0 s | Energy powering down: descending sci-fi hum fading out. Soft. |
| `sfx_oath_hit` | 3.0 s | Cinematic trailer hit: short reverse swell into a deep sub boom with a dark, smooth tail. |
| `sfx_riser` | 2.0 s exactly | Cinematic energy riser building intensity: rising synth pitch and swelling noise, ending abruptly at the peak. |
| `sfx_impact` | 5.0 s | Massive cinematic impact: deep sub boom, bright energy burst, long shimmering tail that decays. Trailer style. |
| `sfx_construct` | 0.8 s | Glowing energy construct materialising: quick bright shimmer sweep and a soft whoomp. |
| `sfx_ui` | 0.25 s | Subtle, soft glassy futuristic UI blip. |

## Loops

| File | Length | Prompt |
|---|---|---|
| `loop_ambience` | 30 s, seamless | Dark cosmic ambience: low sub drone, distant airy wind, faint shimmering high tones. No melody, no rhythm. Seamless loop. |
| `loop_charge` | 8 s, seamless | Deep pulsing green-energy hum, sci-fi power core charging, steady with subtle shimmer, no rhythm changes. Seamless loop. (Pitch rises with the charge in code.) |
| `loop_music` (optional) | 60 s, seamless | Dark heroic cinematic underscore: slow low strings and soft brass swells, hopeful but restrained, ~70 BPM. No percussion, no melody peaks. Seamless loop. Plays quietly; ducks under the voice. |
