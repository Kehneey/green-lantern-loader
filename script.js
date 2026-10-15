import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { createAudio } from "./audio.js";
import { createVoice } from "./voice.js";
import { createOath, TRACK_END } from "./oath.js";
import { createHand, createGhost } from "./hand.js";
import { createConstructs } from "./constructs.js";

/* ===================================== */
/* DOM                                   */
/* ===================================== */

const vw = () => Math.max(1, window.innerWidth);
const vh = () => Math.max(1, window.innerHeight);
const clamp = THREE.MathUtils.clamp;

const $ = id => document.getElementById(id);

const loaderEl = $("loader");
const stageEl = $("threeStage");
const promptEl = $("prompt");
const srStatus = $("srStatus");
const beam = $("beam");
const beamBlur = $("beamBlur");
const flash = $("flash");
const reveal = $("reveal");
const restart = $("restart");
const introEl = $("intro");
const introCount = $("introCount");
const introFill = $("introFill");
const introLabel = $("introLabel");
const enterBtn = $("enterBtn");
const enterQuiet = $("enterQuiet");
const soundToggle = $("soundToggle");
const soundLabel = $("soundLabel");
const skipBtn = $("skipIntro");
const powerText = $("powerText");
const powerFill = $("powerFill");
const chapterNum = $("chapterNum");
const chapterName = $("chapterName");
const markerEl = $("pickupMarker");
const cuesEl = $("cues");
const constructsEl = $("constructs");
const edgeLeft = $("edgeLeft");
const edgeRight = $("edgeRight");
const callsignEl = $("callsign");
const lanternIdEl = $("lanternId");
const chargeTimeEl = $("chargeTime");
const dispatchEl = $("dispatch");
const rerollBtn = $("reroll");
const copyBtn = $("copyId");

/* ===================================== */
/* TUNING                                */
/* ===================================== */

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const COARSE = window.matchMedia("(pointer: coarse)").matches;
const LOW_POWER = COARSE || (navigator.hardwareConcurrency || 8) <= 4;

// Timing is in seconds and frame-rate independent.
const CHARGE_SECONDS = 24;      // continuous hold from 2% to 100%
const CHARGE_RAMP = 1.4;        // seconds for the charge rate to reach full speed
const DRAIN_PER_SECOND = 0.02;  // lost per second while docked but not held
const START_CHARGE = 0.02;      // the ring wakes up at 2%

// Each oath line is queued when the charge passes its threshold. The charge
// waits at 99% until the whole oath has been spoken.
const OATH_THRESHOLDS = [0.06, 0.3, 0.54, 0.78];

// Finale (seconds after the charge completes).
const FINISH_PEAK = 1.7;
const FINISH_FLASH = 2.0;
const FINISH_REVEAL = 3.8;

const CAMERA_Z = 10.6;
const BATTERY_HEIGHT = 2.9;
const RING_DIAMETER = 0.78;
const RING_Z_REST = 2.0;   // world z of the ring lying at the bottom
const RING_Z_HELD = 3.0;   // closer to the camera once picked up

const GRAVITY = 2600;      // px/s², for a dropped or thrown ring
const KNOCK_SPEED = 420;   // px/s the ring must be moving to "knock" the edge
const HINT_DELAY = 3.2;    // seconds of hesitation before the ghost glove demonstrates

const MAX_PIXEL_RATIO = LOW_POWER ? 1.4 : 1.75;

/* ===================================== */
/* STATE                                 */
/* ===================================== */

const Stage = {
  LOADING: "loading",
  INTRO: "intro",     // title card, waiting for Enter
  PICKUP: "pickup",   // ring lies at the bottom, dead
  TAP: "tap",         // ring in hand: knock it against the edge to wake it
  SEEK: "seek",       // ring awake at 2%: take it to the lantern
  DOCKED: "docked",   // ring on the lens: hold to charge
  FINALE: "finale",
  WELCOME: "welcome"
};

let stage = Stage.LOADING;
let stageTime = 0;
let pendingStage = null;

let battery;
let batteryMesh;
let batteryUniforms;
let ringUniforms;
let ring;
let ringSpin;
let ringAura;
let lensGlow;
let lensHalo;
let flare;
let shockwave;
let batteryWidth = BATTERY_HEIGHT * 0.88;

// The pointer: mouse, touch, pen, or the keyboard driving a virtual hand.
const pointer = {
  x: vw() * 0.5,
  y: vh() * 0.62,
  type: COARSE ? "touch" : "mouse",
  down: false,
  id: null,
  origin: "free",
  inside: false,
  overButton: false
};

// The ring in screen space while it is on the floor, in the hand or falling.
const ringBody = {
  mode: "rest",   // rest | held | falling | docked
  x: vw() * 0.5,
  y: vh() * 0.8,
  vx: 0,
  vy: 0,
  offX: 0,
  offY: 0,
  speed: 0,
  lastHit: -10
};

const layout = { z: CAMERA_Z, batteryY: 0.52, floorY: vh() * 0.8, bar: 30, lanternBottom: 0.6 };

let powered = false;
let wakeTime = -10;
let charge = 0;
let holdRamp = 0;
let holdSeconds = 0;
let wasCharging = false;
let attractionLevel = 0;
let finishTime = 0;
let flashFired = false;
let revealShown = false;
let finaleLineDone = false;
let welcomeSpoken = false;
let lastPowerReport = -10;
let idle = 0;
let shakeAmount = 0;
let punch = 0;
let elapsed = 0;
let ready = false;

// A quick click (or Space tap) on the ring picks it up and keeps it in the
// glove without holding the button; the next click lets go.
let sticky = false;
let grabAt = 0;
const grabFrom = { x: 0, y: 0 };

let promptOverride = null;
let lastPrompt = null;
let lastPercent = -1;

const audio = createAudio();
const voice = createVoice({ audio, onSpeakingChange: speaking => audio.duck(speaking) });

/* ===================================== */
/* SCENE                                 */
/* ===================================== */

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x020604, 0.02);

const camera = new THREE.PerspectiveCamera(32, vw() / vh(), 0.1, 100);
camera.position.set(0, 0, CAMERA_Z);

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
} catch (error) {
  renderer = null;
}

if (!renderer) {
  introEl.classList.add("is-error");
  introLabel.textContent = "This browser can't show 3D (WebGL is unavailable).";
  throw new Error("WebGL unavailable");
}

renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
renderer.setSize(vw(), vh());
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

stageEl.appendChild(renderer.domElement);
renderer.domElement.setAttribute("role", "img");
renderer.domElement.setAttribute("aria-label", "A Green Lantern power battery and ring");

// Studio reflections are what make the metal look like metal.
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.4;
pmrem.dispose();

/* ===================================== */
/* POST PROCESSING                       */
/* ===================================== */

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(new THREE.Vector2(vw() / 2, vh() / 2), 0.5, 0.55, 0.86);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// Light shafts: a radial blur of the brightest pixels out from the lens, the
// classic "volumetric" god-ray look. Runs in linear HDR, before tone mapping.
const SHAFT_SAMPLES = LOW_POWER ? 24 : 40;

const shaftPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uLight: { value: new THREE.Vector2(0.5, 0.6) },
    uStrength: { value: 0.5 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    #define SAMPLES ${SHAFT_SAMPLES}
    uniform sampler2D tDiffuse;
    uniform vec2 uLight;
    uniform float uStrength;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec4 base = texture2D(tDiffuse, vUv);
      vec2 delta = (vUv - uLight) / float(SAMPLES) * 0.6;

      // Start each pixel's march at a random offset so the samples don't band.
      vec2 uv = vUv - delta * hash(vUv * 1000.0);
      float decay = 1.0;
      vec3 rays = vec3(0.0);

      for (int i = 0; i < SAMPLES; i++) {
        uv -= delta;
        vec3 s = texture2D(tDiffuse, uv).rgb;

        // Only light near the lens casts shafts, not every highlight.
        float nearLens = smoothstep(0.22, 0.0, distance(uv, uLight));
        float bright = max(0.0, max(s.g, max(s.r, s.b)) - 0.85) * nearLens;

        rays += s * bright * decay;
        decay *= 0.955;
      }

      gl_FragColor = vec4(base.rgb + rays * (uStrength / float(SAMPLES)), base.a);
    }
  `
});

composer.insertPass(shaftPass, 2);

// Film finish: colour grade (cool shadows, soft S-curve), vignette, a touch of
// chromatic aberration, grain, and a fade from black for the opening.
const lensPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAberration: { value: 0.0015 },
    uGrain: { value: REDUCED_MOTION ? 0 : 0.05 },
    uVignette: { value: 0.7 },
    uFade: { value: 0 }
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uAberration;
    uniform float uGrain;
    uniform float uVignette;
    uniform float uFade;
    varying vec2 vUv;

    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }

    void main() {
      vec2 d = vUv - 0.5;
      float r2 = dot(d, d);
      vec2 shift = d * r2 * uAberration * 18.0;

      vec3 c;
      c.r = texture2D(tDiffuse, vUv + shift).r;
      c.g = texture2D(tDiffuse, vUv).g;
      c.b = texture2D(tDiffuse, vUv - shift).b;
      c = clamp(c, 0.0, 1.0);

      // Grade: slightly desaturated, teal in the shadows, gentle S-curve.
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 0.86);
      c *= mix(vec3(0.8, 0.97, 1.06), vec3(1.0), smoothstep(0.0, 0.45, l));
      c = mix(c, c * c * (3.0 - 2.0 * c), 0.35);

      float vignette = smoothstep(0.95, 0.2, length(d * vec2(1.0, 1.15)) * 1.2);
      c *= mix(1.0 - uVignette, 1.0, vignette);

      c += (hash(vUv * 1400.0 + fract(uTime) * 91.0) - 0.5) * uGrain;
      c *= uFade;

      gl_FragColor = vec4(c, 1.0);
    }
  `
});
composer.addPass(lensPass);

/* ===================================== */
/* LIGHTING                              */
/* ===================================== */

scene.add(new THREE.AmbientLight(0x4f7a62, 0.16));

