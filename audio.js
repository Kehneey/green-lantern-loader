// Synthesised sound for the loader. Nothing is downloaded: every sound is
// built from oscillators and noise with the Web Audio API.
//
// Browsers only allow audio after a user gesture. Call unlock() from pointer,
// touch and key handlers (on touch devices only the *end* of a tap counts).
// Until then every method is a safe no-op.

const MUTE_KEY = "green-lantern-loader:muted";

export function createAudio() {
  let ctx = null;
  let master = null;
  let bus = null;     // sound effects
  let music = null;   // drone and charge hum; ducked under the voice
  let ready = false;
  let muted = false;

  try {
    muted = window.localStorage.getItem(MUTE_KEY) === "1";
  } catch (error) {
    /* storage can be blocked; the default is fine */
  }

  const layers = {};
  let noise = null;

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

  function loopNoise() {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    return src;
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
    const src = loopNoise();

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
    out.connect(music);

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
    const air = loopNoise();
    const airFilter = filter("bandpass", 900, 0.4);
    const airGain = gain(0.014);
    air.connect(airFilter);
    airFilter.connect(airGain);
    airGain.connect(out);
    air.start();

    layers.ambient = { out, lp };
    out.gain.setTargetAtTime(0.16, ctx.currentTime, 2.2);
  }

  function buildCharge() {
    const out = gain(0);
    out.connect(music);

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
    shimmerGain.connect(music);

    // Magnetic pull while the ring approaches the lens.
    const pullGain = gain(0);
    const pull = osc("sine", 200);
    const vib = osc("sine", 5);
    const vibGain = gain(6);
    vib.connect(vibGain);
    vibGain.connect(pull.frequency);
    pull.connect(pullGain);
    pullGain.connect(music);

    for (const node of [a, b, sub, lfo, s1, s2, pull, vib]) node.start();

    layers.charge = { out, lp, a, b, sub, lfo, shimmerGain, s1, s2, pullGain, pull };
  }

  // Air rushing past the ring as it is swung; follows the ring's speed.
  function buildSwish() {
    const src = loopNoise();
    const bp = filter("bandpass", 700, 1.4);
    const g = gain(0);
    src.connect(bp);
    bp.connect(g);
    g.connect(bus);
    src.start();
    layers.swish = { bp, g };
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
    const wet = gain(0.3);

    bus.connect(master);
    bus.connect(reverb);
    reverb.connect(wet);
    wet.connect(master);

    music = gain(1);
    music.connect(bus);

    noise = makeNoise(2);

    buildAmbient();
    buildCharge();
    buildSwish();

    ready = true;
    return true;
  }

  // Called every frame with the scene state.
  function update({ attraction, docked, charging, charge, finale, swing }) {
    if (!ready) return;

    const t = ctx.currentTime;
    const { ambient, charge: c, swish } = layers;
    const level = finale ? 1 : charge;

    c.pullGain.gain.setTargetAtTime(finale || docked ? 0 : attraction * 0.05, t, 0.15);
    c.pull.frequency.setTargetAtTime(170 + attraction * 230, t, 0.2);

    const base = 62 + level * 98;
    c.a.frequency.setTargetAtTime(base, t, 0.25);
    c.b.frequency.setTargetAtTime(base, t, 0.25);
    c.sub.frequency.setTargetAtTime(base / 2, t, 0.25);
    c.lp.frequency.setTargetAtTime(220 + level * 2800, t, 0.3);
    c.lfo.frequency.setTargetAtTime(2.5 + level * 13, t, 0.3);

    c.out.gain.setTargetAtTime(charging ? 0.1 + level * 0.17 : 0, t, charging ? 0.4 : 0.18);

    const shimmer = charging ? level * level * 0.045 : 0;
    c.shimmerGain.gain.setTargetAtTime(shimmer, t, 0.3);
    c.s1.frequency.setTargetAtTime(600 + level * 1500, t, 0.3);
    c.s2.frequency.setTargetAtTime(604 + level * 1500, t, 0.3);

    ambient.lp.frequency.setTargetAtTime(170 + level * 520, t, 0.6);
    ambient.out.gain.setTargetAtTime(finale ? 0.06 : 0.16 + level * 0.06, t, 0.5);

    swish.g.gain.setTargetAtTime(Math.min(0.12, swing * swing * 0.14), t, 0.05);
    swish.bp.frequency.setTargetAtTime(500 + swing * 2200, t, 0.05);
  }

  // Lower the music while the voice speaks.
  function duck(on) {
    if (!ready) return;
    music.gain.setTargetAtTime(on ? 0.4 : 1, ctx.currentTime, on ? 0.12 : 0.6);
  }

  // Metal on glass. `strength` is 0..1 from how hard the ring hit.
  function clank(strength = 1) {
    if (!ready) return;

    const s = Math.max(0.15, Math.min(1, strength));
    const base = 1080 + Math.random() * 160;

    // Inharmonic partials make it read as struck metal rather than a beep.
    for (const [ratio, amp, length] of [
      [1, 1, 0.9],
      [2.76, 0.6, 0.6],
      [5.4, 0.36, 0.4],
      [8.93, 0.2, 0.26]
    ]) {
      tone({
        type: "sine",
        from: base * ratio,
        duration: length * (0.5 + s * 0.6),
        attack: 0.002,
        peak: 0.085 * amp * (0.35 + s)
      });
    }

    burst({ type: "highpass", from: 3800, duration: 0.07, attack: 0.001, peak: 0.28 * s, q: 0.6 });
    tone({ type: "sine", from: 190, to: 80, duration: 0.22, attack: 0.002, peak: 0.24 * s });
  }

  // The ring waking up: crackle, a rising chirp and a hum swelling in.
  function powerOn() {
    if (!ready) return;

    for (let i = 0; i < 7; i++) {
      burst({
        from: 2000 + Math.random() * 4000,
        duration: 0.05 + Math.random() * 0.06,
        attack: 0.002,
        start: i * 0.07 + Math.random() * 0.05,
        peak: 0.09,
        q: 3
      });
    }

    tone({ type: "sawtooth", from: 90, to: 880, duration: 0.7, attack: 0.25, peak: 0.05, lowpass: 2400 });
    tone({ type: "sine", from: 220, to: 1320, duration: 0.8, attack: 0.3, peak: 0.06, start: 0.1 });
    tone({ type: "sine", from: 55, duration: 1.4, attack: 0.4, peak: 0.25 });
    tone({ type: "sine", from: 1760, duration: 1.1, attack: 0.02, start: 0.7, peak: 0.035 });
  }

  function pickup() {
    if (!ready) return;
    burst({ from: 300, to: 1800, duration: 0.32, attack: 0.04, peak: 0.07, q: 1.1 });
    tone({ type: "sine", from: 990, to: 1320, start: 0.04, duration: 0.3, peak: 0.03 });
  }

  function dock() {
    if (!ready) return;
    burst({ type: "lowpass", from: 700, to: 120, duration: 0.18, peak: 0.22, q: 0.5 });
    tone({ type: "sine", from: 90, to: 55, duration: 0.3, peak: 0.28 });
    tone({ type: "sine", from: 740, to: 1110, start: 0.04, duration: 0.45, peak: 0.07 });
    tone({ type: "sine", from: 1480, to: 2220, start: 0.06, duration: 0.55, peak: 0.025 });
  }

  function undock() {
    if (!ready) return;
    tone({ type: "sine", from: 520, to: 260, duration: 0.3, peak: 0.05 });
  }

  function release() {
    if (!ready) return;
    tone({ type: "sine", from: 340, to: 70, duration: 0.55, peak: 0.07, lowpass: 900 });
    burst({ type: "lowpass", from: 1400, to: 160, duration: 0.5, peak: 0.05, q: 0.4 });
  }

  // A soft, low impact under each word of the oath, heavier on key words.
  function wordHit(hot, final) {
    if (!ready) return;
    const weight = (hot ? 1 : 0.5) * (final ? 1.3 : 1);
    tone({ type: "sine", from: 96, to: 46, duration: 0.26, attack: 0.004, peak: 0.13 * weight });
    burst({ type: "lowpass", from: 2600, to: 280, duration: 0.14, attack: 0.002, peak: 0.05 * weight, q: 0.5 });
  }

  // One swell per oath line; the last line is the biggest.
  function oath(index, total) {
    if (!ready) return;

    const last = index === total - 1;
    const root = 55 * Math.pow(2, index / 12);

    burst({
      from: 260,
      to: last ? 2400 : 1100,
      duration: last ? 2.2 : 1.5,
      attack: last ? 0.9 : 0.6,
      peak: last ? 0.1 : 0.06,
      q: 0.7
    });

    tone({ type: "sine", from: root, duration: last ? 3.2 : 2.2, attack: 0.5, peak: last ? 0.26 : 0.18 });

    if (last) {
      for (const [i, freq] of [220, 330, 440, 660].entries()) {
        tone({ type: "sine", from: freq, duration: 3.6, attack: 0.8, start: i * 0.08, peak: 0.028 });
      }
    }
  }

  function caption() {
    if (!ready) return;
    burst({ from: 600, to: 3000, duration: 0.22, attack: 0.01, peak: 0.05, q: 1.2 });
  }

  // Build-up to the flash: a rising tone and noise that ends at `seconds`.
  function finishStart(seconds) {
    if (!ready) return;

    tone({ type: "sawtooth", from: 70, to: 1500, duration: seconds, attack: seconds * 0.9, peak: 0.09, lowpass: 1800 });
    tone({ type: "sine", from: 140, to: 3000, duration: seconds, attack: seconds * 0.9, peak: 0.05 });
    burst({ from: 300, to: 7000, duration: seconds, attack: seconds * 0.9, peak: 0.16, q: 1.2 });
  }

  function finishBoom() {
    if (!ready) return;

    tone({ type: "sine", from: 62, to: 26, duration: 3.2, attack: 0.005, peak: 0.75 });
    tone({ type: "sine", from: 124, to: 48, duration: 1.4, attack: 0.005, peak: 0.28 });
    burst({ type: "lowpass", from: 9000, to: 160, duration: 2.0, attack: 0.004, peak: 0.55, q: 0.5 });
    burst({ type: "highpass", from: 3000, to: 6000, duration: 1.2, attack: 0.004, peak: 0.1, q: 0.5 });

    for (const [i, freq] of [261.6, 392, 523.3, 784, 1046.5].entries()) {
      tone({ type: "sine", from: freq, duration: 5, attack: 0.15, start: 0.05 + i * 0.05, peak: 0.05 });
    }
  }

  function reveal() {
    if (!ready) return;
    tone({ type: "sine", from: 1568, duration: 2.4, attack: 0.02, peak: 0.04 });
    tone({ type: "sine", from: 2349, duration: 2.8, attack: 0.02, start: 0.08, peak: 0.02 });
  }

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
    duck,
    clank,
    powerOn,
    pickup,
    dock,
    undock,
    release,
    wordHit,
    oath,
    caption,
    finishStart,
    finishBoom,
    reveal,
    blip,
    construct,
    reset,
    setMuted,
    suspend,
    resume,
    isMuted: () => muted,
    isUnlocked: () => ready
  };
}
