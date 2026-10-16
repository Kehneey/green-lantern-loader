"""Pack the audio in assets/audio/ for the web.

Each .mp3/.wav/.ogg/.m4a file is wrapped as base64 in assets/audio/packed/<name>.json,
and assets/audio/manifest.json lists what is available. The page loads the
packed copies, so:

- download managers (IDM and similar) never see an audio request to hijack, and
- the page knows exactly which files exist instead of probing for them.

Run it after adding or replacing audio files:

    python tools/pack_audio.py

The GitHub Pages workflow also runs it on every deploy.
"""

import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO = ROOT / "assets" / "audio"
PACKED = AUDIO / "packed"

TYPES = {
    ".mp3": "audio/mpeg",
    ".wav": "audio/wav",
    ".ogg": "audio/ogg",
    ".m4a": "audio/mp4",
}


def main():
    PACKED.mkdir(parents=True, exist_ok=True)

    for old in PACKED.glob("*.json"):
        old.unlink()

    files = {}

    for path in sorted(AUDIO.iterdir()):
        mime = TYPES.get(path.suffix.lower())
        if not mime or not path.is_file():
            continue

        name = path.stem
        if name in files:
            print(f"skipping {path.name}: {name} is already packed from another format")
            continue

        data = base64.b64encode(path.read_bytes()).decode("ascii")
        out = PACKED / f"{name}.json"
        out.write_text(json.dumps({"type": mime, "data": data}), encoding="utf-8")
        files[name] = f"packed/{name}.json"
        print(f"packed {path.name} -> {out.relative_to(ROOT)}")

    manifest = AUDIO / "manifest.json"
    manifest.write_text(json.dumps({"files": files}, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {manifest.relative_to(ROOT)} ({len(files)} file(s))")


if __name__ == "__main__":
    main()