const keyLight = new THREE.DirectionalLight(0xdff7e6, 1.3);
keyLight.position.set(4.2, 5.2, 6.6);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x2a5a3d, 0.45);
fillLight.position.set(-4, 1.2, 4.2);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0x14ff74, 3.4);
rimLight.position.set(-2.6, 3.2, -4.2);
scene.add(rimLight);

const rimLightB = new THREE.DirectionalLight(0x9affc8, 2.2);
rimLightB.position.set(3.4, -1.8, -3.6);
scene.add(rimLightB);

const chargeLight = new THREE.PointLight(0x67ff9e, 1.4, 9, 2);
scene.add(chargeLight);

const contactLight = new THREE.PointLight(0xe2ffe9, 0, 6, 2);
scene.add(contactLight);

/* ===================================== */
/* TEXTURES                              */
/* ===================================== */

function radialTexture() {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.18, "rgba(210,255,225,0.7)");
  g.addColorStop(0.5, "rgba(60,255,130,0.18)");
  g.addColorStop(1, "rgba(0,255,102,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function streakTexture() {
  const w = 512;
  const h = 32;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  const gx = ctx.createLinearGradient(0, 0, w, 0);
  gx.addColorStop(0, "rgba(0,255,102,0)");
  gx.addColorStop(0.42, "rgba(110,255,170,0.55)");
  gx.addColorStop(0.5, "rgba(255,255,255,1)");
  gx.addColorStop(0.58, "rgba(110,255,170,0.55)");
  gx.addColorStop(1, "rgba(0,255,102,0)");
  ctx.fillStyle = gx;
  ctx.fillRect(0, 0, w, h);
  ctx.globalCompositeOperation = "destination-in";
  const gy = ctx.createLinearGradient(0, 0, 0, h);
  gy.addColorStop(0, "rgba(0,0,0,0)");
  gy.addColorStop(0.5, "rgba(0,0,0,1)");
  gy.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gy;
  ctx.fillRect(0, 0, w, h);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

const glowTexture = radialTexture();
const flareTexture = streakTexture();

function additive(map, color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    map,
    color,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });
}

/* ===================================== */
/* HAZE                                  */
/* ===================================== */

