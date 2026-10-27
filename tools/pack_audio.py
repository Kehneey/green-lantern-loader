"""Pack the audio in assets/audio/ for the web.

Each .mp3/.wav/.ogg/.m4a file is wrapped as base64 in assets/audio/packed/<name>.json,
and assets/audio/manifest.json lists what is available. The page loads the
packed copies, so:

- download managers (IDM and similar) never see an audio request to hijack, and
- the page knows exactly which files exist instead of probing for them.

WAV files (what Google AI Studio exports) are also cleaned up on the way:

- silence is trimmed from the start and end, so on-screen words line up, and
- vo_dialog.wav, a single "Create new dialog" export of every line in script
  order, is split into the separate lines (vo_ring_low, vo_oath_1..4,
  vo_ring_full, vo_welcome). A separately exported file of the same name wins.

Run it after adding or replacing audio files:

    python tools/pack_audio.py

The GitHub Pages workflow also runs it on every deploy.
"""

import base64
import io
import json
import wave
from array import array
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

# The order of the lines in the dialog script (see AUDIO_PROMPTS.md).
DIALOG = "vo_dialog"
DIALOG_ORDER = [
    "vo_ring_low",
    "vo_oath_1",
    "vo_oath_2",
    "vo_oath_3",
    "vo_oath_4",
    "vo_ring_full",
    "vo_welcome",
]


# ------------------------------------------------------------------ WAV helpers

def read_wav(path):
    """Return (params, mono 16-bit samples) or None if it isn't 16-bit PCM."""
    with wave.open(str(path), "rb") as w:
        params = w.getparams()
        if params.sampwidth != 2:
            return None
        data = array("h", w.readframes(params.nframes))

    if params.nchannels > 1:
        # Average channels into mono for analysis; keep the original for output.
        mono = array("h", (
            sum(data[i:i + params.nchannels]) // params.nchannels
            for i in range(0, len(data), params.nchannels)
        ))
    else:
        mono = data

    return params, data, mono


def loudness(mono, rate, window=0.01):
    """Peak level per `window` seconds."""
    step = max(1, int(rate * window))
    return [max((abs(v) for v in mono[i:i + step]), default=0) for i in range(0, len(mono), step)], step


def wav_bytes(params, frames):
    out = io.BytesIO()
    with wave.open(out, "wb") as w:
        w.setnchannels(params.nchannels)
        w.setsampwidth(params.sampwidth)
        w.setframerate(params.framerate)
        w.writeframes(frames.tobytes())
    return out.getvalue()


def slice_frames(params, data, start, end):
    """Cut interleaved samples between two mono sample positions."""
    ch = params.nchannels
    return data[start * ch:end * ch]


def voiced_span(levels, threshold):
    voiced = [i for i, level in enumerate(levels) if level > threshold]
    return (voiced[0], voiced[-1] + 1) if voiced else None


def trim_wav(path):
    """Trim leading/trailing silence. Returns WAV bytes (original if not 16-bit)."""
    read = read_wav(path)
    if not read:
        return path.read_bytes()

    params, data, mono = read
    levels, step = loudness(mono, params.framerate)
    peak = max(levels, default=0)
    span = voiced_span(levels, max(250, peak * 0.04))
    if not span:
        return path.read_bytes()

    rate = params.framerate
    start = max(0, span[0] * step - int(rate * 0.04))
    end = min(len(mono), span[1] * step + int(rate * 0.12))
    return wav_bytes(params, slice_frames(params, data, start, end))


def split_dialog(path, count):
    """Split one dialog export into `count` lines at its longest pauses."""
    read = read_wav(path)
    if not read:
        print(f"{path.name}: not 16-bit PCM WAV, can't split")
        return None

    params, data, mono = read
    rate = params.framerate
    levels, step = loudness(mono, rate)
    peak = max(levels, default=0)
    threshold = max(250, peak * 0.04)

    # Voiced runs, then the silent gaps between them.
    runs = []
    current = None
    for i, level in enumerate(levels):
        if level > threshold:
            if current is None:
                current = [i, i + 1]
            else:
                current[1] = i + 1
        elif current is not None and i - current[1] > int(0.08 / 0.01):
            runs.append(current)
            current = None
    if current is not None:
        runs.append(current)

    if len(runs) < count:
        print(f"{path.name}: found {len(runs)} phrases, expected {count}; leave longer pauses between lines")
        return None

    # Merge across the shortest gaps until there are exactly `count` lines:
    # pauses inside a line ("In brightest day... in blackest night") are
    # shorter than the pauses between speakers.
    while len(runs) > count:
        gaps = [runs[i + 1][0] - runs[i][1] for i in range(len(runs) - 1)]
        i = gaps.index(min(gaps))
        runs[i] = [runs[i][0], runs[i + 1][1]]
        del runs[i + 1]

    clips = []
    for start, end in runs:
        a = max(0, start * step - int(rate * 0.04))
        b = min(len(mono), end * step + int(rate * 0.12))
        clips.append(wav_bytes(params, slice_frames(params, data, a, b)))
        print(f"  line {len(clips)}: {a / rate:6.2f}s to {b / rate:6.2f}s")

    return clips


# ------------------------------------------------------------------ packing

def write_packed(name, mime, raw, files):
    out = PACKED / f"{name}.json"
    out.write_text(json.dumps({"type": mime, "data": base64.b64encode(raw).decode("ascii")}), encoding="utf-8")
    files[name] = f"packed/{name}.json"


def main():
    PACKED.mkdir(parents=True, exist_ok=True)
    for old in PACKED.glob("*.json"):
        old.unlink()

    files = {}
    dialog = None

    for path in sorted(AUDIO.iterdir()):
        mime = TYPES.get(path.suffix.lower())
        if not mime or not path.is_file():
            continue

        name = path.stem
        if name == DIALOG:
            dialog = path
            continue
        if name in files:
            print(f"skipping {path.name}: {name} is already packed from another format")
            continue

        raw = trim_wav(path) if path.suffix.lower() == ".wav" else path.read_bytes()
        write_packed(name, mime, raw, files)
        print(f"packed {path.name}" + (" (trimmed)" if path.suffix.lower() == ".wav" else ""))

    if dialog:
        print(f"splitting {dialog.name} into {len(DIALOG_ORDER)} lines")
        clips = split_dialog(dialog, len(DIALOG_ORDER))
        for name, raw in zip(DIALOG_ORDER, clips or []):
            if name in files:
                print(f"  {name}: kept the separate file")
                continue
            write_packed(name, "audio/wav", raw, files)
            print(f"  packed {name}")

    manifest = AUDIO / "manifest.json"
    manifest.write_text(json.dumps({"files": files}, indent=2) + "\n", encoding="utf-8")
    print(f"wrote {manifest.relative_to(ROOT)} ({len(files)} file(s))")


if __name__ == "__main__":
    main()
