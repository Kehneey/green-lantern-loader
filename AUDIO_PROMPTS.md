# Audio pack: prompts and file spec

Put the files in `assets/audio/` with exactly these names (`.mp3` or `.wav`). Anything missing falls back to a quiet built-in stand-in, so you can add files one at a time.

**Format:** WAV 48 kHz or MP3 at 192 kbps or higher.

- **Voice:** trim all silence at the start and end (word timing on screen is derived from the file length) and normalise to about −16 LUFS.
- **Sound effects:** peak at −1 dB.
- **Loops:** must loop seamlessly.

## Voice-over

### Oath voice (one voice for all four lines)

Voice design prompt (no character or brand names, so generators don't block it):

> A deep, warm male baritone, late thirties, American. Calm and determined, like a test pilot taking a solemn vow before a mission. Sincere and natural, not theatrical. Clean studio recording, close microphone, no background sound, no music.

Settings: Stability ~50, Similarity ~75, Style ~35, Speed 0.9.

| File | Line | Direction |
|---|---|---|
| `vo_oath_1` | In brightest day, in blackest night, | Quiet, measured; small pause after "day" |
| `vo_oath_2` | No evil shall escape my sight. | Firmer, steady |
| `vo_oath_3` | Let those who worship evil's might, | Lower, darker; slow "might" |
| `vo_oath_4` | Beware my power... Green Lantern's light! | Builds; held pause after "power"; last words strong, not shouted |

### Ring voice (AI status voice)

> A calm, precise artificial assistant voice. Mid-pitched, neutral, emotionless, crisp diction with a slightly synthetic edge, speaking short status reports. Clean studio recording, no background sound.

Settings: Stability ~80, Style 0, Speed 0.95.

| File | Line |
|---|---|
| `vo_ring_low` | Ring power at two percent. Recharge required. |
| `vo_ring_full` | Ring fully charged. |
| `vo_welcome` | Welcome, Green Lantern of Sector two-eight-one-four. Earth's guardian. |

If a line is blocked, generate it on its own. If it still fails, use "Beware my power... the emerald light!" or "Welcome, Lantern of Sector two-eight-one-four. Earth's guardian." and update the matching text in `oath.js` / `script.js`.

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