// Slow-drifting smoke behind the lantern, lit green by it. Two layers at
// different depths give the frame parallax and atmosphere.
function makeHaze({ z, width, height, scale, speed, intensity }) {
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: intensity },
      uScale: { value: scale },
      uSpeed: { value: speed },
      uColor: { value: new THREE.Color(0x3dff8c) }
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      uniform float uScale;
      uniform float uSpeed;
      uniform vec3 uColor;
      varying vec2 vUv;

      float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

      float noise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
                   mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 5; i++) {
          v += a * noise(p);
          p *= 2.03;
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 p = vUv * vec2(uScale * 1.6, uScale) + vec2(uTime * 0.012, -uTime * 0.005) * uSpeed;
        float n = fbm(p + fbm(p * 1.7 + uTime * 0.02 * uSpeed));
        float mask = smoothstep(0.75, 0.05, distance(vUv, vec2(0.5, 0.55)));
        float a = pow(n, 2.4) * mask * uIntensity;
        gl_FragColor = vec4(uColor * a, a);
      }
    `
  });

  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
  mesh.position.z = z;
  mesh.renderOrder = -1;
  scene.add(mesh);
  return material;
}

const hazeBack = makeHaze({ z: -4, width: 34, height: 20, scale: 3, speed: 1, intensity: 0.22 });
const hazeFront = makeHaze({ z: -1.2, width: 20, height: 12, scale: 4.5, speed: 1.6, intensity: 0.08 });

/* ===================================== */
/* PARTICLES (GPU points)                */
/* ===================================== */

const MAX_PARTICLES = REDUCED_MOTION ? 160 : LOW_POWER ? 260 : 420;

const particleGeometry = new THREE.BufferGeometry();
const particlePositions = new Float32Array(MAX_PARTICLES * 3);
const particleSizes = new Float32Array(MAX_PARTICLES);
const particleAlphas = new Float32Array(MAX_PARTICLES);

particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
particleGeometry.setAttribute("aSize", new THREE.BufferAttribute(particleSizes, 1));
particleGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(particleAlphas, 1));

function pointScale() {
  return (renderer.getPixelRatio() * vh()) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
}

const particleMaterial = new THREE.ShaderMaterial({
  uniforms: { uScale: { value: pointScale() } },
  transparent: true,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
  vertexShader: /* glsl */ `
    attribute float aSize;
    attribute float aAlpha;
    uniform float uScale;
    varying float vAlpha;
    void main() {
      vAlpha = aAlpha;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aSize * uScale / -mv.z;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float a = smoothstep(0.5, 0.0, d);
      a *= a;
      vec3 color = mix(vec3(0.2, 1.0, 0.5), vec3(0.9, 1.0, 0.93), a * a);
      gl_FragColor = vec4(color * a * vAlpha, a * vAlpha);
    }
  `
});

const particleSystem = new THREE.Points(particleGeometry, particleMaterial);
particleSystem.frustumCulled = false;
scene.add(particleSystem);

const particles = Array.from({ length: MAX_PARTICLES }, () => ({
  alive: false,
  kind: 0,
  age: 0,
  life: 1,
  size: 0.03,
  px: 0, py: 0, pz: 0,
  vx: 0, vy: 0, vz: 0,
  sx: 0, sy: 0, sz: 0,
  phase: 0,
  amp: 0
}));

let particleCursor = 0;

const scratch = {
  a: new THREE.Vector3(),
  ndc: new THREE.Vector3(),
  socketWorld: new THREE.Vector3(),
  socketScreen: { x: 0, y: 0 },
  ringScreen: { x: 0, y: 0 },
  target: new THREE.Vector3(),
  point: new THREE.Vector3(),
  q: new THREE.Quaternion()
};

function spawnParticle() {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = particles[(particleCursor + i) % MAX_PARTICLES];
    if (!p.alive) {
      particleCursor = (particleCursor + i + 1) % MAX_PARTICLES;
      p.alive = true;
      p.age = 0;
      return p;
    }
  }
  return null;
}

// Energy leaving the ring and spiralling into the lantern's lens.
function emitStream(count) {
  for (let i = 0; i < count; i++) {
    const p = spawnParticle();
    if (!p) return;

    p.kind = 1;
    p.life = 0.9 + Math.random() * 0.8;
    p.size = 0.016 + Math.random() * 0.03;
    p.sx = ring.position.x + (Math.random() - 0.5) * 0.18;
    p.sy = ring.position.y + (Math.random() - 0.5) * 0.18;
    p.sz = ring.position.z + (Math.random() - 0.2) * 0.1;
    p.phase = Math.random() * Math.PI * 2;
    p.amp = 0.12 + Math.random() * 0.34;
  }
}

// Sparks thrown from `origin` (the lens by default).
function emitSparks(count, power = 1, origin = scratch.socketWorld) {
  for (let i = 0; i < count; i++) {
    const p = spawnParticle();
    if (!p) return;

    const angle = Math.random() * Math.PI * 2;
    const speed = (0.5 + Math.random() * 1.9) * power;

    p.kind = 0;
    p.life = 0.45 + Math.random() * 0.9;
    p.size = 0.012 + Math.random() * 0.026;
    p.px = origin.x + Math.cos(angle) * 0.1;
    p.py = origin.y + Math.sin(angle) * 0.1;
    p.pz = origin.z + 0.06;
    p.vx = Math.cos(angle) * speed;
    p.vy = Math.sin(angle) * speed;
    p.vz = (Math.random() - 0.3) * speed * 0.7;
  }
}

function updateParticles(dt) {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = particles[i];

    if (!p.alive) {
      particleAlphas[i] = 0;
      continue;
    }

    p.age += dt;
    const t = p.age / p.life;

    if (t >= 1) {
      p.alive = false;
      particleAlphas[i] = 0;
      continue;
    }

    if (p.kind === 1) {
      // Ease towards the (moving) socket along a swirling arc.
      const e = t * t * (3 - 2 * t);
      const swirl = Math.sin(Math.PI * t) * p.amp * (1 - t * 0.4);
      const angle = p.phase + t * 5.5;

      p.px = p.sx + (scratch.socketWorld.x - p.sx) * e + Math.cos(angle) * swirl;
      p.py = p.sy + (scratch.socketWorld.y - p.sy) * e + Math.sin(angle) * swirl;
      p.pz = p.sz + (scratch.socketWorld.z + 0.08 - p.sz) * e;

      particleAlphas[i] = Math.sin(Math.PI * Math.min(t * 1.15, 1)) * 0.95;
    } else {
      const drag = Math.exp(-2.2 * dt);
      p.vx *= drag;
      p.vy *= drag;
      p.vz *= drag;
      p.vy -= 0.35 * dt;

      p.px += p.vx * dt;
      p.py += p.vy * dt;
      p.pz += p.vz * dt;

      particleAlphas[i] = (1 - t) * (1 - t) * 1.1;
    }

    particlePositions[i * 3] = p.px;
    particlePositions[i * 3 + 1] = p.py;
    particlePositions[i * 3 + 2] = p.pz;
    particleSizes[i] = p.size * (p.kind === 1 ? 1 - t * 0.5 : 1);
  }

  particleGeometry.attributes.position.needsUpdate = true;
  particleGeometry.attributes.aSize.needsUpdate = true;
  particleGeometry.attributes.aAlpha.needsUpdate = true;
}

function clearParticles() {
  for (const p of particles) p.alive = false;
}

/* ===================================== */
/* MODELS                                */
/* ===================================== */

// Tunable glow zones, in each model's own units (after centring).
// batteryMask: x, y of the lens centre, its radius, and the z where the lens face starts.
// ringMask: z where the raised emblem starts, and the emblem's radius.
const GLOW = {
  batteryMask: new THREE.Vector4(0, 0, 30, 60),
  ringMask: new THREE.Vector2(1.3, 0.8)
};

// Adds two things to a standard material without changing how it is lit:
//  - a glow zone (the lens, or the raised emblem) driven by uGlow
//  - a fresnel rim light driven by uRim, so a charged prop catches green light
function addGlow(material, maskGLSL) {
  const uniforms = {
    uGlow: { value: 0 },
    uRim: { value: 0 },
    uBatteryMask: { value: GLOW.batteryMask },
    uRingMask: { value: GLOW.ringMask }
  };

  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, uniforms);

    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nvarying vec3 vLocal;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvLocal = position;");

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
         varying vec3 vLocal;
         uniform float uGlow;
         uniform float uRim;
         uniform vec4 uBatteryMask;
         uniform vec2 uRingMask;`
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
         float mask = 0.0;
         ${maskGLSL}
         float fres = pow(1.0 - clamp(dot(normalize(vViewPosition), normal), 0.0, 1.0), 2.6);
         totalEmissiveRadiance += vec3(0.28, 1.0, 0.55) * mask * uGlow;
         totalEmissiveRadiance += vec3(0.05, 0.9, 0.38) * fres * uRim;`
      );
  };

  return uniforms;
}

// The models are meshopt-compressed and quantized. Read the positions back as
// floats in their original units, then give them crease-aware smooth normals
// (the source STLs had none), centre them and measure them.
async function loadModel(loader, url, material, onProgress) {
  const gltf = await loader.loadAsync(url, event => {
    if (event.lengthComputable) onProgress(event.loaded / event.total);
  });

  gltf.scene.updateMatrixWorld(true);

  let mesh = null;
  gltf.scene.traverse(node => {
    if (node.isMesh && !mesh) mesh = node;
  });

  if (!mesh) throw new Error(`No mesh found in ${url}`);

  const source = mesh.geometry.attributes.position;
  const positions = new Float32Array(source.count * 3);
  const v = new THREE.Vector3();

  for (let i = 0; i < source.count; i++) {
    v.fromBufferAttribute(source, i).applyMatrix4(mesh.matrixWorld);
    positions[i * 3] = v.x;
    positions[i * 3 + 1] = v.y;
    positions[i * 3 + 2] = v.z;
  }

  const raw = new THREE.BufferGeometry();
  raw.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  if (mesh.geometry.index) raw.setIndex(mesh.geometry.index);

  const geometry = toCreasedNormals(raw, THREE.MathUtils.degToRad(38));
  geometry.computeBoundingBox();

  const box = geometry.boundingBox;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  mesh.geometry.dispose();
  raw.dispose();

  return { model: new THREE.Mesh(geometry, material), size };
}

async function loadAssets() {
  const progress = [0, 0];
  const report = () => {
    const value = (progress[0] + progress[1]) / 2;
    const percent = Math.round(value * 100);
    introFill.style.width = `${percent}%`;
    introCount.textContent = String(percent).padStart(3, "0");
    if (value >= 1) introLabel.textContent = "Igniting";
  };

  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);

  const batteryMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x0d4a29,
    metalness: 0.92,
    roughness: 0.26,
    clearcoat: 0.75,
    clearcoatRoughness: 0.16,
    envMapIntensity: 1.1
  });

  const ringMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x146a3b,
    metalness: 0.94,
    roughness: 0.24,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.2
  });

  // Lens: a disc on the +Z face. Emblem: everything standing proud on the +Z face.
  batteryUniforms = addGlow(
    batteryMaterial,
    `float r = length(vLocal.xy - uBatteryMask.xy);
     float core = 1.0 - smoothstep(uBatteryMask.z * 0.4, uBatteryMask.z * 0.7, r);
     float wide = 1.0 - smoothstep(uBatteryMask.z * 0.5, uBatteryMask.z * 2.8, r);
     mask = (core + wide * 0.3) * smoothstep(uBatteryMask.w - 20.0, uBatteryMask.w, vLocal.z);`
  );

  ringUniforms = addGlow(
    ringMaterial,
    `float face = smoothstep(uRingMask.x, uRingMask.x + 0.12, vLocal.z);
     mask = face * (1.0 - smoothstep(uRingMask.y * 0.8, uRingMask.y, length(vLocal.xy)));`
  );

  const [batteryAsset, ringAsset] = await Promise.all([
    loadModel(loader, "assets/green_lantern.glb", batteryMaterial, value => {
      progress[0] = value;
      report();
    }),
    loadModel(loader, "assets/green-lantern-ring.glb", ringMaterial, value => {
      progress[1] = value;
      report();
    })
  ]);

  /* Battery */
  battery = new THREE.Group();
  batteryMesh = batteryAsset.model;

  const batteryScale = BATTERY_HEIGHT / batteryAsset.size.y;
  batteryMesh.scale.setScalar(batteryScale);
  battery.add(batteryMesh);
  batteryWidth = batteryAsset.size.x * batteryScale;

  // The lens (the emblem face) points down +Z in the model.
  const frontZ = (batteryAsset.size.z / 2) * batteryScale;
  battery.userData.socket = new THREE.Vector3(0, 0, frontZ);

  lensGlow = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), additive(glowTexture, 0x9dffc0, 0));
  lensGlow.position.copy(battery.userData.socket).add(new THREE.Vector3(0, 0, 0.05));
  battery.add(lensGlow);

  lensHalo = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), additive(glowTexture, 0x20ff74, 0));
  lensHalo.position.copy(battery.userData.socket).add(new THREE.Vector3(0, 0, 0.03));
  battery.add(lensHalo);

  flare = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), additive(flareTexture, 0xb8ffd0, 0));
  flare.position.copy(battery.userData.socket).add(new THREE.Vector3(0, 0, 0.08));
  battery.add(flare);

  scene.add(battery);

  shockwave = new THREE.Mesh(new THREE.RingGeometry(0.94, 1, 128), additive(null, 0xc8ffd9, 0));
  shockwave.visible = false;
  scene.add(shockwave);

  /* Ring */
  ring = new THREE.Group();
  ringSpin = new THREE.Group();

  const ringMesh = ringAsset.model;
  ringMesh.scale.setScalar(RING_DIAMETER / Math.max(ringAsset.size.x, ringAsset.size.z));
  ringSpin.add(ringMesh);
  ring.add(ringSpin);

  ringAura = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), additive(glowTexture, 0x50ff94, 0));
  ring.add(ringAura);

  scene.add(ring);
}

/* ===================================== */
/* LAYOUT                                */
/* ===================================== */

// Fit the lantern to any screen: about 46% of the height on landscape screens,
// narrower on portrait phones, always leaving room for the oath beneath it and
// the ring's resting spot at the bottom.
function computeLayout() {
  const w = vw();
  const h = vh();
  const aspect = w / h;
  const t = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const portrait = aspect < 0.9;

  const heightFrac = portrait ? 0.36 : 0.44;
  const centerFrac = portrait ? 0.3 : 0.34;

  const z = Math.max(BATTERY_HEIGHT / (2 * t * heightFrac), batteryWidth / (2 * t * 0.84 * aspect));
  const actualHeight = BATTERY_HEIGHT / (2 * t * z);

  layout.z = z;
  layout.batteryY = (0.5 - centerFrac) * 2 * t * z;
  layout.lanternBottom = centerFrac + actualHeight / 2;
  // A 2.39:1 letterbox on landscape screens; slim bars on portrait phones.
  layout.bar = aspect > 1.2 ? clamp((h - w / 2.39) / 2, 40, h * 0.16) : clamp(h * 0.055, 40, 64);
  loaderEl.style.setProperty("--bar", `${layout.bar.toFixed(1)}px`);
  layout.floorY = h - layout.bar - h * (portrait ? 0.15 : 0.16);

  loaderEl.style.setProperty("--lantern-bottom", `${(layout.lanternBottom * 100).toFixed(2)}%`);
}

function resizeRenderer() {
  const w = vw();
  const h = vh();

  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  renderer.setSize(w, h);
  composer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
  composer.setSize(w, h);

  particleMaterial.uniforms.uScale.value = pointScale();
  computeLayout();
  constructs.resize();

  ringBody.x = clamp(ringBody.x, 0, w);
  if (ringBody.mode === "rest") ringBody.y = layout.floorY;
}

window.addEventListener("resize", resizeRenderer);
window.visualViewport?.addEventListener("resize", resizeRenderer);

/* ===================================== */
/* WORLD / SCREEN                        */
/* ===================================== */

function screenToWorld(x, y, zPlane, out) {
  scratch.ndc.set((x / vw()) * 2 - 1, -(y / vh()) * 2 + 1, 0.5);
  scratch.ndc.unproject(camera);
  scratch.ndc.sub(camera.position).normalize();

  const distance = (zPlane - camera.position.z) / scratch.ndc.z;
  return out.copy(camera.position).addScaledVector(scratch.ndc, distance);
}

function worldToScreen(position, out) {
  scratch.a.copy(position).project(camera);
  out.x = ((scratch.a.x + 1) / 2) * vw();
  out.y = ((1 - scratch.a.y) / 2) * vh();
  return out;
}

function pixelsPerUnit(zPlane) {
  const distance = Math.max(0.1, camera.position.z - zPlane);
  return vh() / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * distance);
}

function ringRadiusPx() {
  if (!ring) return 30;
  return RING_DIAMETER * 0.5 * ring.scale.x * pixelsPerUnit(ring.position.z);
}

function snapRadiusPx() {
  return Math.max(64, BATTERY_HEIGHT * pixelsPerUnit(0) * 0.2);
}

function updateSocket() {
  scratch.socketWorld.copy(battery.userData.socket);
  battery.localToWorld(scratch.socketWorld);
  worldToScreen(scratch.socketWorld, scratch.socketScreen);
}

/* ===================================== */
/* STAGES                                */
/* ===================================== */

function setStage(next) {
  if (stage === next) return;

  stage = next;
  stageTime = 0;
  idle = 0;
  pendingStage = null;
  ghost.stop();
  loaderEl.dataset.stage = next;

  skipBtn.hidden = !(next === Stage.PICKUP || next === Stage.TAP);

  const chapter = CHAPTERS[next];
  if (chapter) {
    chapterNum.textContent = chapter[0];
    chapterName.textContent = chapter[1];
  }
}

// Shown in the bottom letterbox, like scene markers.
const CHAPTERS = {
  pickup: ["01", "The Ring"],
  tap: ["02", "The Awakening"],
  seek: ["03", "The Lantern"],
  docked: ["04", "The Oath"],
  finale: ["05", "The Corps"],
  welcome: ["05", "The Corps"]
};

const isTouchLike = () => pointer.type === "touch" || pointer.type === "pen";
const isPlaying = () => stage === Stage.PICKUP || stage === Stage.TAP || stage === Stage.SEEK;

function grabRadius() {
  return Math.max(isTouchLike() ? 64 : 46, ringRadiusPx() * 1.7);
}

function nearRing(x, y, scale = 1) {
  return Math.hypot(x - ringBody.x, y - ringBody.y) <= grabRadius() * scale;
}

function grab() {
  ringBody.mode = "held";

  // On touch, lift the ring above the finger so it stays visible. With a
  // mouse it sits on top of the closed glove.
  const r = ringRadiusPx();
  ringBody.offX = 0;
  ringBody.offY = isTouchLike() ? -Math.max(70, r * 2.4) : -(r * 0.75 + 12);

  pointer.origin = "ring";
  sticky = false;
  grabAt = elapsed;
  grabFrom.x = pointer.x;
  grabFrom.y = pointer.y;
  idle = 0;
  audio.pickup();
  haptic(10);

  if (stage === Stage.PICKUP) setStage(powered ? Stage.SEEK : Stage.TAP);
}

function drop() {
  // Keep the hand's velocity: you can throw the ring.
  ringBody.mode = "falling";
  ringBody.landed = false;
  ringBody.vx = clamp(ringBody.vx, -4200, 4200);
  ringBody.vy = clamp(ringBody.vy, -4200, 4200);
  idle = 0;
}

// Clicked or tapped somewhere other than the ring: make it hop for attention.
function nudge() {
  if (ringBody.mode === "rest") {
    ringBody.mode = "falling";
    ringBody.vy = -520;
    ringBody.vx = (pointer.x - ringBody.x) * 0.6;
    ringBody.landed = false;
    audio.drop(0.2);
  }

  idle = HINT_DELAY;
}

function dock() {
  ringBody.mode = "docked";
  sticky = false;
  setStage(Stage.DOCKED);
  audio.dock();
  haptic(18);
  announce("Ring docked. Hold to charge.");
}

function undock() {
  audio.trackPause();
  ringBody.mode = "held";
  setStage(Stage.SEEK);
  audio.undock();
}

function wakeRing() {
  powered = true;
  wakeTime = elapsed;
  charge = START_CHARGE;
  lastPowerReport = elapsed;

  audio.powerOn();
  haptic([30, 40, 60]);

  const x = clamp(ringBody.x, vw() * 0.3, vw() * 0.7);
  const y = clamp(ringBody.y - ringRadiusPx() * 3.4, layout.bar + 60, vh() * 0.7);
  cue("Ring power · 2%", x, y, { sub: "Recharge required", life: 3200 });

  ringSay("Ring power at two percent. Recharge required.", { clip: "vo_ring_low" });
  announce("Ring power at two percent. Take the ring to the lantern.");

  pendingStage = { stage: Stage.SEEK, at: elapsed + 1.4 };
  skipBtn.hidden = true;
}

function skipIntro() {
  if (!powered) {
    powered = true;
    wakeTime = elapsed;
    charge = START_CHARGE;
    audio.powerOn();
  }

  setStage(Stage.SEEK);
}

skipBtn.addEventListener("click", () => {
  unlockMedia();
  skipIntro();
});

/* ===================================== */
/* EDGE KNOCKS                           */
/* ===================================== */

function hitEdge(side, speed, x, y) {
  if (elapsed - ringBody.lastHit < 0.35 || speed < 90) return;
  ringBody.lastHit = elapsed;

  const strength = clamp(speed / 2400, 0.2, 1);
  const knock = speed >= KNOCK_SPEED;

  audio.knock(knock ? strength : strength * 0.45);

  const edge = side === "left" ? edgeLeft : side === "right" ? edgeRight : null;
  if (edge) {
    edge.classList.remove("is-hit");
    void edge.offsetWidth;
    edge.classList.add("is-hit");
    edge.addEventListener("animationend", () => edge.classList.remove("is-hit"), { once: true });
  }

  if (!knock) {
    if (stage === Stage.TAP) promptOverride = { text: "Harder. Give it a proper knock", until: elapsed + 2.2 };
    return;
  }

  idle = 0;
  haptic([14, 30, 14]);
  shake(0.45 + strength * 0.6);

  impactFlash(x, y, strength);

  emitSparks(REDUCED_MOTION ? 6 : 22, 1.4, screenToWorld(x, y, ring.position.z, scratch.point));

  if (stage === Stage.TAP && !powered) {
    wakeRing();
  } else if (powered && stage === Stage.SEEK && elapsed - lastPowerReport > 4) {
    // Knocking the ring later is a quick diagnostic on its readout.
    lastPowerReport = elapsed;
    cue(`Ring power · ${Math.round(charge * 100)}%`, ringBody.x, ringBody.y - ringRadiusPx() * 3, { life: 1800 });
  }
}

/* ===================================== */
/* RING MOTION (screen space)            */
/* ===================================== */

function updateRingBody(dt) {
  const w = vw();
  const r = ringRadiusPx();
  const minX = r * 0.85;
  const maxX = w - r * 0.85;
  const minY = layout.bar + r * 0.85;
  const floor = layout.floorY;

  if (ringBody.mode === "held") {
    const tx = pointer.x + ringBody.offX;
    const ty = pointer.y + ringBody.offY;
    const k = 1 - Math.exp(-26 * dt);

    let nx = ringBody.x + (tx - ringBody.x) * k;
    let ny = ringBody.y + (ty - ringBody.y) * k;

    const ivx = (nx - ringBody.x) / Math.max(dt, 1e-3);
    const ivy = (ny - ringBody.y) / Math.max(dt, 1e-3);

    if (nx < minX) {
      nx = minX;
      hitEdge("left", -ivx, minX - r * 0.6, ny);
    } else if (nx > maxX) {
      nx = maxX;
      hitEdge("right", ivx, maxX + r * 0.6, ny);
    }

    if (ny < minY) {
      ny = minY;
      hitEdge("top", -ivy, nx, minY - r * 0.6);
    }

    ny = Math.min(ny, floor);

    ringBody.vx = THREE.MathUtils.lerp(ringBody.vx, ivx, 1 - Math.exp(-20 * dt));
    ringBody.vy = THREE.MathUtils.lerp(ringBody.vy, ivy, 1 - Math.exp(-20 * dt));
    ringBody.x = nx;
    ringBody.y = ny;
  } else if (ringBody.mode === "falling") {
    ringBody.vy += GRAVITY * dt;
    ringBody.x += ringBody.vx * dt;
    ringBody.y += ringBody.vy * dt;

    if (ringBody.x < minX) {
      ringBody.x = minX;
      hitEdge("left", -ringBody.vx, minX - r * 0.6, ringBody.y);
      ringBody.vx = Math.abs(ringBody.vx) * 0.45;
    } else if (ringBody.x > maxX) {
      ringBody.x = maxX;
      hitEdge("right", ringBody.vx, maxX + r * 0.6, ringBody.y);
      ringBody.vx = -Math.abs(ringBody.vx) * 0.45;
    }

    if (ringBody.y < minY) {
      ringBody.y = minY;
      hitEdge("top", -ringBody.vy, ringBody.x, minY - r * 0.6);
      ringBody.vy = Math.abs(ringBody.vy) * 0.4;
    }

    if (ringBody.y >= floor) {
      ringBody.y = floor;

      if (ringBody.vy > 240) {
        // The recorded drop already contains its own bounces.
        if (!ringBody.landed) audio.drop(Math.min(1, ringBody.vy / 2400));
        ringBody.landed = true;
        ringBody.vy = -ringBody.vy * 0.32;
        ringBody.vx *= 0.7;
        haptic(6);
      } else {
        ringBody.vy = 0;
        ringBody.vx *= Math.exp(-7 * dt);
        if (Math.abs(ringBody.vx) < 14) ringBody.mode = "rest";
      }
    }
  } else if (ringBody.mode === "rest") {
    ringBody.vx = 0;
    ringBody.vy = 0;
    ringBody.y = floor;
  }

  ringBody.speed = Math.hypot(ringBody.vx, ringBody.vy);
}

/* ===================================== */
/* RING (3D)                             */
/* ===================================== */

// The ring model's head (the emblem) faces +Z and the finger hole runs along Y.
const REST_ROT = new THREE.Euler(0.78, -0.25, 0.1);
const HELD_ROT = new THREE.Euler(0.24, -0.5, 0.05);
// On the lantern the head goes *into* the lens, the way a fist pushes it in:
// head turned to face -Z, finger hole running sideways, so from the camera's
// three-quarter view you see the open band standing out of the lens.
const DOCK_ROT = new THREE.Euler(0.12, Math.PI, Math.PI / 2);

const quat = {
  rest: new THREE.Quaternion().setFromEuler(REST_ROT),
  held: new THREE.Quaternion().setFromEuler(HELD_ROT),
  dock: new THREE.Quaternion().setFromEuler(DOCK_ROT),
  target: new THREE.Quaternion(),
  tilt: new THREE.Quaternion(),
  euler: new THREE.Euler()
};

// Half the ring's depth along its head axis, in world units at scale 1.
const RING_HALF_DEPTH = RING_DIAMETER * 0.5;

function damp(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

function updateRing3D(time, dt) {
  const onLantern = ringBody.mode === "docked" || stage === Stage.FINALE || stage === Stage.WELCOME;
  const charging = isCharging();

  let scaleTarget = 1;
  let lambda = 30;

  if (onLantern) {
    const build = stage === Stage.FINALE ? THREE.MathUtils.smoothstep(finishTime / FINISH_PEAK, 0, 1) : 0;
    scaleTarget = stage === Stage.DOCKED ? 1.3 : 1.2;

    // Seat the head inside the lens: pushed a little deeper while charging,
    // and all the way home at the finale.
    const depth = RING_HALF_DEPTH * ring.scale.x;
    const inset = stage === Stage.FINALE ? 0.1 + build * 0.06 : charging ? 0.12 : 0.04;
    scratch.target.copy(scratch.socketWorld);
    scratch.target.z += depth - inset;

    quat.target.copy(quat.dock);
    lambda = 11;
  } else {
    let sx = ringBody.x;
    let sy = ringBody.y;

    // The lantern pulls the ring in as it gets close.
    if (ringBody.mode === "held" && stage === Stage.SEEK) {
      const pull = attractionLevel * attractionLevel * 0.5;
      sx = THREE.MathUtils.lerp(sx, scratch.socketScreen.x, pull);
      sy = THREE.MathUtils.lerp(sy, scratch.socketScreen.y, pull);
    }

    const held = ringBody.mode === "held";
    screenToWorld(sx, sy, held ? RING_Z_HELD : RING_Z_REST, scratch.target);
    scaleTarget = held ? 1.1 : 1;
    lambda = held ? 30 : 40;

    // Near the lantern the ring turns its head toward the lens, ready to go in.
    if (held) {
      const turn = stage === Stage.SEEK ? Math.pow(attractionLevel, 1.5) : 0;
      quat.target.copy(quat.held).slerp(quat.dock, turn);
    } else {
      quat.target.copy(quat.rest);
    }
  }

  ring.position.x = damp(ring.position.x, scratch.target.x, lambda, dt);
  ring.position.y = damp(ring.position.y, scratch.target.y, lambda, dt);
  ring.position.z = damp(ring.position.z, scratch.target.z, onLantern ? 11 : 12, dt);
  ring.scale.setScalar(damp(ring.scale.x, scaleTarget, 8, dt));

  // Swing with the hand: tilt into the direction of travel.
  const moving = ringBody.mode === "held" || ringBody.mode === "falling";
  const tiltZ = moving ? clamp(-ringBody.vx * 0.00028, -0.55, 0.55) : 0;
  const tiltX = moving ? clamp(ringBody.vy * 0.0002, -0.4, 0.4) : 0;
  const bob = ringBody.mode === "rest" ? Math.sin(time * 1.6) * 0.04 : 0;

  quat.euler.set(tiltX + bob, 0, tiltZ);
  quat.tilt.setFromEuler(quat.euler);
  quat.target.premultiply(quat.tilt);
  ring.quaternion.slerp(quat.target, 1 - Math.exp(-9 * dt));

  // Under load the ring trembles; in the finale it vibrates harder.
  if (!REDUCED_MOTION && stage === Stage.FINALE) {
    ringSpin.rotation.y = Math.sin(finishTime * 46) * 0.03 * (flashFired ? 0.2 : 1);
    ringSpin.rotation.x = 0;
  } else {
    const tremor = charging && !REDUCED_MOTION ? charge * charge : 0;
    ringSpin.rotation.y = Math.sin(time * 38) * 0.018 * tremor;
    ringSpin.rotation.x = Math.sin(time * 31 + 0.7) * 0.014 * tremor;
  }

  if (ringBody.mode === "docked" || onLantern) {
    worldToScreen(ring.position, scratch.ringScreen);
    ringBody.x = scratch.ringScreen.x;
    ringBody.y = scratch.ringScreen.y;
  }
}

/* ===================================== */
/* INTERACTION LOOP                      */
/* ===================================== */

function isCharging() {
  return stage === Stage.DOCKED && pointer.down;
}

function updateInteraction(dt) {
  if (pendingStage && elapsed >= pendingStage.at) setStage(pendingStage.stage);

  // Magnetic pull and docking while carrying the ring.
  let attraction = 0;
  const snap = snapRadiusPx();

  if (stage === Stage.SEEK && ringBody.mode === "held") {
    const distance = Math.hypot(ringBody.x - scratch.socketScreen.x, ringBody.y - scratch.socketScreen.y);
    attraction = clamp(1 - distance / (snap * 3.4), 0, 1);
    attraction = attraction * attraction * (3 - 2 * attraction);
    if (distance < snap) dock();
  } else if (stage === Stage.DOCKED) {
    attraction = 1;

    // Dragging the ring well away from the lens takes it off again. A press
    // that started away from the ring only charges; it never pulls it off.
    if (pointer.down && pointer.origin === "ring") {
      const tx = pointer.x + ringBody.offX;
      const ty = pointer.y + ringBody.offY;
      if (Math.hypot(tx - scratch.socketScreen.x, ty - scratch.socketScreen.y) > snap * 2.4) {
        ringBody.x = tx;
        ringBody.y = ty;
        undock();
      }
    }
  }

  attractionLevel = damp(attractionLevel, attraction, 8, dt);
}

function updateCharge(dt) {
  if (!powered || stage === Stage.FINALE || stage === Stage.WELCOME) return;

  const charging = isCharging();

  // With the oath recording loaded, holding the ring plays it and letting go
  // pauses it; the charge and the words follow the recording.
  if (audio.hasTrack() && stage === Stage.DOCKED) {
    if (charging) audio.trackPlay();
    else audio.trackPause();

    if (charging) holdSeconds += dt;
    if (wasCharging && !charging) audio.release();
    wasCharging = charging;

    const t = audio.trackTime();
    charge = START_CHARGE + (1 - START_CHARGE) * clamp(t / TRACK_END, 0, 1);
    oath.setTrackTime(t);

    if (t >= TRACK_END) startFinish();
    return;
  }

  if (charging) {
    holdSeconds += dt;
    holdRamp += dt;
    const ramp = THREE.MathUtils.smoothstep(holdRamp / CHARGE_RAMP, 0, 1);
    charge += (dt / CHARGE_SECONDS) * (0.35 + 0.65 * ramp);
  } else {
    holdRamp = Math.max(0, holdRamp - dt * 2);
    if (stage === Stage.DOCKED) charge -= DRAIN_PER_SECOND * dt;
  }

  const cap = oath.done ? 1 : 0.99;
  charge = clamp(charge, START_CHARGE, cap);

  if (wasCharging && !charging && stage === Stage.DOCKED) audio.release();
  wasCharging = charging;

  OATH_THRESHOLDS.forEach((threshold, index) => {
    if (charge >= threshold) oath.trigger(index);
  });

  if (charge >= 1 && oath.done && charging) startFinish();
}

/* ===================================== */
/* PROMPTS AND HINTS                     */
/* ===================================== */

function promptText() {
  if (promptOverride && elapsed < promptOverride.until) return promptOverride.text;

  const touch = isTouchLike();
  const keys = pointer.type === "keyboard";
  const inHand = ringBody.mode === "held";

  switch (stage) {
    case Stage.PICKUP:
      if (keys) return "Arrow keys to move · Space to grab the ring";
      return touch ? "Touch the ring and drag it" : "Grab the ring";

    case Stage.TAP:
      if (!inHand) return touch ? "Pick the ring back up" : "Grab the ring again";
      if (keys) return "Knock it against the side with the arrow keys";
      return touch ? "Flick it against the edge of the screen" : "Knock it against the side of the screen";

    case Stage.SEEK:
      if (pendingStage) return "";
      if (!inHand) return touch ? "Drag the ring to the lantern" : "Grab the ring · take it to the lantern";
      return attractionLevel > 0.25 ? "Closer…" : "Take it to the lantern";

    case Stage.DOCKED:
      if (isCharging()) return oath.done ? "Hold…" : "";
      if (charge > START_CHARGE + 0.01) return touch ? "Keep your finger down to charge" : "Hold to keep charging";
      if (keys) return "Hold Space to charge";
      return touch ? "Hold your finger down to charge" : "Press and hold to charge";

    default:
      return "";
  }
}

function updatePrompt() {
  const text = promptText();
  if (text === lastPrompt) return;

  lastPrompt = text;
  promptEl.classList.toggle("is-shown", Boolean(text));

  if (text) {
    promptEl.textContent = text;
    promptEl.classList.remove("pop");
    void promptEl.offsetWidth;
    promptEl.classList.add("pop");
    announce(text);
  }
}

const ringPoint = () => ({ x: ringBody.x, y: ringBody.y });
const lensPoint = () => ({ x: scratch.socketScreen.x, y: scratch.socketScreen.y });
const edgePoint = () => ({ x: ringBody.x < vw() / 2 ? 18 : vw() - 18, y: ringBody.y });

function updateHints(dt) {
  idle += dt;

  const resting = ringBody.mode === "rest" || ringBody.mode === "falling";
  const wantMarker = isPlaying() && resting;
  markerEl.classList.toggle("is-on", wantMarker);

  if (wantMarker) {
    const size = Math.max(80, ringRadiusPx() * 3);
    markerEl.style.width = markerEl.style.height = `${size}px`;
    markerEl.style.transform = `translate3d(${(ringBody.x - size / 2).toFixed(1)}px, ${(ringBody.y - size / 2).toFixed(1)}px, 0)`;
  }

  if (idle < HINT_DELAY || pendingStage) {
    ghost.stop();
  } else if (isPlaying() && ringBody.mode !== "held") {
    ghost.play("grab", ringPoint);
  } else if (stage === Stage.TAP) {
    ghost.play("knock", ringPoint, edgePoint);
  } else if (stage === Stage.SEEK) {
    ghost.play("drag", ringPoint, lensPoint);
  } else if (stage === Stage.DOCKED && !isCharging()) {
    ghost.play("press", ringPoint);
  } else {
    ghost.stop();
  }

  ghost.update(dt);
}

/* ===================================== */
/* GLOVE CURSOR                          */
/* ===================================== */

const hand = createHand($("hand"));
const ghost = createGhost($("ghost"));

function updateHand() {
  const usesHand = pointer.type === "mouse" || pointer.type === "keyboard";
  const visible =
    usesHand &&
    pointer.inside &&
    !pointer.overButton &&
    stage !== Stage.WELCOME &&
    stage !== Stage.LOADING &&
    stage !== Stage.INTRO;

  hand.show(visible);
  loaderEl.classList.toggle("use-hand", visible);
  if (!visible) return;

  hand.move(pointer.x, pointer.y);

  let mode = "open";
  if (ringBody.mode === "held") mode = "grab";
  else if (isCharging()) mode = "press";
  else if ((isPlaying() || stage === Stage.DOCKED) && nearRing(pointer.x, pointer.y, 1.2)) mode = "reach";

  hand.setMode(mode);
}

/* ===================================== */
/* POWER READOUT                         */
/* ===================================== */

function updateHud() {
  const percent = Math.round((powered ? charge : 0) * 100);
  if (percent === lastPercent) return;

  lastPercent = percent;
  powerText.textContent = String(percent).padStart(3, "0");
  powerFill.style.width = `${percent}%`;
}

/* ===================================== */
/* BEAM                                  */
/* ===================================== */

function updateBeam() {
  let strength = 0;

  if (stage === Stage.SEEK && ringBody.mode === "held") strength = attractionLevel * 0.45;
  if (stage === Stage.DOCKED) strength = isCharging() ? 0.55 + charge * 0.4 : 0.35;

  const visible = strength > 0.04;
  beam.classList.toggle("visible", visible);
  beamBlur.classList.toggle("visible", visible);
  if (!visible) return;

  worldToScreen(ring.position, scratch.ringScreen);

  for (const line of [beam, beamBlur]) {
    line.setAttribute("x1", scratch.ringScreen.x);
    line.setAttribute("y1", scratch.ringScreen.y);
    line.setAttribute("x2", scratch.socketScreen.x);
    line.setAttribute("y2", scratch.socketScreen.y);
  }

  beam.style.opacity = strength.toFixed(3);
  beamBlur.style.opacity = (strength * 0.58).toFixed(3);
}

/* ===================================== */
/* ENERGY VISUALS                        */
/* ===================================== */

let emitCarry = 0;
let sparkCarry = 0;

function updateEnergy(time, dt) {
  const charging = isCharging();
  const proximity = attractionLevel;
  const level = powered ? charge : 0;

  // Slow breathing pulse that quickens as the ring charges.
  const pulse = 0.5 + 0.5 * Math.sin(time * (1.6 + level * 5.5));
  const flicker = REDUCED_MOTION ? 0 : (Math.random() - 0.5) * level * 0.08;

  const build = stage === Stage.FINALE || stage === Stage.WELCOME
    ? THREE.MathUtils.smoothstep(finishTime / FINISH_PEAK, 0, 1)
    : 0;
  const energy = Math.min(1.6, level * 0.85 + build * 0.9 + (charging ? 0.06 : 0));

  lensGlow.scale.setScalar(0.55 + proximity * 0.06 + energy * 0.32);
  lensGlow.material.opacity = Math.min(
    0.85,
    (0.08 + proximity * 0.12 + energy * (0.38 + pulse * 0.14) + flicker) *
      (stage === Stage.DOCKED ? 0.45 : 1)
  );

  lensHalo.scale.setScalar(1.3 + proximity * 0.3 + energy * 1.1);
  lensHalo.material.opacity =
    Math.min(0.7, 0.08 + proximity * 0.14 + energy * 0.3) * (stage === Stage.DOCKED ? 0.6 : 1);

  flare.scale.set(1.4 + energy * 4.6, 0.08 + energy * 0.16, 1);
  flare.material.opacity = Math.min(1, Math.max(0, energy - 0.12) * 0.9 + (build > 0 ? 0.1 : 0));

  batteryUniforms.uGlow.value = 0.25 + proximity * 0.5 + energy * (2.4 + pulse * 0.6);
  batteryUniforms.uRim.value = proximity * 0.15 + energy * (0.9 + pulse * 0.3);

  // The ring is dead until it is knocked awake, then it flickers on.
  const hover = isPlaying() && ringBody.mode !== "held" && nearRing(pointer.x, pointer.y, 1.2) ? 1 : 0;
  const sinceWake = elapsed - wakeTime;
  let life = powered ? 1 : 0;

  if (powered && sinceWake < 1.2 && !REDUCED_MOTION) {
    life = Math.random() < 0.35 ? 0.15 : THREE.MathUtils.smoothstep(sinceWake / 1.2, 0, 1);
  }

  ringUniforms.uGlow.value =
    0.03 + hover * 0.35 + life * (0.4 + proximity * 1.2 + (charging ? 0.8 : 0) + energy * 4);
  ringUniforms.uRim.value = hover * 0.35 + life * (0.06 + proximity * 0.2 + (charging ? 0.2 : 0) + energy * 0.9);

  // A soft halo marks the dead ring on the floor so it is easy to find.
  const restPulse = !powered && stage === Stage.PICKUP ? 0.1 + 0.08 * Math.sin(time * 2.4) : 0;
  ringAura.material.opacity = Math.min(
    0.5,
    restPulse + hover * 0.14 + life * (0.04 + proximity * 0.12 + (stage === Stage.DOCKED ? 0.04 : 0) + energy * 0.16)
  );
  ringAura.scale.setScalar(1.0 + proximity * 0.2 + energy * 0.5);

  // Billboard the aura: undo the ring's own rotation, then face the camera.
  ringAura.quaternion.copy(ring.quaternion).invert().multiply(camera.quaternion);

  chargeLight.position.copy(scratch.socketWorld);
  chargeLight.position.z += 0.5;
  chargeLight.intensity = 0.9 + proximity * 1.2 + energy * 3.4 + pulse * level * 0.8;
  chargeLight.distance = 9 + energy * 4;

  contactLight.position.copy(ring.position);
  contactLight.position.z += 0.25;
  contactLight.intensity =
    0.15 + life * (proximity * 0.9 + (stage === Stage.DOCKED ? 0.8 : 0) + (charging ? 1.2 : 0)) + energy * 3.4;
  contactLight.distance = 5 + energy * 2.5;

  rimLight.intensity = 3.4 + energy * 1.6;

  bloomPass.strength = 0.4 + proximity * 0.06 + energy * 0.42;
  bloomPass.radius = 0.5 + energy * 0.12;
  bloomPass.threshold = 0.9 - energy * 0.06;

  lensPass.uniforms.uTime.value = time;
  lensPass.uniforms.uAberration.value = REDUCED_MOTION ? 0.0008 : 0.0012 + energy * 0.0034;

  shaftPass.uniforms.uLight.value.set(
    scratch.socketScreen.x / vw(),
    1 - scratch.socketScreen.y / vh()
  );
  // Shafts build with the charge: barely there at rest, flooding the frame at the end.
  shaftPass.uniforms.uStrength.value = 0.1 + proximity * 0.25 + energy * 2.4;

  hazeBack.uniforms.uTime.value = time;
  hazeFront.uniforms.uTime.value = time;
  hazeBack.uniforms.uIntensity.value = 0.16 + energy * 0.22;
  hazeFront.uniforms.uIntensity.value = 0.05 + energy * 0.08;

  // Controlled shake under load, never when the user asked for less motion.
  const strain = charging && !REDUCED_MOTION ? level * level : 0;
  battery.rotation.z = strain * Math.sin(time * 61) * 0.0035;
  battery.rotation.x = strain * Math.sin(time * 47 + 1.3) * 0.0025;

  // Emit particles in proportion to time, not frames.
  if (charging) {
    emitCarry += dt * (REDUCED_MOTION ? 14 : LOW_POWER ? 24 + level * 40 : 34 + level * 70);
    sparkCarry += dt * (REDUCED_MOTION ? 2 : 4 + level * 16);

    while (emitCarry >= 1) {
      emitStream(1);
      emitCarry -= 1;
    }

    while (sparkCarry >= 1) {
      emitSparks(1, 0.6 + level * 0.8);
      sparkCarry -= 1;
    }
  } else {
    emitCarry = 0;
    sparkCarry = 0;
  }

  if (stage === Stage.FINALE && finishTime < FINISH_FLASH) {
    emitCarry += dt * (LOW_POWER ? 70 : 120);
    while (emitCarry >= 1) {
      emitStream(1);
      emitCarry -= 1;
    }
  }
}

/* ===================================== */
/* COMIC FX                              */
/* ===================================== */

function pick(list, avoid) {
  let value;
  do {
    value = list[Math.floor(Math.random() * list.length)];
  } while (value === avoid && list.length > 1);
  return value;
}

// A short cinematic caption: thin, wide-tracked type that resolves in and out.
function cue(text, x, y, { sub = "", life = 2600, title = false } = {}) {
  const el = document.createElement("div");
  el.className = title ? "cue is-title" : "cue";
  el.style.setProperty("--life", `${life}ms`);

  const main = document.createElement("span");
  main.className = "cue-main";
  main.textContent = text;
  el.appendChild(main);

  if (sub) {
    const small = document.createElement("span");
    small.className = "cue-sub";
    small.textContent = sub;
    el.appendChild(small);
  }

  const margin = Math.min(vw() * 0.42, 220);
  el.style.left = `${clamp(x, margin, vw() - margin).toFixed(1)}px`;
  el.style.top = `${clamp(y, layout.bar + 50, vh() - layout.bar - 50).toFixed(1)}px`;

  cuesEl.appendChild(el);
  window.setTimeout(() => el.remove(), life + 120);
}

// A burst of light where the ring strikes the edge of the screen.
function impactFlash(x, y, strength) {
  const el = document.createElement("div");
  el.className = "impact";
  const size = 120 + strength * 220;
  el.style.width = el.style.height = `${size}px`;
  el.style.left = `${x}px`;
  el.style.top = `${y}px`;
  cuesEl.appendChild(el);
  window.setTimeout(() => el.remove(), 700);
}

function shake(amount) {
  if (!REDUCED_MOTION) shakeAmount = Math.max(shakeAmount, amount);
}

function updateShake(dt) {
  shakeAmount = damp(shakeAmount, 0, 7, dt);

  if (shakeAmount < 0.01) {
    loaderEl.style.setProperty("--shake-x", "0px");
    loaderEl.style.setProperty("--shake-y", "0px");
    return;
  }

  const s = shakeAmount * 9;
  loaderEl.style.setProperty("--shake-x", `${((Math.random() - 0.5) * s).toFixed(1)}px`);
  loaderEl.style.setProperty("--shake-y", `${((Math.random() - 0.5) * s).toFixed(1)}px`);
}

function haptic(pattern) {
  if (!COARSE || !navigator.vibrate) return;
  // Browsers refuse (and log an error) until the user has really tapped.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  try {
    navigator.vibrate(pattern);
  } catch (error) {
    /* not supported */
  }
}

/* ===================================== */
/* VOICE                                 */
/* ===================================== */

// The ring speaks in a brighter, quicker voice than the oath.
function ringSay(text, options = {}) {
  if (oath.speaking) return;
  voice.say(text, { rate: 1.0, pitch: 1.08, synthesize: false, ...options });
}

const oath = createOath({
  container: $("oath"),
  voice,
  audio,
  onKeyWord: () => {
    if (REDUCED_MOTION) return;
    punch = Math.min(0.25, punch + 0.06);
    emitSparks(LOW_POWER ? 4 : 8, 0.9);
  }
});

/* ===================================== */
/* INPUT                                 */
/* ===================================== */

function unlockMedia() {
  audio.unlock();
  voice.unlock();
  syncSoundLabel();
}

function press() {
  idle = 0;

  if (isPlaying()) {
    if (ringBody.mode === "held" && sticky) {
      sticky = false;
      drop();
      return;
    }

    if (ringBody.mode !== "held" && nearRing(pointer.x, pointer.y)) grab();
    else if (ringBody.mode !== "held") nudge();
    return;
  }

  if (stage === Stage.DOCKED) {
    pointer.origin = nearRing(pointer.x, pointer.y, 1.3) ? "ring" : "free";
  }
}

function release() {
  if (ringBody.mode !== "held") return;

  const quick =
    elapsed - grabAt < 0.3 &&
    Math.hypot(pointer.x - grabFrom.x, pointer.y - grabFrom.y) < 10;

  // Touch has no hover, so a lifted finger always lets go.
  if (quick && !isTouchLike()) {
    sticky = true;
    return;
  }

  drop();
}

function setPointerFrom(event) {
  pointer.type = event.pointerType || "mouse";
  pointer.x = event.clientX;
  pointer.y = event.clientY;
  pointer.inside = true;
  pointer.overButton = Boolean(event.target.closest?.("button, a"));
}

window.addEventListener("pointermove", event => {
  if (pointer.id !== null && event.pointerId !== pointer.id) return;
  setPointerFrom(event);
  if (pointer.down) idle = 0;
});

window.addEventListener("pointerdown", event => {
  // A mouse press counts as a user gesture; a touch only counts when it ends.
  if ((event.pointerType || "mouse") === "mouse") unlockMedia();

  if (pointer.down) return; // ignore extra fingers
  setPointerFrom(event);

  if (pointer.overButton || stage === Stage.WELCOME || stage === Stage.LOADING || stage === Stage.INTRO) return;
  if (pointer.type === "mouse" && event.button !== 0) return;

  pointer.down = true;
  pointer.id = event.pointerId;

  try {
    loaderEl.setPointerCapture(event.pointerId);
  } catch (error) {
    /* capture is best effort */
  }

  press();
});

function endPress(event) {
  if (event && (event.pointerType || "mouse") !== "mouse") unlockMedia();
  if (!pointer.down || (event && pointer.id !== null && event.pointerId !== pointer.id)) return;

  pointer.down = false;
  pointer.id = null;
  release();
}

window.addEventListener("pointerup", endPress);
window.addEventListener("pointercancel", endPress);
window.addEventListener("touchend", () => unlockMedia(), { passive: true });

document.documentElement.addEventListener("pointerleave", event => {
  if ((event.pointerType || "mouse") === "mouse") pointer.inside = false;
});

window.addEventListener("blur", () => endPress(null));

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    audio.suspend();
    endPress(null);
  } else {
    audio.resume();
  }
});

window.addEventListener("contextmenu", event => event.preventDefault());
document.addEventListener("gesturestart", event => event.preventDefault());

// Keyboard: the arrow keys move a virtual glove, Space or Enter is the press.
window.addEventListener("keydown", event => {
  if (event.target.closest?.("button, a, input")) {
    if (event.code === "KeyM") toggleSound();
    return;
  }

  unlockMedia();

  if (event.code === "KeyM") {
    toggleSound();
    return;
  }

  if (stage === Stage.WELCOME || stage === Stage.LOADING || stage === Stage.INTRO) return;

  const step = event.shiftKey ? 70 : 28;
  const moves = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, -step],
    ArrowDown: [0, step]
  };

  if (event.code === "Space" || event.code === "Enter" || moves[event.code]) {
    event.preventDefault();

    if (pointer.type !== "keyboard") {
      // Start the virtual glove on the ring so the first press grabs it.
      pointer.type = "keyboard";
      pointer.x = ringBody.x;
      pointer.y = ringBody.y;
    }

    pointer.inside = true;
    pointer.overButton = false;
  }

  if ((event.code === "Space" || event.code === "Enter") && !event.repeat && !pointer.down) {
    pointer.down = true;
    pointer.id = null;
    press();
  } else if (moves[event.code]) {
    pointer.x = clamp(pointer.x + moves[event.code][0], 0, vw());
    pointer.y = clamp(pointer.y + moves[event.code][1], 0, vh());
    idle = 0;
  }
});

window.addEventListener("keyup", event => {
  if ((event.code === "Space" || event.code === "Enter") && pointer.down && pointer.id === null) {
    pointer.down = false;
    release();
  }
});

/* ===================================== */
/* FINALE                                */
/* ===================================== */

function startFinish() {
  setStage(Stage.FINALE);
  ringBody.mode = "docked";
  charge = 1;
  finishTime = 0;
  flashFired = false;
  revealShown = false;
  finaleLineDone = false;
  welcomeSpoken = false;

  audio.finishStart(FINISH_FLASH);
  announce("Ring fully charged.");
}

function maybeSpeakWelcome() {
  if (welcomeSpoken || !finaleLineDone || !revealShown) return;
  welcomeSpoken = true;
  voice.say("Welcome, Green Lantern of Sector two eight one four. Earth's guardian.", {
    clip: "vo_welcome",
    synthesize: false,
    rate: 0.9,
    pitch: 1.0
  });
}

function updateFinish(dt) {
  if (stage !== Stage.FINALE && stage !== Stage.WELCOME) return;

  finishTime += dt;

  if (!flashFired && finishTime >= FINISH_FLASH) {
    flashFired = true;
    flash.classList.add("fire");
    audio.finishBoom();
    haptic([60, 40, 140]);
    shake(1);

    shockwave.visible = true;
    shockwave.position.copy(scratch.socketWorld);
    shockwave.position.z += 0.12;
    shockwave.userData.t = 0;

    emitSparks(REDUCED_MOTION ? 40 : LOW_POWER ? 110 : 170, 2.4);

    cue("Ring fully charged", vw() / 2, vh() * 0.42, { title: true, life: 2400 });

    voice.say("Ring fully charged.", {
      clip: "vo_ring_full",
      synthesize: false,
      rate: 1.0,
      pitch: 1.08,
      onDone: () => {
        finaleLineDone = true;
        maybeSpeakWelcome();
      }
    });
  }

  if (shockwave.visible) {
    shockwave.userData.t += dt;
    const t = shockwave.userData.t / 1.6;

    if (t >= 1) {
      shockwave.visible = false;
    } else {
      const e = 1 - Math.pow(1 - t, 3);
      shockwave.scale.setScalar(0.2 + e * 9);
      shockwave.material.opacity = (1 - t) * 0.9;
      shockwave.quaternion.copy(camera.quaternion);
    }
  }

  if (revealShown && !REDUCED_MOTION && Math.random() < dt * 7) emitSparks(1, 0.7);

  if (!revealShown && finishTime >= FINISH_REVEAL) {
    revealShown = true;
    setStage(Stage.WELCOME);
    audio.reveal();
    startWelcome();
    reveal.classList.add("visible");
    reveal.setAttribute("aria-hidden", "false");
    restart.focus({ preventScroll: true });
    maybeSpeakWelcome();
  }
}

/* ===================================== */
/* WELCOME PAGE                          */
/* ===================================== */

const CALLSIGNS = [
  "Emerald Dawn", "Brightest Night", "Will of Steel", "Verdant Spark",
  "Sector Sentinel", "Midnight Glow", "Lime Time", "Oa's Newest",
  "Constructor", "Ring Bearer", "Green Gale", "Hal's Understudy",
  "Fearless Frank", "Nightwatch", "Lantern Larry", "Captain Chartreuse"
];

const DISPATCHES = [
  "Guardians of the Universe: \"Congratulations. Please do not break the ring.\"",
  "Scanning Sector 2814... no threats detected. Suspiciously quiet.",
  "Reminder: your ring must be recharged every 24 hours. Set an alarm.",
  "Oa has assigned you a locker. It is green.",
  "Yellow objects are now officially your problem.",
  "Tip: the oath is not optional. Say it with feeling.",
  "Your ring is 100% charged. Your coffee is not.",
  "Incoming transmission: a cat is stuck in a tree in Sector 2814. Priority: emerald."
];

let callsign = "";
let lanternId = "";
let dispatchTimer = 0;
let dispatchIndex = 0;
let copyTimer = 0;

function rollCallsign() {
  callsign = pick(CALLSIGNS, callsign);
  callsignEl.textContent = callsign;
}

function typeDispatch(text, done) {
  window.clearTimeout(dispatchTimer);

  if (REDUCED_MOTION) {
    dispatchEl.textContent = text;
    dispatchTimer = window.setTimeout(done, 4200);
    return;
  }

  let i = 0;
  dispatchEl.textContent = "";

  const step = () => {
    i += 1;
    dispatchEl.textContent = text.slice(0, i);
    dispatchTimer = window.setTimeout(i < text.length ? step : done, i < text.length ? 24 + Math.random() * 30 : 3200);
  };

  step();
}

function runDispatches() {
  typeDispatch(DISPATCHES[dispatchIndex % DISPATCHES.length], () => {
    dispatchIndex += 1;
    runDispatches();
  });
}

function startWelcome() {
  document.body.classList.add("is-welcome");
  lanternId = `GL-2814-${Math.floor(1000 + Math.random() * 9000)}`;
  lanternIdEl.textContent = lanternId;
  chargeTimeEl.textContent = `${holdSeconds.toFixed(1)} s`;
  rollCallsign();
  dispatchIndex = Math.floor(Math.random() * DISPATCHES.length);
  dispatchTimer = window.setTimeout(runDispatches, 3200);
}

function stopWelcome() {
  document.body.classList.remove("is-welcome");
  window.clearTimeout(dispatchTimer);
  dispatchEl.textContent = "";
}

rerollBtn.addEventListener("click", () => {
  rollCallsign();
  audio.ui();
});

copyBtn.addEventListener("click", async () => {
  const text =
    `Green Lantern ${lanternId} "${callsign}" reporting for duty. Sector 2814, Earth's guardian. ` +
    `Ring charged in ${holdSeconds.toFixed(1)}s.`;

  let ok = false;

  try {
    await navigator.clipboard.writeText(text);
    ok = true;
  } catch (error) {
    /* clipboard can be blocked; the label says so */
  }

  copyBtn.textContent = ok ? "Copied!" : "Copy failed";
  window.clearTimeout(copyTimer);
  copyTimer = window.setTimeout(() => {
    copyBtn.textContent = "Copy Lantern ID";
  }, 1600);
});

