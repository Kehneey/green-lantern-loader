# Green Lantern Loader Test

Interactive Three.js charging-loader prototype using two GLB models: the comic-style power battery and ring.

## Files

- `index.html`
- `style.css`
- `script.js`: scene, input, charge, finish sequence
- `audio.js`: synthesised sound (Web Audio, no audio files)
- `assets/green_lantern.glb` and `assets/green-lantern-ring.glb`

## Run locally

Because the page loads 3D assets, use a local server rather than opening `index.html` directly.

### VS Code + Live Server

1. Open this folder in VS Code.
2. Install the **Live Server** extension.
3. Right-click `index.html`.
4. Choose **Open with Live Server**.

## Interaction

1. Move the pointer (or drag a finger) toward the battery. Keyboard: arrow keys move the ring.
2. The 3D ring is magnetically attracted toward the lens.
3. When it snaps into place, press and hold (mouse, touch or Space).
4. A full charge takes about 22 seconds of continuous holding. The oath appears one word at a time, line by line.
5. Releasing early drains the charge slowly and the oath fades back out.
6. At 100%, the ring trembles, the lens flares and a shockwave fires, then the welcome page appears.

## Welcome page

"Ring fully charged. Welcome, Green Lantern. Sector 2814." The page shows a Lantern ID card with a random callsign (re-roll it), your real charge time, and rotating dispatches from Oa. Tap anywhere to summon a random construct, or copy your Lantern ID to share. A low spoken line plays once if sound is on.

## Sound

All sound is synthesised in the browser: a low drone, a magnetic pull as the ring approaches, a lock-on clunk, a charge hum that rises in pitch and tremolo with the charge, a swell for each oath line and a riser and boom at the finish, then a spoken welcome using the browser's built-in voice. Browsers only allow audio after a click, so it starts on your first press. Use the Sound button or press `M` to mute.

`prefers-reduced-motion` is respected: no camera sway, shake, grain or hard flash.

## Tuning

The timing constants (`CHARGE_SECONDS`, `OATH_THRESHOLDS`, `FINISH_*`) are at the top of `script.js`. The per-word oath pace is the `.46s` stagger in `style.css` (`.oath-line.visible .word`).

## GitHub Pages

This project is static and can be published directly with GitHub Pages from the repository root.


## GitHub upload note
Both 3D model files are now under GitHub's 25 MB browser-upload limit. The larger battery was converted from STL to GLB, reducing it from about 31.8 MB to about 11.5 MB without changing the visible geometry.
