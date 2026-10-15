// Sound for the loader.
//
// Real recordings live in assets/audio/ (see AUDIO_PROMPTS.md for the list and
// how to generate them). Any file that is missing falls back to a quiet
// synthesised stand-in, so the pack can be added one file at a time.
//
// Browsers only allow audio after a user gesture. Call unlock() from pointer,
// touch and key handlers (on touch devices only the *end* of a tap counts).
// Until then every method is a safe no-op.

const MUTE_KEY = "green-lantern-loader:muted";
const AUDIO_DIR = "assets/audio/";

const SAMPLES = [
  "vo_oath_1", "vo_oath_2", "vo_oath_3", "vo_oath_4",
  "vo_ring_low", "vo_ring_full", "vo_welcome",
  "sfx_pickup", "sfx_knock_1", "sfx_knock_2", "sfx_knock_3", "sfx_drop",
  "sfx_power_on", "sfx_swish", "sfx_lock", "sfx_release", "sfx_oath_hit",
  "sfx_riser", "sfx_impact", "sfx_construct", "sfx_ui",
  "loop_ambience", "loop_charge", "loop_music",
  "oath_track"
];

export function createAudio() {
  let ctx = null;
  let master = null;
  let bus = null;     // sound effects and voice
  let music = null;   // ambience, music and charge hum; ducked under the voice
  let ready = false;
  let muted = false;

  try {
    muted = window.localStorage.getItem(MUTE_KEY) === "1";
  } catch (error) {
    /* storage can be blocked; the default is fine */
  }

  const buffers = new Map();
  const layers = {};
  let noise = null;
  let lastSwish = 0;

  /* ------------------------------------- */
  /* Samples                               */
  /* ------------------------------------- */

  async function fetchSample(name) {
    for (const ext of ["mp3", "wav", "ogg"]) {
      try {
        const response = await fetch(`${AUDIO_DIR}${name}.${ext}`);
        if (!response.ok) continue;
        const data = await response.arrayBuffer();
        return await ctx.decodeAudioData(data);
      } catch (error) {
        /* try the next format */
      }
    }

    return null;
  }

  async function loadSamples() {
    await Promise.all(
      SAMPLES.map(async name => {
        const buffer = await fetchSample(name);
        if (buffer) buffers.set(name, buffer);
      })
    );

    // Swap synthesised loops for the recorded ones once they arrive.
    startRecordedLoops();
  }

  const has = name => buffers.has(name);

  function play(name, { volume = 1, rate = 1, dest = bus, delay = 0 } = {}) {
    const buffer = buffers.get(name);
    if (!buffer) return null;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;

    const g = gain(volume);
    src.connect(g);
    g.connect(dest);
    src.start(ctx.currentTime + delay);
    return src;
  }

  /* ------------------------------------- */
  /* Synth building blocks (fallbacks)     */
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

  function tone({ type = "sine", from, to = from, start = 0, attack = 0.01, duration = 0.4, peak = 0.1, lowpass = 0, dest = bus }) {
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

  function burst({ type = "bandpass", from, to = from, start = 0, attack = 0.01, duration = 0.5, peak = 0.1, q = 0.8, dest = bus }) {
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

  // Synthesised drone, used until loop_ambience is available.
  function buildSynthAmbient() {
    const out = gain(0);
    out.connect(music);

    const lp = filter("lowpass", 160, 0.6);
    lp.connect(out);

    for (const [type, freq, detune] of [["sawtooth", 55, 0], ["sawtooth", 55, 9], ["sine", 27.5, 0]]) {
      const o = osc(type, freq, detune);
      o.connect(lp);
      o.start();
    }

    const lfo = osc("sine", 0.07);
    const lfoGain = gain(60);
    lfo.connect(lfoGain);
    lfoGain.connect(lp.frequency);
    lfo.start();

    layers.synthAmbient = out;
    out.gain.setTargetAtTime(0.1, ctx.currentTime, 2.2);
  }

  // Synthesised charge hum, used until loop_charge is available.
  function buildSynthCharge() {
    const out = gain(0);
    const lp = filter("lowpass", 240, 1.1);
    lp.connect(out);

    const a = osc("sawtooth", 62);
    const b = osc("sawtooth", 62, 11);
    const sub = osc("sine", 31);
    for (const node of [a, b, sub]) {
      node.connect(lp);
      node.start();
    }

    layers.synthCharge = { out, lp, a, b, sub };
  }

  function loopLayer(name, volume) {
    const src = ctx.createBufferSource();
    src.buffer = buffers.get(name);
    src.loop = true;
    const g = gain(0);
    src.connect(g);
    g.connect(music);
    src.start();
    g.gain.setTargetAtTime(volume, ctx.currentTime, 1.5);
    return { src, g };
  }

  function startRecordedLoops() {
    if (has("loop_ambience")) {
      layers.synthAmbient.gain.setTargetAtTime(0, ctx.currentTime, 0.8);
      layers.ambience = loopLayer("loop_ambience", 0.55);
    }

    if (has("loop_music")) layers.music = loopLayer("loop_music", 0.32);

    if (has("loop_charge")) {
      layers.charge = loopLayer("loop_charge", 0);
    } else {
      layers.synthCharge.out.connect(music);
    }
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
    const wet = gain(0.18);

    bus.connect(master);
    bus.connect(reverb);
    reverb.connect(wet);
    wet.connect(master);

    music = gain(1);
    music.connect(master);

    noise = makeNoise(2);

    buildSynthAmbient();
    buildSynthCharge();

    ready = true;
    loadSamples();
    return true;
  }

  // Called every frame with the scene state.
  function update({ charging, charge, finale, swing }) {
    if (!ready) return;

    const t = ctx.currentTime;
    const level = finale ? 1 : charge;

    if (layers.charge) {
      layers.charge.g.gain.setTargetAtTime(charging ? 0.35 + level * 0.5 : 0, t, charging ? 0.35 : 0.2);
      layers.charge.src.playbackRate.setTargetAtTime(0.85 + level * 0.55, t, 0.3);
    } else {
      const c = layers.synthCharge;
      const base = 62 + level * 98;
      c.a.frequency.setTargetAtTime(base, t, 0.25);
      c.b.frequency.setTargetAtTime(base, t, 0.25);
      c.sub.frequency.setTargetAtTime(base / 2, t, 0.25);
      c.lp.frequency.setTargetAtTime(220 + level * 2200, t, 0.3);
      c.out.gain.setTargetAtTime(charging ? 0.06 + level * 0.1 : 0, t, charging ? 0.4 : 0.18);
    }

    if (layers.ambience) layers.ambience.g.gain.setTargetAtTime(finale ? 0.3 : 0.55, t, 0.8);

    // A whoosh when the ring is swung hard.
    if (swing > 0.45 && t - lastSwish > 0.4) {
      lastSwish = t;
      if (!play("sfx_swish", { volume: Math.min(1, swing), rate: 0.9 + swing * 0.3 })) {
        burst({ from: 400, to: 1600, duration: 0.3, attack: 0.05, peak: 0.04 * swing, q: 1.2 });
      }
    }
  }

  // Lower the music while the voice speaks.
  function duck(on) {
    if (!ready) return;
    music.gain.setTargetAtTime(on ? 0.35 : 1, ctx.currentTime, on ? 0.12 : 0.6);
  }

  // Play a voice clip. Returns its duration in seconds, or 0 if there is none.
  function voiceClip(name, onEnded) {
    if (!ready || !has(name)) return 0;

    const src = play(name, { volume: 1 });
    duck(true);
    src.onended = () => {
      duck(false);
      onEnded?.();
    };

    voiceSource = src;
    return src.buffer.duration;
  }

  let voiceSource = null;

  /* ------------------------------------- */
  /* Oath track                            */
  /* ------------------------------------- */

  // A full spoken oath (oath_track) that plays while the ring is held on the
  // lantern and pauses when it is let go, resuming where it stopped.
  const track = { src: null, gain: null, offset: 0, startedAt: 0, playing: false };

  const hasTrack = () => ready && has("oath_track");

  function trackTime() {
    if (!track.playing) return track.offset;
    return track.offset + (ctx.currentTime - track.startedAt);
  }

  function trackPlay() {
    if (!hasTrack() || track.playing) return;

    const buffer = buffers.get("oath_track");
    if (track.offset >= buffer.duration) return;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = gain(0);
    src.connect(g);
    g.connect(bus);

    const t = ctx.currentTime;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(1, t + 0.08);
    src.start(t, track.offset);

    track.src = src;
    track.gain = g;
    track.startedAt = t;
    track.playing = true;
    duck(true);
  }

  function trackPause() {
    if (!track.playing) return;

    track.offset = trackTime();
    track.playing = false;

    const t = ctx.currentTime;
    const { src, gain: g } = track;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + 0.12);
    src.stop(t + 0.14);
    duck(false);
  }

  function trackReset() {
    trackPause();
    track.offset = 0;
  }

  function stopVoiceClip() {
    if (voiceSource) {
      try {
        voiceSource.onended = null;
        voiceSource.stop();
      } catch (error) {
        /* already stopped */
      }
      voiceSource = null;
      duck(false);
    }
  }

  function knock(strength = 1) {
    if (!ready) return;
    const s = Math.max(0.15, Math.min(1, strength));
    const name = `sfx_knock_${1 + Math.floor(Math.random() * 3)}`;

    if (play(name, { volume: 0.4 + s * 0.6, rate: 0.95 + Math.random() * 0.1 }) || play("sfx_knock_1", { volume: 0.4 + s * 0.6 })) return;

    const base = 1080 + Math.random() * 160;
    for (const [ratio, amp, length] of [[1, 1, 0.9], [2.76, 0.6, 0.6], [5.4, 0.36, 0.4]]) {
      tone({ from: base * ratio, duration: length * (0.5 + s * 0.6), attack: 0.002, peak: 0.07 * amp * (0.35 + s) });
    }
    tone({ from: 190, to: 80, duration: 0.22, attack: 0.002, peak: 0.2 * s });
  }

  function drop(strength = 0.5) {
    if (!ready) return;
    if (play("sfx_drop", { volume: Math.min(1, 0.3 + strength) })) return;
    knock(strength * 0.5);
  }

  function powerOn() {
    if (!ready || play("sfx_power_on")) return;
    tone({ type: "sawtooth", from: 90, to: 880, duration: 0.7, attack: 0.25, peak: 0.04, lowpass: 2400 });
    tone({ from: 55, duration: 1.4, attack: 0.4, peak: 0.2 });
  }

  function pickup() {
    if (!ready || play("sfx_pickup", { volume: 0.8 })) return;
    burst({ from: 300, to: 1600, duration: 0.3, attack: 0.04, peak: 0.04, q: 1.1 });
  }

  function dock() {
    if (!ready || play("sfx_lock")) return;
    burst({ type: "lowpass", from: 700, to: 120, duration: 0.18, peak: 0.18, q: 0.5 });
    tone({ from: 90, to: 55, duration: 0.4, peak: 0.24 });
  }

  function undock() {
    if (!ready) return;
    if (!play("sfx_release", { volume: 0.5 })) tone({ from: 520, to: 260, duration: 0.3, peak: 0.04 });
  }

  function release() {
    if (!ready || play("sfx_release", { volume: 0.7 })) return;
    tone({ from: 340, to: 70, duration: 0.55, peak: 0.05, lowpass: 900 });
  }

  // One cinematic hit as each line of the oath begins.
  function oathHit(index, total) {
    if (!ready) return;
    const last = index === total - 1;
    if (play("sfx_oath_hit", { volume: last ? 1 : 0.75, rate: last ? 0.92 : 1 })) return;
    tone({ from: 70, to: 38, duration: last ? 3 : 2, attack: 0.02, peak: last ? 0.3 : 0.2 });
  }

  function finishStart(seconds) {
    if (!ready || play("sfx_riser")) return;
    tone({ type: "sawtooth", from: 70, to: 1500, duration: seconds, attack: seconds * 0.9, peak: 0.07, lowpass: 1800 });
    burst({ from: 300, to: 7000, duration: seconds, attack: seconds * 0.9, peak: 0.12, q: 1.2 });
  }

  function finishBoom() {
    if (!ready || play("sfx_impact")) return;
    tone({ from: 62, to: 26, duration: 3.2, attack: 0.005, peak: 0.7 });
    burst({ type: "lowpass", from: 9000, to: 160, duration: 2.0, attack: 0.004, peak: 0.45, q: 0.5 });
  }

  function ui() {
    if (!ready || play("sfx_ui", { volume: 0.6 })) return;
    tone({ from: 1320, to: 1760, duration: 0.15, peak: 0.03 });
  }

  // A construct part locking into place; `final` for the finished object.
  function construct(final = false) {
    if (!ready) return;

    if (final) {
      if (!play("sfx_construct")) {
        burst({ from: 400, to: 3200, duration: 0.5, attack: 0.02, peak: 0.08, q: 1.4 });
        tone({ type: "triangle", from: 180, to: 540, duration: 0.45, peak: 0.08, lowpass: 1600 });
      }
      return;
    }

    if (!play("sfx_ui", { volume: 0.35, rate: 1.2 + Math.random() * 0.3 })) {
      tone({ from: 1500 + Math.random() * 500, duration: 0.08, peak: 0.02 });
    }
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
    voiceClip,
    stopVoiceClip,
    hasTrack,
    trackTime,
    trackPlay,
    trackPause,
    trackReset,
    knock,
    drop,
    powerOn,
    pickup,
    dock,
    undock,
    release,
    oathHit,
    finishStart,
    finishBoom,
    ui,
    construct,
    setMuted,
    suspend,
    resume,
    isMuted: () => muted,
    isUnlocked: () => ready
  };
}