// Tap anywhere on the welcome page to build a construct there.
const constructs = createConstructs({
  container: constructsEl,
  audio,
  reducedMotion: REDUCED_MOTION,
  lowPower: LOW_POWER
});

reveal.addEventListener("pointerdown", event => {
  if (event.target.closest("button, a")) return;
  constructs.spawn(event.clientX, event.clientY, constructsEl);
  haptic(12);
});

/* ===================================== */
/* RESET                                 */
/* ===================================== */

// "Recharge": the ring drops off the lantern at 2% and you go again. The knock
// tutorial is skipped the second time round.
function resetExperience() {
  voice.stop();
  audio.trackReset();
  constructs.clear();
  oath.reset();
  stopWelcome();

  charge = START_CHARGE;
  holdRamp = 0;
  holdSeconds = 0;
  wasCharging = false;
  attractionLevel = 0;
  finishTime = 0;
  flashFired = false;
  revealShown = false;
  finaleLineDone = false;
  welcomeSpoken = false;
  promptOverride = null;
  sticky = false;
  pointer.down = false;
  pointer.id = null;

  reveal.classList.remove("visible");
  reveal.setAttribute("aria-hidden", "true");
  flash.classList.remove("fire");
  shockwave.visible = false;
  clearParticles();

  // The ring pops off the lens and falls to the floor.
  ringBody.mode = "falling";
  ringBody.x = scratch.socketScreen.x;
  ringBody.y = scratch.socketScreen.y;
  ringBody.vx = (Math.random() - 0.5) * 500;
  ringBody.vy = -700;
  ringSpin.rotation.set(0, 0, 0);
  battery.rotation.set(0, 0, 0);

  setStage(Stage.SEEK);
}

