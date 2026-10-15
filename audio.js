// Synthesised sound for the loader. Nothing is downloaded: every sound is
// built from oscillators and noise with the Web Audio API.
//
// Browsers only allow audio after a user gesture, so call unlock() from a
// pointer or key handler. Until then every method is a safe no-op.

const MUTE_KEY = "green-lantern-loader:muted";

export function createAudio() {
  let ctx = null;
  let master = null;
  let bus = null;
  let ready = false;
  let muted = false;

  try {
    muted = window.localStorage.getItem(MUTE_KEY) === "1";
  } catch (error) {
    /* storage can be blocked; the default is fine */
  }

  const voices = {};
  let noise = null;
  let lastSnapped = false;

  /* ------------------------------------- */
  /* Building blocks                       */
  /* ------------------------------------- */

  function makeNoise(seconds) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function makeImpulse(seconds, decay) {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);

    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
      }
    }

    return buffer;
  }

  function osc(type, freq, detune = 0) {
    const node = ctx.createOscillator();
    node.type = type;
    node.frequency.value = freq;
    node.detune.value = detune;
    return node;
  }

  function gain(value = 0) {
    const node = ctx.createGain();
    node.gain.value = value;
    return node;
  }

  function filter(type, freq, q = 0.7) {
    const node = ctx.createBiquadFilter();
    node.type = type;
    node.frequency.value = freq;
    node.Q.value = q;
    return node;
  }

  // A one-shot tone with an attack/decay envelope and an optional pitch glide.
  function tone({
    type = "sine",
    from,
    to = from,
    start = 0,
    attack = 0.01,
    duration = 0.4,
    peak = 0.1,
    lowpass = 0,
    dest = bus
  }) {
    const t = ctx.currentTime + start;
    const o = osc(type, from);
    const g = gain(0);

    o.frequency.setValueAtTime(from, t);
    if (to !== from) o.frequency.exponentialRampToValueAtTime(to, t + duration);

    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    let out = o;
    if (lowpass) {
      const f = filter("lowpass", lowpass);
      o.connect(f);
      out = f;
    }

    out.connect(g);
    g.connect(dest);
    o.start(t);
    o.stop(t + duration + 0.05);
  }

  // A one-shot burst of filtered noise whose cutoff sweeps from `from` to `to`.
  function burst({
    type = "bandpass",
    from,
    to = from,
    start = 0,
    attack = 0.01,
    duration = 0.5,
    peak = 0.1,
    q = 0.8,
    dest = bus
  }) {
    const t = ctx.currentTime + start;
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;

    const f = filter(type, from, q);
    f.frequency.setValueAtTime(from, t);
    if (to !== from) f.frequency.exponentialRampToValueAtTime(to, t + duration);

    const g = gain(0);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + duration);

    src.connect(f);
    f.connect(g);
    g.connect(dest);
    src.start(t, Math.random() * 1.5);
    src.stop(t + duration + 0.05);
  }

  /* ------------------------------------- */
  /* Continuous layers                     */
  /* ------------------------------------- */

  function buildAmbient() {
    const out = gain(0);
    out.connect(bus);

    const lp = filter("lowpass", 180, 0.6);
    lp.connect(out);

    for (const [type, freq, detune] of [
      ["sawtooth", 55, 0],
      ["sawtooth", 55, 9],
      ["sine", 27.5, 0]
    ]) {
      const o = osc(type, freq, detune);
      o.connect(lp);
      o.start();
    }

    // Slow movement so the drone breathes.
    const lfo = osc("sine", 0.07);
    const lfoGain = gain(70);
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    lfo.start();

    // A thin layer of air on top.
    const air = ctx.createBufferSource();
    air.buffer = noise;
    air.loop = true;
    const airFilter = filter("bandpass", 900, 0.4);
    const airGain = gain(0.014);
    air.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(out);
    air.start();

    voices.ambient = { out, lp };
    out.gain.setTargetAtTime(0.17, ctx.currentTime, 2.2);
  }

  function buildCharge() {
    const out = gain(0);
    out.connect(bus);

    const trem = gain(0.65);
    trem.connect(out);

    const lp = filter("lowpass", 240, 1.1);
    lp.connect(trem);

    const a = osc("sawtooth", 62);
    const b = osc("sawtooth", 62, 11);
    const sub = osc("sine", 31);
    const subGain = gain(0.9);
    a.connect(lp);
    b.connect(lp);
    sub.connect(subGain);
    subGain.connect(lp);

    const lfo = osc("sine", 3);
    const lfoGain = gain(0.3);
    lfo.connect(lfoGain);
    lfoGain.connect(trem.gain);

    // High shimmer that only appears as the ring nears full charge.
    const shimmerGain = gain(0);
    const s1 = osc("sine", 880);
    const s2 = osc("triangle", 883);
    s1.connect(shimmerGain);
    s2.connect(shimmerGain);
    shimmerGain.connect(bus);

    // Magnetic pull while the ring approaches the lens.
    const pullGain = gain(0);
    const pull = osc("sine", 200);
    const vib = osc("sine", 5);
    const vibGain = gain(6);
    vib.connect(vibGain);
    vibGain.connect(pull.frequency);
    pull.connect(pullGain);
    pullGain.connect(bus);

    for (const node of [a, b, sub, lfo, s1, s2, pull, vib]) node.start();

    voices.charge = { out, lp, a, b, sub, lfo, shimmerGain, s1, s2, pullGain, pull };
  }

  /* ------------------------------------- */
  /* Public API                            */
  /* ------------------------------------- */

  function unlock() {
    if (ctx) {
      if (ctx.state === "suspended") ctx.resume();
      return ready;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return false;

    ctx = new AudioContextClass();

    master = gain(muted ? 0 : 0.9);
    const comp = ctx.createDynamicsCompressor();
    master.connect(comp);
    comp.connect(ctx.destination);

    bus = gain(1);
    const reverb = ctx.createConvolver();
    reverb.buffer = makeImpulse(3, 2.4);
    const wet = gain(0.32);

    bus.connect(master);
    bus.connect(reverb);
    reverb.connect(wet);
    wet.connect(master);

    noise = makeNoise(2);

    buildAmbient();
    buildCharge();

    ready = true;
    return true;
  }

  function update({ attraction, snapped, holding, charge, completed }) {
    if (!ready) return;

    const t = ctx.currentTime;
    const { ambient, charge: c } = voices;

    const active = holding && snapped && !completed;
    const level = completed ? 1 : charge;

    c.pullGain.gain.setTargetAtTime(completed || snapped ? 0 : attraction * 0.05, t, 0.15);
    c.pull.frequency.setTargetAtTime(170 + attraction * 230, t, 0.2);

    const base = 62 + level * 98;
    c.a.frequency.setTargetAtTime(base, t, 0.25);
    c.b.frequency.setTargetAtTime(base, t, 0.25);
    c.sub.frequency.setTargetAtTime(base / 2, t, 0.25);
    c.lp.frequency.setTargetAtTime(220 + level * 2800, t, 0.3);
    c.lfo.frequency.setTargetAtTime(2.5 + level * 13, t, 0.3);

    c.out.gain.setTargetAtTime(
      active ? 0.1 + level * 0.17 : 0,
      t,
      active ? 0.4 : 0.18
    );

    const shimmer = active ? level * level * 0.045 : 0;
    c.shimmerGain.gain.setTargetAtTime(shimmer, t, 0.3);
    c.s1.frequency.setTargetAtTime(600 + level * 1500, t, 0.3);
    c.s2.frequency.setTargetAtTime(604 + level * 1500, t, 0.3);

    ambient.lp.frequency.setTargetAtTime(170 + level * 520, t, 0.6);
    ambient.out.gain.setTargetAtTime(completed ? 0.06 : 0.17 + level * 0.06, t, 0.5);

    if (snapped !== lastSnapped) {
      lastSnapped = snapped;
      if (snapped) onSnap();
      else onUnsnap();
    }
  }

  function onSnap() {
    burst({ type: "lowpass", from: 700, to: 120, duration: 0.18, peak: 0.22, q: 0.5 });
    tone({ type: "sine", from: 90, to: 55, duration: 0.3, peak: 0.28 });
    tone({ type: "sine", from: 740, to: 1110, start: 0.04, duration: 0.45, peak: 0.07 });
    tone({ type: "sine", from: 1480, to: 2220, start: 0.06, duration: 0.55, peak: 0.025 });
  }

  function onUnsnap() {
    tone({ type: "sine", from: 520, to: 260, duration: 0.3, peak: 0.05 });
  }

  function release() {
    if (!ready) return;
    tone({ type: "sine", from: 340, to: 70, duration: 0.55, peak: 0.07, lowpass: 900 });
    burst({ type: "lowpass", from: 1400, to: 160, duration: 0.5, peak: 0.05, q: 0.4 });
  }

  // One cue per oath line; the last line is the biggest.
  function oath(index, total) {
    if (!ready) return;

    const last = index === total - 1;
    const root = 55 * Math.pow(2, index / 12);

    burst({
      from: 260,
      to: last ? 2400 : 1100,
      duration: last ? 2.2 : 1.5,
      attack: last ? 0.9 : 0.6,
      peak: last ? 0.12 : 0.07,
      q: 0.7
    });

    tone({
      type: "sine",
      from: root,
      to: root,
      duration: last ? 3.2 : 2.2,
      attack: 0.5,
      peak: last ? 0.3 : 0.2
    });

    if (last) {
      for (const [i, freq] of [220, 330, 440, 660].entries()) {
        tone({
          type: "sine",
          from: freq,
          duration: 3.6,
          attack: 0.8,
          start: i * 0.08,
          peak: 0.03
        });
      }
    }
  }

  // Build-up to the flash: a rising tone and noise that ends at `seconds`.
  function finishStart(seconds) {
    if (!ready) return;

    tone({
      type: "sawtooth",
      from: 70,
      to: 1500,
      duration: seconds,
      attack: seconds * 0.9,
      peak: 0.09,
      lowpass: 1800
    });

    tone({ type: "sine", from: 140, to: 3000, duration: seconds, attack: seconds * 0.9, peak: 0.05 });

    burst({
      from: 300,
      to: 7000,
      duration: seconds,
      attack: seconds * 0.9,
      peak: 0.16,
      q: 1.2
    });
  }

  function finishBoom() {
    if (!ready) return;

    tone({ type: "sine", from: 62, to: 26, duration: 3.2, attack: 0.005, peak: 0.75 });
    tone({ type: "sine", from: 124, to: 48, duration: 1.4, attack: 0.005, peak: 0.28 });
    burst({ type: "lowpass", from: 9000, to: 160, duration: 2.0, attack: 0.004, peak: 0.55, q: 0.5 });
    burst({ type: "highpass", from: 3000, to: 6000, duration: 1.2, attack: 0.004, peak: 0.1, q: 0.5 });

    for (const [i, freq] of [261.6, 392, 523.3, 784, 1046.5].entries()) {
      tone({
        type: "sine",
        from: freq,
        duration: 5,
        attack: 0.15,
        start: 0.05 + i * 0.05,
        peak: 0.05
      });
    }
  }

  function reveal() {
    if (!ready) return;
    tone({ type: "sine", from: 1568, duration: 2.4, attack: 0.02, peak: 0.04 });
    tone({ type: "sine", from: 2349, duration: 2.8, attack: 0.02, start: 0.08, peak: 0.02 });
  }

  // Short UI blips for the welcome page.
  function blip() {
    if (!ready) return;
    tone({ type: "sine", from: 660, to: 990, duration: 0.18, peak: 0.07 });
    tone({ type: "sine", from: 1320, to: 1760, start: 0.05, duration: 0.2, peak: 0.03 });
  }

  function construct() {
    if (!ready) return;
    burst({ from: 400, to: 3200, duration: 0.5, attack: 0.02, peak: 0.1, q: 1.4 });
    tone({ type: "triangle", from: 180, to: 540, duration: 0.45, peak: 0.1, lowpass: 1600 });
    tone({ type: "sine", from: 1040, to: 1560, start: 0.12, duration: 0.5, peak: 0.04 });
  }

  // A low, slow spoken line. Uses the browser's built-in voice, so it is
  // skipped when muted or when speech synthesis is not available.
  function speak(text) {
    if (!ready || muted || !("speechSynthesis" in window)) return;

    try {
      window.speechSynthesis.cancel();
      const line = new SpeechSynthesisUtterance(text);
      line.pitch = 0.55;
      line.rate = 0.86;
      line.volume = 0.9;
      window.speechSynthesis.speak(line);
    } catch (error) {
      /* voice is a bonus */
    }
  }

  function stopVoice() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
  }

  function reset() {
    if (!ready) return;
    burst({ from: 3000, to: 200, duration: 0.9, attack: 0.02, peak: 0.1, q: 0.6 });
    tone({ type: "sine", from: 440, to: 110, duration: 0.8, peak: 0.06 });
  }

  function setMuted(value) {
    muted = value;

    try {
      window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
    } catch (error) {
      /* not critical */
    }

    if (ready) master.gain.setTargetAtTime(muted ? 0 : 0.9, ctx.currentTime, 0.08);
    if (muted) stopVoice();
  }

  function suspend() {
    if (ctx && ctx.state === "running") ctx.suspend();
  }

  function resume() {
    if (ctx && ctx.state === "suspended") ctx.resume();
  }

  return {
    unlock,
    update,
    release,
    oath,
    finishStart,
    finishBoom,
    reveal,
    reset,
    blip,
    construct,
    speak,
    stopVoice,
    setMuted,
    suspend,
    resume,
    isMuted: () => muted,
    isUnlocked: () => ready
  };
}
