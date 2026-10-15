# Green Lantern Loader

An interactive Three.js loader: wake the power ring, charge it on the lantern while the oath is spoken, and get sworn in. Works with a mouse, touch screens and the keyboard, on desktop and mobile.

## The experience

1. **Pick up the ring.** It lies dead at the bottom of the screen. The mouse pointer becomes a green glove: grab the ring (click it, or press and drag). On a phone, touch and drag it; it floats just above your finger so you can see it.
2. **Knock it against the side of the screen.** Edges glow to show where. A proper knock flashes light at the edge, the ring flickers awake and reports: "Ring power at two percent. Recharge required."
3. **Take it to the lantern.** As it nears the lens the ring turns its head toward it, then seats head-first in the lens while the camera swings round to a three-quarter view.
4. **Hold to charge.** As the charge climbs, the oath is spoken line by line and each word resolves onto the screen in cinematic type as it is said. Let go and the charge pauses (and slowly drains); the oath never repeats or talks over itself, and the ring will not finish until the whole oath has been said.
5. **Finale.** "Ring fully charged." Flash, shockwave, then the welcome page: *Welcome, Green Lantern of Sector 2814. Earth's guardian.*

On the welcome page, tap anywhere to build a construct: a blueprint of the object appears, its parts fly in and lock into place one by one, and the finished construct pulses, is named, then breaks apart.

If you hesitate, a ghost glove demonstrates the next move. Drop the ring and it falls and bounces; you can even throw it at the edge. Knock it again later for a quick power reading.

### Controls

| | Mouse | Touch | Keyboard |
|---|---|---|---|
| Pick up | Click the ring (or press and drag) | Touch and drag | Space |
| Move | Move the mouse | Drag | Arrow keys (Shift = faster) |
| Let go | Click again, or release a drag | Lift your finger | Space |
| Charge | Press and hold | Hold your finger down | Hold Space |
| Mute | Sound button | Sound button | M |

*Skip intro* jumps straight to charging. *Recharge* on the welcome page drops the ring at 2% for another go.

## Files

- `index.html`, `style.css`
- `script.js`: scene, stages, input, ring physics, charge, finale, welcome page
- `voice.js`: speech synthesis; picks the most natural English voice and reports each word as it is spoken
- `oath.js`: the spoken oath, queued line by line
- `constructs.js`: green-light constructs that assemble from parts on the welcome page
- `audio.js`: plays the recordings in `assets/audio/`, with synthesised stand-ins for anything missing
- `AUDIO_PROMPTS.md`: exact prompts and file names for generating the voice-over (and optional sound effects)
- `hand.js`: the glove cursor and the ghost demonstration glove
- `assets/green_lantern.glb`, `assets/green-lantern-ring.glb`: the comic battery and ring, meshopt-compressed (about 3 MB together, down from 19 MB)

## Run locally

The page loads ES modules and 3D models, so serve the folder rather than opening `index.html` directly:

```bash
python -m http.server 8123
```

then open http://localhost:8123. VS Code's Live Server works too.

## Sound and voice

Drop recordings into `assets/audio/` using the names in `AUDIO_PROMPTS.md` (`.mp3`, `.wav` or `.ogg`). Each file is picked up automatically; anything missing uses a built-in synthesised sound, and voice lines fall back to the browser's speech synthesis. Trim silence from voice files: the on-screen words are timed across the clip's length. The music ducks while the voice speaks.

Browsers only allow sound after a tap or click, so it starts on your first touch (or tap the Sound button). With sound off, the oath still appears word by word at speaking pace.

`prefers-reduced-motion` is respected: no camera sway, shake, grain or hard flash.

## Tuning

Timing constants are at the top of `script.js`: `CHARGE_SECONDS`, `START_CHARGE`, `OATH_THRESHOLDS`, `KNOCK_SPEED`, `HINT_DELAY` and `FINISH_*`. The oath text and its emphasised words are at the top of `oath.js`; voice preferences are at the top of `voice.js`.

Open the page with `?debug` to get `window.__lantern` in the console (stage, charge, ring state; you can set `__lantern.charge` to fast-forward).

## GitHub Pages

The project is static and can be published with GitHub Pages from the repository root.