restart.addEventListener("click", () => {
  unlockMedia();
  resetExperience();
});

/* ===================================== */
/* SOUND TOGGLE                          */
/* ===================================== */

function syncSoundLabel() {
  const on = audio.isUnlocked() && !audio.isMuted();
  soundLabel.textContent = on ? "Sound on" : "Sound off";
  soundToggle.setAttribute("aria-pressed", String(on));
}

function toggleSound() {
  const muted = !audio.isMuted();
  audio.setMuted(muted);
  voice.setMuted(muted);
  syncSoundLabel();
}

soundToggle.addEventListener("click", () => {
  if (!audio.isUnlocked()) {
    unlockMedia();
    return;
  }

  toggleSound();
});

voice.setMuted(audio.isMuted());
syncSoundLabel();

function announce(text) {
  srStatus.textContent = text;
}

/* ===================================== */
/* CAMERA                                */
/* ===================================== */

const cameraLook = new THREE.Vector3();
let dockView = 0;
let openingPush = 1;
let entered = false;

function updateCamera(time, dt) {
  const parallax = pointer.type === "mouse" && pointer.inside && !REDUCED_MOTION;
  const px = parallax ? (pointer.x / vw() - 0.5) * 2 : 0;
  const py = parallax ? (pointer.y / vh() - 0.5) * 2 : 0;

  const build = stage === Stage.FINALE || stage === Stage.WELCOME
    ? THREE.MathUtils.smoothstep(finishTime / FINISH_PEAK, 0, 1)
    : 0;

  punch = damp(punch, 0, 3, dt);

  // The opening shot: a slow push in from far back as the picture fades up.
  openingPush = damp(openingPush, stage === Stage.INTRO || stage === Stage.LOADING ? 1 : 0, 0.55, dt);
  lensPass.uniforms.uFade.value = damp(lensPass.uniforms.uFade.value, entered ? 1 : 0, 0.9, dt);

  // Slow dolly toward the lens as the charge builds, a big push at the finale.
  const level = powered ? charge : 0;
  const zTarget = layout.z - level * 0.55 - attractionLevel * 0.1 - build * 0.6 - punch + openingPush * 7;

  let xTarget = 0;
  let yTarget = 0;

  if (!REDUCED_MOTION) {
    // A slow, handheld-feeling drift, plus a little parallax from the mouse.
    xTarget = px * 0.14 + Math.sin(time * 0.11) * 0.22 + Math.sin(time * 0.37) * 0.04;
    yTarget = -py * 0.08 + Math.cos(time * 0.09) * 0.12 + openingPush * 0.8;
  }

  // On the lantern, swing round to a three-quarter view so you can see the
  // ring's head seated in the lens.
  const onLantern = stage === Stage.DOCKED || stage === Stage.FINALE || stage === Stage.WELCOME;
  dockView = damp(dockView, onLantern ? 1 : 0, 1.1, dt);
  xTarget += dockView * layout.z * 0.42;
  yTarget += dockView * 0.7;

  camera.position.x = damp(camera.position.x, xTarget, 2.2, dt);
  camera.position.y = damp(camera.position.y, yTarget, 2.2, dt);
  camera.position.z = damp(camera.position.z, zTarget, 1.6, dt);

  cameraLook.set(0, 0, 0);
  camera.lookAt(cameraLook);
  camera.updateMatrixWorld();
}

