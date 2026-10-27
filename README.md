# Green Lantern Loader

An interactive Three.js loader: wake the power ring, charge it on the lantern while the oath is spoken, and get sworn in. Works with a mouse, touch screens and the keyboard, on desktop and mobile.

## The experience

It opens on a film title card (the Enter ring fills as the models load), then **Enter** (with or without sound) fades the picture up in 2.39:1 letterbox, with chapter markers and a ring-power timecode along the bottom.

1. **Pick up the ring.** It lies dead at the bottom of the screen. The mouse pointer becomes a green glove: grab the ring (click it, or press and drag). On a phone, touch and drag it; it floats just above your finger so you can see it.
2. **Knock it against the side of the screen.** Edges glow to show where. A proper knock flashes light at the edge, the ring flickers awake and reports: "Ring power at two percent. Recharge required."
3. **Take it to the lantern.** As it nears the lens the ring turns its head toward it, then seats head-first in the lens while the camera swings round to a three-quarter view.
4. **Hold to charge.** As the charge climbs, the oath is spoken line by line and each line lands as a huge trailer title card, word by word, as it is said. Let go and the charge pauses (and slowly drains); the oath never repeats or talks over itself, and the ring will not finish until the whole oath has been said.
5. **Finale.** The ring says "Ring fully charged." Flash, shockwave, then the ending: *Welcome, Green Lantern of Sector 2814. Earth's guardian.*

The ending is a construct stage. The lantern settles behind the title, and the ring builds constructs in the open frame: a drawing frame appears, each part's outline is traced in order, the parts fly in and lock onto their outlines ("Assembling 3 / 7"), then the finished construct flares, is named, holds and breaks apart. The first one builds on its own; after that, press **Build a construct** or tap anywhere.

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
- `assets/green_lantern.glb`, `assets/green-lantern-ring.glb`: the comic battery and ring, simplified to about 130k and 48k triangles and meshopt-compressed (0.6 MB together, down from 19 MB)
- `geometry.js`: area-weighted crease normals, so the simplified models shade cleanly
- `tools/pack_audio.py`, `tools/serve.py`: audio packer and local dev server

## Run locally

The page loads ES modules and 3D models, so serve the folder rather than opening `index.html` directly:

```bash
python tools/serve.py
```

then open http://127.0.0.1:8123. It is a plain static server that tells the browser never to cache, so edits always show up on reload (Python's own `http.server` lets the browser keep stale copies of the modules).

## Sound and voice

**Adding audio.** Drop files into `assets/audio/` and run `python tools/pack_audio.py` (the GitHub Pages workflow also runs it on every deploy). It trims silence from WAV files, splits a single `vo_dialog.wav` export into the seven voice lines, wraps each file as JSON in `assets/audio/packed/` and lists them in `assets/audio/manifest.json`. The page loads those, so download managers such as IDM never intercept the audio. See `AUDIO_PROMPTS.md` for making the voices free in Google AI Studio.

**The oath recording.** Put a full spoken oath at `assets/audio/oath_track.mp3`. Holding the ring on the lantern plays it, letting go pauses it, and the charge and the words on screen follow the recording. Word timing is set in `TRACK_CUES` at the top of `oath.js` (measured for the current take).

Without the track, the oath lines use `vo_oath_1`…`vo_oath_4` (or the browser's speech as a last resort). The ring's own lines (`vo_ring_low`, `vo_ring_full`, `vo_welcome`) play only from recordings; there is no robotic fallback. See `AUDIO_PROMPTS.md` for all file names and prompts. Missing sound effects use built-in synthesised stand-ins.

Clicking **Enter** unlocks sound in every browser, including iOS.

`prefers-reduced-motion` is respected: no camera sway, shake, grain or hard flash.

## Performance

The page watches its own frame rate and lowers or raises the render resolution to stay smooth. Phones and low-core machines also get cheaper metal shading, a single haze layer and fewer particles. `?debug` then `__lantern.quality` in the console shows the current render scale and fps.

## Tuning

Timing constants are at the top of `script.js`: `CHARGE_SECONDS`, `START_CHARGE`, `OATH_THRESHOLDS`, `KNOCK_SPEED`, `HINT_DELAY` and `FINISH_*`. The oath text and its emphasised words are at the top of `oath.js`; voice preferences are at the top of `voice.js`.

Open the page with `?debug` to get `window.__lantern` in the console (stage, charge, ring state; you can set `__lantern.charge` to fast-forward).

## GitHub Pages

The project is static and can be published with GitHub Pages from the repository root.
