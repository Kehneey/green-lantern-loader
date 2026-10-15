// The Green Lantern oath, spoken line by line while the ring charges.
//
// Each line is queued when the charge crosses its threshold. Lines are never
// spoken over each other or repeated: the next one waits for the previous one
// to finish. Words resolve onto the screen as they are said.

const LINES = [
  { text: "In brightest day, in blackest night,", clip: "vo_oath_1", key: ["brightest", "blackest", "night"] },
  { text: "No evil shall escape my sight.", clip: "vo_oath_2", key: ["evil", "sight"] },
  { text: "Let those who worship evil's might,", clip: "vo_oath_3", key: ["evil's", "might"] },
  { text: "Beware my power... Green Lantern's light!", clip: "vo_oath_4", key: ["power", "green", "lantern's", "light"] }
];

// Where each line falls in assets/audio/oath_track.mp3, in seconds, measured
// from the voice's loudness. Each part is [start, end, words]; a line's words
// are spread across its parts. Adjust these if you swap in a different take.
const TRACK_CUES = [
  [[0.35, 1.5, 3], [2.95, 4.1, 3]],
  [[5.0, 7.3, 6]],
  [[9.1, 11.7, 6]],
  [[13.15, 14.25, 3], [15.55, 16.85, 3]]
];

// The track is "finished" once the last word has landed.
export const TRACK_END = 17.3;

const plain = word => word.toLowerCase().replace(/[^a-z']/g, "");

export function createOath({ container, voice, audio, onKeyWord = () => {} }) {
  const lines = LINES.map((line, index) => {
    const el = document.createElement("p");
    el.className = "oath-line";
    if (index === LINES.length - 1) el.classList.add("is-final");
    el.setAttribute("aria-hidden", "true");

    const words = line.text.split(/\s+/).map(word => {
      const span = document.createElement("span");
      span.className = "oath-word";
      if (line.key.includes(plain(word))) span.classList.add("is-key");
      span.textContent = word;
      el.appendChild(span);
      el.appendChild(document.createTextNode(" "));
      return span;
    });

    container.appendChild(el);
    return { el, words };
  });

  // Screen readers get each line once, rather than word by word.
  const reader = document.createElement("p");
  reader.className = "sr-only";
  container.appendChild(reader);

  const state = { queue: [], started: new Set(), speaking: false, spoken: 0, done: false, doneTimer: 0 };

  function setCurrent(index) {
    lines.forEach((line, i) => {
      line.el.classList.toggle("is-current", i === index);
      line.el.classList.toggle("is-past", i < index);
      line.el.classList.toggle("is-shown", i <= index);
    });
  }

  function showWord(lineIndex, wordIndex) {
    const word = lines[lineIndex].words[wordIndex];
    if (!word || word.classList.contains("is-on")) return;
    word.classList.add("is-on");
    if (word.classList.contains("is-key")) onKeyWord(word);
  }

  function pump() {
    if (state.speaking || !state.queue.length) return;

    const index = state.queue.shift();
    const final = index === LINES.length - 1;

    state.started.add(index);
    state.speaking = true;
    setCurrent(index);
    audio.oathHit(index, LINES.length);
    reader.textContent = LINES.slice(0, index + 1).map(line => line.text).join(" ");

    voice.say(LINES[index].text, {
      clip: LINES[index].clip,
      rate: final ? 0.84 : 0.88,
      pitch: final ? 0.8 : 0.84,
      onWord: word => showWord(index, word),
      onDone: () => {
        state.speaking = false;
        state.spoken += 1;

        if (state.spoken === LINES.length) {
          // Let the last word settle before the finale can begin.
          state.doneTimer = window.setTimeout(() => {
            state.done = true;
          }, 700);
        }

        pump();
      }
    });
  }

  function trigger(index) {
    if (index < 0 || index >= LINES.length) return;
    if (state.started.has(index) || state.queue.includes(index)) return;

    state.queue.push(index);
    state.queue.sort((a, b) => a - b);
    pump();
  }

  // Track mode: reveal lines and words from the oath track's playback time.
  let trackLine = -1;

  function setTrackTime(t) {
    TRACK_CUES.forEach((parts, lineIndex) => {
      if (t < parts[0][0] - 0.2) return;

      if (lineIndex > trackLine) {
        trackLine = lineIndex;
        setCurrent(lineIndex);
        reader.textContent = LINES.slice(0, lineIndex + 1).map(line => line.text).join(" ");
      }

      let word = 0;
      for (const [start, end, count] of parts) {
        for (let k = 0; k < count; k++, word++) {
          if (t >= start + ((end - start) * k) / count) showWord(lineIndex, word);
        }
      }
    });

    if (t >= TRACK_END) state.done = true;
  }

  function reset() {
    trackLine = -1;
    voice.stop();
    window.clearTimeout(state.doneTimer);
    state.queue = [];
    state.started.clear();
    state.speaking = false;
    state.spoken = 0;
    state.done = false;
    reader.textContent = "";

    for (const line of lines) {
      line.el.classList.remove("is-current", "is-past", "is-shown");
      line.words.forEach(word => word.classList.remove("is-on"));
    }
  }

  return {
    trigger,
    reset,
    setTrackTime,
    get done() {
      return state.done;
    },
    get speaking() {
      return state.speaking;
    }
  };
}