/* ===================================== */
/* LOOP                                  */
/* ===================================== */

let lastTime = performance.now();

function animate(now) {
  requestAnimationFrame(animate);

  const dt = clamp((now - lastTime) / 1000, 0, 0.1);
  lastTime = now;
  elapsed += dt;
  stageTime += dt;

  if (!ready) return;

  battery.position.y = layout.batteryY + Math.sin(elapsed * 0.85) * 0.012;

  updateCamera(elapsed, dt);
  updateSocket();
  updateRingBody(dt);
  updateInteraction(dt);
  updateRing3D(elapsed, dt);
  updateCharge(dt);
  updateFinish(dt);
  updateEnergy(elapsed, dt);
  updateParticles(dt);
  updateBeam();
  updateHud();
  updateHand();
  updateHints(dt);
  updatePrompt();
  updateShake(dt);
  constructs.update(dt);

  audio.update({
    attraction: attractionLevel,
    docked: stage === Stage.DOCKED,
    charging: isCharging(),
    charge: powered ? charge : 0,
    finale: stage === Stage.FINALE || stage === Stage.WELCOME,
    swing: ringBody.mode === "held" ? clamp(ringBody.speed / 2600, 0, 1) : 0
  });

  composer.render();
}

/* ===================================== */
/* START                                 */
/* ===================================== */

