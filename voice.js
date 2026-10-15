// Spoken lines. A recorded clip from assets/audio/ is used when it exists;
// otherwise the browser's built-in speech synthesis speaks the line.
//
// - Picks the most natural English voice the device offers.
// - Reports each word as it is spoken (boundary events), with a timed
//   fallback for voices that do not report boundaries, so on-screen text can
//   pop in sync with the voice.
// - When muted or unsupported it still runs the same timing silently, so the
//   experience never waits on audio.

// Best first. Natural/neural voices sound far less robotic.
const PREFERRED = [
  /Andrew.*Natural/i,
  /Guy.*Natural/i,
  /Brian.*Natural/i,
  /Christopher.*Natural/i,
  /Ryan.*Natural/i,
  /Eric.*Natural/i,
  /Davis.*Natural/i,
  /Natural/i,
  /Google UK English Male/i,
  /Daniel/i,
  /Arthur/i,
  /Alex/i,
  /Aaron/i,
  /Microsoft (Ryan|Guy|George|David|Mark|Andrew)/i,
  /Google US English/i
];

export function createVoice({ audio = null, onSpeakingChange = () => {} } = {}) {
  const synth = "speechSynthesis" in window ? window.speechSynthesis : null;

  let voice = null;
  let muted = false;
  let unlocked = false;
  let current = null;

  // Chrome can garbage-collect an utterance mid-sentence and silently stop
  // its events, so keep a reference until it ends.
  const alive = new Set();

  function score(candidate) {
    if (!/^en([-_]|$)/i.test(candidate.lang)) return -1;

    const rank = PREFERRED.findIndex(pattern => pattern.test(candidate.name));
    let value = rank === -1 ? 0 : 100 - rank;

    if (/en[-_]GB/i.test(candidate.lang)) value += 4;
    if (/en[-_]US/i.test(candidate.lang)) value += 3;

    return value;
  }

  function pickVoice() {
    if (!synth) return;

    let best = null;
    let bestScore = -1;

    for (const candidate of synth.getVoices()) {
      const value = score(candidate);
      if (value > bestScore) {
        best = candidate;
        bestScore = value;
      }
    }

    voice = best;
  }

  if (synth) {
    pickVoice();

    if (typeof synth.addEventListener === "function") {
      synth.addEventListener("voiceschanged", pickVoice);
    } else {
      synth.onvoiceschanged = pickVoice;
    }
  }

  // iOS only lets speech start from inside a user gesture. Speaking one silent
  // utterance from the first gesture unlocks every later line.
  function unlock() {
    if (!synth || unlocked) return;
    unlocked = true;

    try {
      const primer = new SpeechSynthesisUtterance(" ");
      primer.volume = 0;
      synth.speak(primer);
    } catch (error) {
      /* speech is a bonus */
    }
  }

  function stop() {
    if (current) {
      current.cancelled = true;
      current.timers.forEach(window.clearTimeout);
      current = null;
      onSpeakingChange(false);
    }

    if (synth && (synth.speaking || synth.pending)) synth.cancel();
    audio?.stopVoiceClip();
  }

  // Speak `text`, calling onWord(index) as each word is reached and onDone()
  // once at the end. Returns a handle with cancel().
  // `synthesize: false` means a recording or nothing: the words still appear
  // on time, but the browser's built-in voice is never used.
  function say(text, { rate = 0.92, pitch = 0.9, clip = "", synthesize = true, onWord, onDone } = {}) {
    stop();

    const words = [...text.matchAll(/\S+/g)].map(match => ({
      start: match.index,
      text: match[0]
    }));

    const job = {
      cancelled: false,
      finished: false,
      boundary: false,
      revealed: -1,
      timers: [],
      cancel: () => {
        if (current === job) stop();
      }
    };

    current = job;

    const later = (fn, seconds) => {
      job.timers.push(window.setTimeout(fn, seconds * 1000));
    };

    const reveal = index => {
      if (job.cancelled) return;
      const last = Math.min(index, words.length - 1);

      while (job.revealed < last) {
        job.revealed += 1;
        onWord?.(job.revealed);
      }
    };

    const finish = () => {
      if (job.finished || job.cancelled) return;
      job.finished = true;
      reveal(words.length - 1);
      job.timers.forEach(window.clearTimeout);
      if (current === job) current = null;
      onSpeakingChange(false);
      onDone?.();
    };

    // How long each word takes to say, roughly.
    const wordTime = word => {
      const letters = word.text.replace(/[^a-z']/gi, "").length;
      const pause = /[,]$/.test(word.text) ? 0.22 : /[.!?…]$/.test(word.text) ? 0.36 : 0;
      return (0.17 + 0.062 * letters) / rate + pause;
    };

    const estimate = words.reduce((sum, word) => sum + wordTime(word), 0);

    // Reveal words on a clock that roughly follows speech. Used when the voice
    // gives no word boundaries, and as the whole timing when silent.
    const runClock = (scale = 1) => {
      let t = 0;

      words.forEach((word, index) => {
        later(() => {
          if (!job.boundary) reveal(index);
        }, t);

        t += wordTime(word) * scale;
      });

      return t;
    };

    // A recorded clip: spread the words across it, weighted by how long each
    // one takes to say. Trim silence from the files so this lines up.
    if (clip && audio) {
      const duration = audio.voiceClip(clip, () => finish());

      if (duration > 0) {
        let t = 0;
        words.forEach((word, index) => {
          later(() => reveal(index), (t / estimate) * duration * 0.96);
          t += wordTime(word);
        });

        later(finish, duration + 0.8);
        return job;
      }
    }

    const silent = () => {
      const total = runClock(1.12);
      later(finish, total + 0.45);
    };

    if (!synth || muted || !synthesize) {
      silent();
      return job;
    }

    const utterance = new SpeechSynthesisUtterance(text);

    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    } else {
      utterance.lang = "en-US";
    }

    utterance.rate = rate;
    utterance.pitch = pitch;
    utterance.volume = 1;

    let started = false;
    let startedAt = 0;
    alive.add(utterance);

    utterance.onstart = () => {
      if (started || job.cancelled) return;
      started = true;
      startedAt = performance.now();
      onSpeakingChange(true);

      // Safety net: some browsers never fire `end`.
      runClock(1);
      later(finish, estimate * 1.8 + 2);
    };

    utterance.onboundary = event => {
      if (job.cancelled || (event.name && event.name !== "word")) return;
      job.boundary = true;

      let index = 0;
      for (let i = 0; i < words.length; i++) {
        if (words[i].start <= event.charIndex) index = i;
      }

      reveal(index);
    };

    utterance.onend = () => {
      alive.delete(utterance);
      if (job.cancelled) return;

      if (!started) {
        silent();
        return;
      }

      // Some engines report the end almost at once (no voices installed, no
      // audio device). Never let a line rush past: finish on the clock.
      const remaining = startedAt / 1000 + estimate * 0.9 - performance.now() / 1000;
      if (remaining > 0.2) later(finish, remaining);
      else finish();
    };

    utterance.onerror = () => {
      alive.delete(utterance);
      if (job.cancelled) return;

      if (started) finish();
      else silent();
    };

    // If speech never starts (blocked, no voices yet), carry on silently.
    later(() => {
      if (!started && !job.cancelled) {
        synth.cancel();
        silent();
      }
    }, 2.5);

    // Chrome can drop an utterance queued in the same tick as cancel().
    later(() => {
      if (!job.cancelled) synth.speak(utterance);
    }, 0.05);

    return job;
  }

  function setMuted(value) {
    muted = value;
    if (muted && synth && (synth.speaking || synth.pending)) synth.cancel();
  }

  return {
    say,
    stop,
    unlock,
    setMuted,
    get supported() {
      return Boolean(synth);
    },
    get voiceName() {
      return voice ? voice.name : "";
    }
  };
}