loadAssets()
  .then(() => {
    computeLayout();

    // The ring starts lying at the bottom of the screen.
    ringBody.mode = "rest";
    ringBody.x = vw() * 0.5;
    ringBody.y = layout.floorY;
    camera.position.z = layout.z;
    battery.position.y = layout.batteryY;
    camera.updateMatrixWorld();
    screenToWorld(ringBody.x, ringBody.y, RING_Z_REST, scratch.target);
    ring.position.copy(scratch.target);
    ring.quaternion.copy(quat.rest);

    ready = true;
    setStage(Stage.INTRO);

    // Let the counter sit at 100 for a beat, then bring up the title card.
    window.setTimeout(() => {
      introEl.classList.add("is-ready");
      enterBtn.focus({ preventScroll: true });
    }, 700);
  })
  .catch(error => {
    console.error(error);
    introEl.classList.add("is-error");
    introLabel.textContent = "Couldn't load the lantern. Serve this folder over http (not file://) and reload.";
  });

// Entering is a real click, so it also unlocks sound and voice.
function enter(withSound) {
  if (stage !== Stage.INTRO) return;

  unlockMedia();
  if (!withSound && !audio.isMuted()) toggleSound();
  if (withSound && audio.isMuted()) toggleSound();

  entered = true;
  introEl.classList.add("is-gone");
  loaderEl.classList.add("is-entered");
  enterBtn.blur();

  pendingStage = { stage: Stage.PICKUP, at: elapsed + 2.2 };
}

enterBtn.addEventListener("click", () => enter(true));
enterQuiet.addEventListener("click", () => enter(false));

requestAnimationFrame(animate);

// Development aid: open with ?debug to inspect and fast-forward from the console.
if (new URLSearchParams(window.location.search).has("debug")) {
  window.__lantern = {
    get stage() { return stage; },
    get charge() { return charge; },
    set charge(value) { charge = value; },
    get ring() { return { ...ringBody }; },
    get socket() { return { ...scratch.socketScreen }; },
    get oathDone() { return oath.done; },
    get voice() { return voice.voiceName; },
    skip: () => skipIntro(),
    dock: () => {
      if (!powered) skipIntro();
      ringBody.mode = "held";
      dock();
    }
  };
}
