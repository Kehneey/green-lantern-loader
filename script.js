import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { createAudio } from "./audio.js";

/* ===================================== */
/* DOM                                   */
/* ===================================== */

const vw = () => Math.max(1, window.innerWidth);
const vh = () => Math.max(1, window.innerHeight);

const $ = id => document.getElementById(id);

const stage = $("threeStage");
const instruction = $("instruction");
const progressText = $("progressText");
const srStatus = $("srStatus");
const ambient = $("ambient");
const floorGlow = $("floorGlow");
const dustContainer = $("dust");
const beam = $("beam");
const beamBlur = $("beamBlur");
const flash = $("flash");
const reveal = $("reveal");
const restart = $("restart");
const modelStatus = $("modelStatus");
const oathLines = [...document.querySelectorAll(".oath-line")];
const soundToggle = $("soundToggle");

/* ===================================== */
/* TUNING                                */
/* ===================================== */

const REDUCED_MOTION = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Timing is in seconds and frame-rate independent.
const CHARGE_SECONDS = 22;      // continuous hold needed to reach 100%
const CHARGE_RAMP = 1.6;        // seconds for the charge rate to reach full speed
const DRAIN_PER_SECOND = 0.055; // fraction of the charge lost per second when not holding

// Each oath line starts revealing at one of these charge fractions.
// Words fade in one by one (see WORD_STAGGER in style.css), so a line takes a
// few seconds to finish and the next one cannot start before it is done.
const OATH_THRESHOLDS = [0.03, 0.27, 0.51, 0.76];

const ATTRACTION_RADIUS = 280;
const SNAP_IN_RADIUS = 90;
const SNAP_OUT_RADIUS = 128;   // hysteresis, so the lock does not flicker at the edge

// Finish sequence (seconds after the charge hits 100%).
const FINISH_PEAK = 1.7;
const FINISH_FLASH = 2.0;
const FINISH_REVEAL = 3.4;

const CAMERA_Z = 10.6;
const BATTERY_HEIGHT = 2.9;
const BATTERY_Y = 0.52;
const RING_DIAMETER = 0.62;

/* ===================================== */
/* STATE                                 */
/* ===================================== */

let battery;          // group: model + glow overlays
let glassMaterial;
let coreMaterial;
let batteryDisc;
let ring;             // group that follows the pointer
let ringSpin;         // the signet model (face at the origin, +Z)
let ringFaceGlow;
let ringEnamel;
let ringDisc;
let ringAura;
let lensGlow;
let lensHalo;
let flare;
let shockwave;

// Until the user moves, the ring waits left of the battery.
let hasPointer = false;
let pointerX = vw() * 0.2;
let pointerY = vh() * 0.58;
let smoothX = pointerX;
let smoothY = pointerY;

let isSnapped = false;
let isHolding = false;
let keyboardHold = false;
let pointerHold = false;
let completed = false;
let ready = false;

let charge = 0;          // 0..1
let holdTime = 0;
let attractionLevel = 0;
let finishTime = 0;
let flashFired = false;
let revealShown = false;
let lastAnnounced = 0;

const audio = createAudio();
let wasCharging = false;

let lastInstruction = "";
let lastProgress = -1;
const lineState = oathLines.map(() => false);

/* ===================================== */
/* SCENE                                 */
/* ===================================== */

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x020604, 0.02);

const camera = new THREE.PerspectiveCamera(
  32,
  vw() / vh(),
  0.1,
  100
);
camera.position.set(0, 0, CAMERA_Z);

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: true,
    powerPreference: "high-performance"
  });
} catch (error) {
  renderer = null;
}

if (!renderer) {
  modelStatus.textContent = "WebGL is not available in this browser";
  modelStatus.classList.add("error");
  throw new Error("WebGL unavailable");
}

const MAX_PIXEL_RATIO = 1.75;

renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
renderer.setSize(vw(), vh());
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

stage.appendChild(renderer.domElement);
renderer.domElement.setAttribute("role", "img");
renderer.domElement.setAttribute(
  "aria-label",
  "A Green Lantern power battery and ring"
);

// Studio reflections are what make the metal look like metal.
const pmrem = new THREE.PMREMGenerator(renderer);
const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environment = environment;
scene.environmentIntensity = 0.55;
pmrem.dispose();

/* ===================================== */
/* POST PROCESSING                       */
/* ===================================== */

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(vw() / 2, vh() / 2),
  0.5,
  0.55,
  0.86
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

// Lens finish: vignette, a touch of chromatic aberration and film grain.
const lensPass = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uAberration: { value: 0.0015 },
    uGrain: { value: REDUCED_MOTION ? 0 : 0.045 },
    uVignette: { value: 0.55 }
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

      vec3 color;
      color.r = texture2D(tDiffuse, vUv + shift).r;
      color.g = texture2D(tDiffuse, vUv).g;
      color.b = texture2D(tDiffuse, vUv - shift).b;

      float vignette = smoothstep(0.92, 0.18, length(d) * 1.25);
      color *= mix(1.0 - uVignette, 1.0, vignette);

      float grain = hash(vUv * 1400.0 + fract(uTime) * 91.0) - 0.5;
      color += grain * uGrain;

      gl_FragColor = vec4(color, 1.0);
    }
  `
});
composer.addPass(lensPass);

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
}

/* ===================================== */
/* LIGHTING                              */
/* ===================================== */

scene.add(new THREE.AmbientLight(0x6f9b7e, 0.35));

const keyLight = new THREE.DirectionalLight(0xdff7e6, 2.2);
keyLight.position.set(4.2, 5.2, 6.6);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x2a5a3d, 0.9);
fillLight.position.set(-4, 1.2, 4.2);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0x14ff74, 2.4);
rimLight.position.set(-2.6, 3.2, -4.2);
scene.add(rimLight);

const rimLightB = new THREE.DirectionalLight(0x7affb0, 1.4);
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
/* PARTICLES (GPU points)                */
/* ===================================== */

const MAX_PARTICLES = REDUCED_MOTION ? 160 : 420;

const particleGeometry = new THREE.BufferGeometry();
const particlePositions = new Float32Array(MAX_PARTICLES * 3);
const particleSizes = new Float32Array(MAX_PARTICLES);
const particleAlphas = new Float32Array(MAX_PARTICLES);

particleGeometry.setAttribute("position", new THREE.BufferAttribute(particlePositions, 3));
particleGeometry.setAttribute("aSize", new THREE.BufferAttribute(particleSizes, 1));
particleGeometry.setAttribute("aAlpha", new THREE.BufferAttribute(particleAlphas, 1));

function pointScale() {
  return (
    (renderer.getPixelRatio() * vh()) /
    (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2))
  );
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
  b: new THREE.Vector3(),
  c: new THREE.Vector3(),
  ndc: new THREE.Vector3(),
  socketWorld: new THREE.Vector3(),
  socketScreen: { x: 0, y: 0 },
  ringScreen: { x: 0, y: 0 },
  target: new THREE.Vector3()
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

// Energy leaving the ring and spiralling into the battery lens.
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

// Sparks thrown off the lens, or a full radial burst when `power` is high.
function emitSparks(count, power = 1) {
  for (let i = 0; i < count; i++) {
    const p = spawnParticle();
    if (!p) return;

    const angle = Math.random() * Math.PI * 2;
    const speed = (0.5 + Math.random() * 1.9) * power;

    p.kind = 0;
    p.life = 0.45 + Math.random() * 0.9;
    p.size = 0.012 + Math.random() * 0.026;
    p.px = scratch.socketWorld.x + Math.cos(angle) * 0.1;
    p.py = scratch.socketWorld.y + Math.sin(angle) * 0.1;
    p.pz = scratch.socketWorld.z + 0.06;
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

// Both props are built in code to match the reference photos: a gold signet
// ring with green enamel and a concentric-ringed centre disc, and a brass
// railway lantern with ribbed green glass and a ringed lens medallion.

function makeCanvasTexture(size, draw, { data = false, repeat = 0 } = {}) {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  draw(canvas.getContext("2d"), size);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = data ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  if (repeat) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeat, repeat);
  }

  return texture;
}

// Fine concentric grooves, used on the ring's centre disc and the lens medallion.
function ringsTexture() {
  return makeCanvasTexture(512, (ctx, size) => {
    ctx.fillStyle = "#03150b";
    ctx.fillRect(0, 0, size, size);
    ctx.lineWidth = 2.4;

    for (let r = 7; r < size / 2; r += 7.5) {
      ctx.strokeStyle = `rgba(120,255,165,${0.5 + Math.random() * 0.4})`;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = "#020a05";
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 9, 0, Math.PI * 2);
    ctx.fill();
  });
}

// Cracked, glittering green enamel over black, like the photographed ring.
function enamelTexture() {
  return makeCanvasTexture(512, (ctx, size) => {
    ctx.fillStyle = "#031209";
    ctx.fillRect(0, 0, size, size);
    ctx.lineCap = "round";

    for (let i = 0; i < 220; i++) {
      let x = Math.random() * size;
      let y = Math.random() * size;
      let angle = Math.random() * Math.PI * 2;

      ctx.strokeStyle = `hsl(${142 + Math.random() * 16}, 85%, ${34 + Math.random() * 28}%)`;
      ctx.lineWidth = 1 + Math.random() * 1.8;
      ctx.beginPath();
      ctx.moveTo(x, y);

      const steps = 4 + Math.floor(Math.random() * 9);
      for (let s = 0; s < steps; s++) {
        angle += (Math.random() - 0.5) * 1.8;
        const length = 6 + Math.random() * 22;
        x += Math.cos(angle) * length;
        y += Math.sin(angle) * length;
        ctx.lineTo(x, y);
      }

      ctx.stroke();
    }

    for (let i = 0; i < 900; i++) {
      ctx.fillStyle = `rgba(150,255,190,${Math.random() * 0.8})`;
      ctx.fillRect(Math.random() * size, Math.random() * size, 1.5, 1.5);
    }
  });
}

// Grey noise plus scratches: drives roughness and bump on every metal part.
function scuffTexture(repeat = 3) {
  return makeCanvasTexture(256, (ctx, size) => {
    const image = ctx.createImageData(size, size);

    for (let i = 0; i < image.data.length; i += 4) {
      const v = 150 + Math.random() * 105;
      image.data[i] = image.data[i + 1] = image.data[i + 2] = v;
      image.data[i + 3] = 255;
    }

    ctx.putImageData(image, 0, 0);

    for (let i = 0; i < 70; i++) {
      const dark = Math.random() > 0.5 ? 40 : 255;
      ctx.strokeStyle = `rgba(${dark},${dark},${dark},${0.1 + Math.random() * 0.25})`;
      ctx.lineWidth = 0.6 + Math.random();
      ctx.beginPath();
      const x = Math.random() * size;
      const y = Math.random() * size;
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 70, y + (Math.random() - 0.5) * 24);
      ctx.stroke();
    }
  }, { data: true, repeat });
}

function buildRing() {
  const scuff = scuffTexture(2);
  const rings = ringsTexture();
  const enamelMap = enamelTexture();

  const gold = new THREE.MeshPhysicalMaterial({
    color: 0xd9a93b,
    metalness: 1,
    roughness: 0.3,
    roughnessMap: scuff,
    clearcoat: 0.25,
    clearcoatRoughness: 0.35
  });

  const silver = new THREE.MeshPhysicalMaterial({
    color: 0xc6c9cc,
    metalness: 1,
    roughness: 0.62,
    roughnessMap: scuff,
    bumpMap: scuff,
    bumpScale: 1.4
  });

  const enamel = new THREE.MeshPhysicalMaterial({
    color: 0x0d4a29,
    map: enamelMap,
    emissive: 0x20e070,
    emissiveMap: enamelMap,
    emissiveIntensity: 0.05,
    metalness: 0.35,
    roughness: 0.16,
    clearcoat: 1,
    clearcoatRoughness: 0.04
  });

  const disc = new THREE.MeshPhysicalMaterial({
    color: 0x0f4a28,
    map: rings,
    emissive: 0x4dff94,
    emissiveMap: rings,
    emissiveIntensity: 0.25,
    metalness: 0.75,
    roughness: 0.32
  });

  const model = new THREE.Group();

  // Band: a torus around the Y axis, so the finger would point up.
  const band = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.11, 28, 72), silver);
  band.rotation.x = Math.PI / 2;
  band.scale.set(1, 1, 1.12);
  model.add(band);

  // Square face on the +Z side of the band.
  const plate = new THREE.Mesh(new RoundedBoxGeometry(1.02, 1.0, 0.16, 5, 0.025), gold);
  plate.position.z = 0.58;
  model.add(plate);

  const faceZ = 0.58 + 0.08;

  const place = (mesh, z, x = 0, y = 0) => {
    mesh.position.set(x, y, faceZ + z);
    model.add(mesh);
    return mesh;
  };

  // Two enamel bars and the enamel field between them.
  for (const y of [0.405, -0.405]) {
    place(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.15, 0.02), enamel), 0.004, 0, y);
  }

  place(new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.02), enamel), 0.004);

  // Gold circle outline and the ringed centre disc.
  place(new THREE.Mesh(new THREE.TorusGeometry(0.265, 0.022, 14, 72), gold), 0.012);
  place(new THREE.Mesh(new THREE.CircleGeometry(0.235, 72), disc), 0.016);

  const faceGlow = place(
    new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), additive(glowTexture, 0x6dffa8, 0)),
    0.07
  );

  // Put the face, not the band, at the group origin so the ring tilts about it.
  model.position.z = -faceZ;

  const group = new THREE.Group();
  group.add(model);
  group.userData.enamel = enamel;
  group.userData.disc = disc;
  group.userData.faceGlow = faceGlow;

  return group;
}

function buildBattery() {
  const scuff = scuffTexture(4);
  const rings = ringsTexture();

  const brass = new THREE.MeshPhysicalMaterial({
    color: 0xb48b3c,
    metalness: 1,
    roughness: 0.42,
    roughnessMap: scuff,
    bumpMap: scuff,
    bumpScale: 0.8,
    clearcoat: 0.1
  });

  const stone = new THREE.MeshPhysicalMaterial({
    color: 0x6c6e69,
    metalness: 0.05,
    roughness: 0.86,
    roughnessMap: scuff,
    bumpMap: scuff,
    bumpScale: 2
  });

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0e7436,
    transparent: true,
    opacity: 0.88,
    metalness: 0,
    roughness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    ior: 1.5,
    emissive: 0x18ff70,
    emissiveIntensity: 0,
    side: THREE.DoubleSide,
    envMapIntensity: 1.5
  });

  const core = new THREE.MeshStandardMaterial({
    color: 0x063d1d,
    emissive: 0x2dff7e,
    emissiveIntensity: 0.18,
    roughness: 0.4
  });

  const disc = new THREE.MeshPhysicalMaterial({
    color: 0x0f4a28,
    map: rings,
    emissive: 0x4dff94,
    emissiveMap: rings,
    emissiveIntensity: 0.4,
    metalness: 0.75,
    roughness: 0.3
  });

  const lantern = new THREE.Group();

  const add = (geometry, material, x, y, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    lantern.add(mesh);
    return mesh;
  };

  // Ribbed glass: a bulging lathe with a ripple along its height.
  const profile = [];
  const steps = 90;

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const radius =
      0.58 +
      0.1 * Math.sin(Math.PI * t) +
      0.032 * (0.5 + 0.5 * Math.cos(t * Math.PI * 2 * 9));
    profile.push(new THREE.Vector2(radius, -1 + 2 * t));
  }

  add(new THREE.LatheGeometry(profile, 72), glass, 0, 0);

  // Glowing core inside the glass.
  add(new THREE.CylinderGeometry(0.3, 0.3, 1.7, 32), core, 0, 0);

  // Top: brass and stone collars, cone, dome and carrying ring.
  add(new THREE.CylinderGeometry(0.76, 0.76, 0.1, 56), brass, 0, 1.02);
  add(new THREE.CylinderGeometry(0.74, 0.74, 0.22, 56), stone, 0, 1.18);
  add(new THREE.CylinderGeometry(0.77, 0.77, 0.1, 56), brass, 0, 1.34);
  add(new THREE.CylinderGeometry(0.3, 0.7, 0.34, 56), brass, 0, 1.56);
  add(new THREE.SphereGeometry(0.2, 32, 20), brass, 0, 1.76).scale.y = 1.2;
  add(new THREE.TorusGeometry(0.36, 0.03, 18, 72), brass, 0, 2.06);

  // Bottom: mirrored collars and a flared foot.
  add(new THREE.CylinderGeometry(0.76, 0.76, 0.1, 56), brass, 0, -1.02);
  add(new THREE.CylinderGeometry(0.74, 0.74, 0.22, 56), stone, 0, -1.18);
  add(new THREE.CylinderGeometry(0.77, 0.77, 0.1, 56), brass, 0, -1.34);
  add(new THREE.CylinderGeometry(0.72, 0.84, 0.3, 56), brass, 0, -1.54);
  add(new THREE.CylinderGeometry(0.86, 0.86, 0.08, 56), brass, 0, -1.74);

  // Two brass rails across the front, held off the glass by small posts.
  for (const y of [0.25, -0.25]) {
    const rail = add(new THREE.CylinderGeometry(0.024, 0.024, 2.0, 16), brass, 0, y, 0.72);
    rail.rotation.z = Math.PI / 2;

    for (const x of [-1, 1]) {
      add(new THREE.SphereGeometry(0.045, 16, 12), brass, x, y, 0.72);

      const post = add(new THREE.CylinderGeometry(0.02, 0.02, 0.24, 12), brass, x * 0.62, y, 0.62);
      post.rotation.x = Math.PI / 2;
    }
  }

  // Lens medallion: brass disc, outer ring and the ringed centre.
  const medallion = add(new THREE.CylinderGeometry(0.37, 0.4, 0.12, 72), brass, 0, 0, 0.76);
  medallion.rotation.x = Math.PI / 2;

  add(new THREE.TorusGeometry(0.34, 0.028, 16, 72), brass, 0, 0, 0.83);
  add(new THREE.CircleGeometry(0.29, 72), disc, 0, 0, 0.828);

  add(
    new THREE.PlaneGeometry(0.12, 0.12),
    new THREE.MeshBasicMaterial({ color: 0xbfffd6, toneMapped: false }),
    0,
    0,
    0.832
  );

  // Centre the lantern on the origin; its overall height is about 4 units.
  lantern.position.y = -0.34;

  const group = new THREE.Group();
  group.add(lantern);
  group.scale.setScalar(BATTERY_HEIGHT / 4.06);

  group.userData.socket = new THREE.Vector3(0, -0.34, 0.83);
  group.userData.glass = glass;
  group.userData.core = core;
  group.userData.disc = disc;

  return group;
}

function buildAssets() {
  /* Battery */
  battery = buildBattery();
  glassMaterial = battery.userData.glass;
  coreMaterial = battery.userData.core;
  batteryDisc = battery.userData.disc;

  const socket = battery.userData.socket;

  lensGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    additive(glowTexture, 0x9dffc0, 0.0)
  );
  lensGlow.position.copy(socket).add(new THREE.Vector3(0, 0, 0.06));
  battery.add(lensGlow);

  lensHalo = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    additive(glowTexture, 0x20ff74, 0.0)
  );
  lensHalo.position.copy(socket).add(new THREE.Vector3(0, 0, 0.04));
  battery.add(lensHalo);

  flare = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    additive(flareTexture, 0xb8ffd0, 0.0)
  );
  flare.position.copy(socket).add(new THREE.Vector3(0, 0, 0.1));
  battery.add(flare);

  battery.position.set(0, BATTERY_Y, 0);
  scene.add(battery);

  shockwave = new THREE.Mesh(
    new THREE.RingGeometry(0.94, 1, 128),
    additive(null, 0xc8ffd9, 0)
  );
  shockwave.visible = false;
  scene.add(shockwave);

  /* Ring */
  ring = new THREE.Group();
  ringSpin = buildRing();
  ringSpin.scale.setScalar(RING_DIAMETER);
  ringFaceGlow = ringSpin.userData.faceGlow;
  ringEnamel = ringSpin.userData.enamel;
  ringDisc = ringSpin.userData.disc;
  ring.add(ringSpin);

  ringAura = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    additive(glowTexture, 0x50ff94, 0.0)
  );
  ring.add(ringAura);

  scene.add(ring);

  placeRingAtPointer(true);
}

/* ===================================== */
/* INPUT                                 */
/* ===================================== */

function setHolding() {
  isHolding = pointerHold || keyboardHold;
}

window.addEventListener("pointermove", event => {
  hasPointer = true;
  pointerX = event.clientX;
  pointerY = event.clientY;
});

window.addEventListener("pointerdown", event => {
  // Touch has no hover, so the first contact also positions the ring.
  hasPointer = true;
  pointerX = event.clientX;
  pointerY = event.clientY;

  if (event.target.closest("button")) return;

  audio.unlock();
  syncSoundLabel();

  pointerHold = true;
  setHolding();

  if (event.target.setPointerCapture) {
    try {
      event.target.setPointerCapture(event.pointerId);
    } catch (error) {
      /* capture is best effort */
    }
  }
});

function releasePointer() {
  pointerHold = false;
  setHolding();
}

window.addEventListener("pointerup", releasePointer);
window.addEventListener("pointercancel", releasePointer);
window.addEventListener("blur", () => {
  pointerHold = false;
  keyboardHold = false;
  setHolding();
});

document.addEventListener("visibilitychange", () => {
  if (document.hidden) audio.suspend();
  else audio.resume();

  if (document.hidden) {
    pointerHold = false;
    keyboardHold = false;
    setHolding();
  }
});

window.addEventListener("contextmenu", event => event.preventDefault());

const KEY_STEP = 26;

window.addEventListener("keydown", event => {
  if (event.target.closest && event.target.closest("button")) return;

  audio.unlock();
  syncSoundLabel();

  if (event.code === "KeyM") {
    toggleSound();
    return;
  }

  if (event.code === "Space") {
    event.preventDefault();
    keyboardHold = true;
    setHolding();
    return;
  }

  const moves = {
    ArrowLeft: [-KEY_STEP, 0],
    ArrowRight: [KEY_STEP, 0],
    ArrowUp: [0, -KEY_STEP],
    ArrowDown: [0, KEY_STEP]
  };

  if (moves[event.code]) {
    event.preventDefault();
    pointerX = THREE.MathUtils.clamp(pointerX + moves[event.code][0], 0, vw());
    pointerY = THREE.MathUtils.clamp(pointerY + moves[event.code][1], 0, vh());
  }
});

window.addEventListener("keyup", event => {
  if (event.code === "Space") {
    keyboardHold = false;
    setHolding();
  }
});

/* ===================================== */
/* WORLD / SCREEN                        */
/* ===================================== */

function screenToWorld(x, y, zPlane, out) {
  scratch.ndc.set(
    (x / vw()) * 2 - 1,
    -(y / vh()) * 2 + 1,
    0.5
  );

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

function updateSocket() {
  scratch.socketWorld.copy(battery.userData.socket);
  battery.localToWorld(scratch.socketWorld);
  worldToScreen(scratch.socketWorld, scratch.socketScreen);
}

function placeRingAtPointer(instant = false) {
  screenToWorld(smoothX, smoothY, 2.0, scratch.target);

  if (instant) {
    ring.position.copy(scratch.target);
    ring.rotation.set(0.28, -0.6, 0.12);
  }
}

/* ===================================== */
/* RING                                  */
/* ===================================== */

const IDLE_ROT = new THREE.Euler(0.28, -0.6, 0.12);
const SNAP_ROT = new THREE.Euler(0.1, -0.16, 0);

function damp(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

function updateRing(time, dt) {
  if (!hasPointer) {
    pointerX = vw() * 0.2;
    pointerY = vh() * 0.58;
  }

  const follow = 1 - Math.exp(-16 * dt);
  smoothX += (pointerX - smoothX) * follow;
  smoothY += (pointerY - smoothY) * follow;

  const dx = smoothX - scratch.socketScreen.x;
  const dy = smoothY - scratch.socketScreen.y;
  const distance = Math.hypot(dx, dy);

  isSnapped = isSnapped
    ? distance < SNAP_OUT_RADIUS
    : distance < SNAP_IN_RADIUS;

  let attraction = THREE.MathUtils.clamp(1 - distance / ATTRACTION_RADIUS, 0, 1);
  attraction = attraction * attraction * (3 - 2 * attraction);
  attractionLevel = damp(attractionLevel, attraction, 8, dt);

  if (isSnapped) attraction = 0.99;

  const visualX = THREE.MathUtils.lerp(smoothX, scratch.socketScreen.x, attraction);
  const visualY = THREE.MathUtils.lerp(smoothY, scratch.socketScreen.y, attraction);

  screenToWorld(visualX, visualY, 2.0, scratch.target);

  if (isSnapped) {
    // Press the ring onto the lens, a little further in while charging.
    scratch.target.copy(scratch.socketWorld);
    scratch.target.z += isHolding ? 0.14 : 0.26;
  }

  ring.position.x = damp(ring.position.x, scratch.target.x, isSnapped ? 11 : 13, dt);
  ring.position.y = damp(ring.position.y, scratch.target.y, isSnapped ? 11 : 13, dt);
  ring.position.z = damp(ring.position.z, scratch.target.z, 7, dt);

  const rot = isSnapped ? SNAP_ROT : IDLE_ROT;
  const bob = isSnapped ? 0 : Math.sin(time * 1.7) * 0.05;

  ring.rotation.x = damp(ring.rotation.x, rot.x + bob, 6, dt);
  ring.rotation.y = damp(ring.rotation.y, rot.y + Math.cos(time * 1.3) * (isSnapped ? 0 : 0.06), 6, dt);
  ring.rotation.z = damp(ring.rotation.z, rot.z, 6, dt);

  // The emblem stays upright. Under load the ring trembles instead of spinning.
  const tremor = isHolding && isSnapped && !REDUCED_MOTION ? charge * charge : 0;
  ringSpin.rotation.y = Math.sin(time * 38) * 0.018 * tremor;
  ringSpin.rotation.x = Math.sin(time * 31 + 0.7) * 0.014 * tremor;
}

/* ===================================== */
/* BEAM                                  */
/* ===================================== */

function updateBeam() {
  let strength = attractionLevel * 0.3;
  if (isSnapped) strength = 0.42;
  if (isHolding && isSnapped) strength = 0.55 + charge * 0.4;
  if (completed) strength = 0;

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
/* TEXT                                  */
/* ===================================== */

function setInstruction(text) {
  if (text === lastInstruction) return;
  lastInstruction = text;
  instruction.textContent = text;
}

function announce(text) {
  srStatus.textContent = text;
}

function updateInstruction() {
  if (completed) {
    setInstruction("Charge complete");
  } else if (isHolding && isSnapped) {
    setInstruction("Hold steady");
  } else if (isSnapped) {
    setInstruction(charge > 0.02 ? "Keep holding to charge" : "Press and hold to charge");
  } else if (attractionLevel > 0.08) {
    setInstruction("Energy lock acquired");
  } else {
    setInstruction("Bring the ring to the battery");
  }
}

function updateProgressText() {
  const percent = Math.round(charge * 100);
  if (percent === lastProgress) return;
  lastProgress = percent;
  progressText.textContent = `${percent}%`;

  const milestone = Math.floor(percent / 25) * 25;
  if (milestone > lastAnnounced) {
    lastAnnounced = milestone;
    announce(`Charge ${milestone} percent`);
  } else if (milestone < lastAnnounced) {
    lastAnnounced = milestone;
  }
}

function updateOath() {
  oathLines.forEach((line, index) => {
    const threshold = OATH_THRESHOLDS[index] ?? 1;
    const next = OATH_THRESHOLDS[index + 1] ?? 2;

    // A little hysteresis so a line does not flicker while the charge jitters.
    const shown = lineState[index]
      ? charge >= threshold - 0.015
      : charge >= threshold;

    if (shown && !lineState[index]) audio.oath(index, oathLines.length);

    lineState[index] = shown;

    line.classList.toggle("visible", shown);
    line.classList.toggle("active", shown && charge < next);
  });
}

/* ===================================== */
/* CHARGE                                */
/* ===================================== */

function updateCharge(dt) {
  if (completed) return;

  if (isHolding && isSnapped) {
    holdTime += dt;
    const ramp = THREE.MathUtils.smoothstep(holdTime / CHARGE_RAMP, 0, 1);
    charge += (dt / CHARGE_SECONDS) * (0.35 + 0.65 * ramp);
  } else {
    holdTime = Math.max(0, holdTime - dt * 2);
    charge -= DRAIN_PER_SECOND * dt;
  }

  charge = THREE.MathUtils.clamp(charge, 0, 1);

  const charging = isHolding && isSnapped;
  if (wasCharging && !charging && charge > 0.05 && charge < 1) audio.release();
  wasCharging = charging;

  if (charge >= 1) startFinish();
}

/* ===================================== */
/* ENERGY VISUALS                        */
/* ===================================== */

let emitCarry = 0;
let sparkCarry = 0;

function updateEnergy(time, dt) {
  const proximity = attractionLevel;
  const level = charge;
  const holding = isHolding && isSnapped && !completed;

  // Slow breathing pulse that quickens as the ring charges.
  const pulse = 0.5 + 0.5 * Math.sin(time * (1.6 + level * 5.5));
  const flicker = REDUCED_MOTION ? 0 : (Math.random() - 0.5) * level * 0.08;

  // Finish buildup (0..1) and its aftermath.
  const build = completed
    ? THREE.MathUtils.smoothstep(finishTime / FINISH_PEAK, 0, 1)
    : 0;
  const energy = Math.min(1.6, level * 0.85 + build * 0.9 + (holding ? 0.06 : 0));

  const lensSize = 0.85 + proximity * 0.08 + energy * 0.5;
  lensGlow.scale.setScalar(lensSize);
  lensGlow.material.opacity = Math.min(
    0.85,
    (0.08 + proximity * 0.12 + energy * (0.38 + pulse * 0.14) + flicker) *
      (isSnapped && !completed ? 0.7 : 1)
  );

  const haloSize = 1.9 + proximity * 0.4 + energy * 1.7;
  lensHalo.scale.setScalar(haloSize);
  lensHalo.material.opacity = Math.min(0.7, 0.08 + proximity * 0.14 + energy * 0.3);

  flare.scale.set(2 + energy * 6.5, 0.1 + energy * 0.22, 1);
  flare.material.opacity = Math.min(1, Math.max(0, energy - 0.12) * 0.9 + (completed ? 0.1 : 0));

  // The lantern's glass fills with light from the core as the charge builds.
  glassMaterial.emissiveIntensity = 0.02 + proximity * 0.05 + energy * (0.55 + pulse * 0.2);
  coreMaterial.emissiveIntensity = 0.18 + proximity * 0.5 + energy * (2.6 + pulse * 0.9);
  batteryDisc.emissiveIntensity = 0.4 + proximity * 0.7 + energy * (2.2 + pulse * 0.6);

  // The ring's centre disc lights first, then the enamel.
  ringDisc.emissiveIntensity = 0.25 + proximity * 0.7 + (holding ? 0.5 : 0) + energy * 2.4;
  ringEnamel.emissiveIntensity = 0.05 + proximity * 0.2 + (holding ? 0.2 : 0) + energy * 0.9;
  ringFaceGlow.material.opacity = Math.min(0.9, proximity * 0.12 + (holding ? 0.15 : 0) + energy * 0.55);

  ringAura.material.opacity = Math.min(0.5, 0.02 + proximity * 0.12 + (isSnapped ? 0.04 : 0) + energy * 0.16);
  ringAura.scale.setScalar(1.0 + proximity * 0.2 + energy * 0.5);
  ringAura.quaternion.copy(camera.quaternion);

  chargeLight.position.copy(scratch.socketWorld);
  chargeLight.position.z += 0.5;
  chargeLight.intensity = 0.9 + proximity * 1.2 + energy * 3.4 + pulse * level * 0.8;
  chargeLight.distance = 9 + energy * 4;

  contactLight.position.copy(ring.position);
  contactLight.position.z += 0.25;
  contactLight.intensity =
    0.15 + proximity * 0.9 + (isSnapped ? 0.8 : 0) + (holding ? 1.2 : 0) + energy * 3.4;
  contactLight.distance = 5 + energy * 2.5;

  rimLight.intensity = 2.4 + energy * 1.4;

  bloomPass.strength = 0.4 + proximity * 0.06 + energy * 0.42;
  bloomPass.radius = 0.5 + energy * 0.12;
  bloomPass.threshold = 0.9 - energy * 0.06;

  lensPass.uniforms.uTime.value = time;
  lensPass.uniforms.uAberration.value =
    REDUCED_MOTION ? 0.0008 : 0.0012 + energy * 0.0034;

  ambient.style.opacity = (0.1 + proximity * 0.05 + energy * 0.2).toFixed(3);
  floorGlow.style.opacity = (0.1 + proximity * 0.05 + energy * 0.3).toFixed(3);
  floorGlow.style.width = `${360 + energy * 220}px`;

  // Controlled shake under load, never when the user asked for less motion.
  const shake = holding && !REDUCED_MOTION ? level * level : 0;
  battery.rotation.z = shake * Math.sin(time * 61) * 0.0035;
  battery.rotation.x = shake * Math.sin(time * 47 + 1.3) * 0.0025;

  // Emit particles in proportion to time, not frames.
  if (holding) {
    emitCarry += dt * (REDUCED_MOTION ? 14 : 34 + level * 70);
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

  if (completed && !revealShown && finishTime < FINISH_FLASH) {
    emitCarry += dt * 120;
    while (emitCarry >= 1) {
      emitStream(1);
      emitCarry -= 1;
    }
  }
}

/* ===================================== */
/* DUST                                  */
/* ===================================== */

function createDust() {
  const count = REDUCED_MOTION ? 16 : 48;

  for (let i = 0; i < count; i++) {
    const dot = document.createElement("span");
    dot.className = "dust-particle";

    const size = 1 + Math.random() * 2;

    dot.style.left = `${Math.random() * 100}%`;
    dot.style.top = `${Math.random() * 100}%`;
    dot.style.setProperty("--size", `${size}px`);
    dot.style.setProperty("--duration", `${5 + Math.random() * 8}s`);
    dot.style.setProperty("--dx", `${-35 + Math.random() * 70}px`);
    dot.style.setProperty("--dy", `${-50 + Math.random() * 100}px`);
    dot.style.animationDelay = `${Math.random() * 7}s`;

    dustContainer.appendChild(dot);
  }
}

createDust();

/* ===================================== */
/* OATH WORDS                            */
/* ===================================== */

// Split each oath line into word spans so they can fade in one at a time.
oathLines.forEach(line => {
  let index = 0;

  line.querySelectorAll("span, strong").forEach(part => {
    const words = part.textContent.trim().split(/\s+/);
    part.textContent = "";

    words.forEach((word, i) => {
      const el = document.createElement("span");
      el.className = "word";
      el.style.setProperty("--i", String(index++));
      el.textContent = word;
      part.appendChild(el);

      if (i < words.length - 1) part.appendChild(document.createTextNode(" "));
    });
  });
});

/* ===================================== */
/* FINISH                                */
/* ===================================== */

function startFinish() {
  completed = true;
  isHolding = false;
  pointerHold = false;
  keyboardHold = false;
  charge = 1;
  finishTime = 0;
  flashFired = false;
  revealShown = false;

  updateOath();
  updateProgressText();
  updateInstruction();
  announce("Charge complete");
  audio.finishStart(FINISH_FLASH);
}

function updateFinish(dt) {
  if (!completed) return;

  finishTime += dt;

  // Pull the ring into the lens as the charge peaks.
  scratch.target.copy(scratch.socketWorld);
  scratch.target.z += 0.1 - THREE.MathUtils.smoothstep(finishTime / FINISH_PEAK, 0, 1) * 0.08;
  ring.position.x = damp(ring.position.x, scratch.target.x, 10, dt);
  ring.position.y = damp(ring.position.y, scratch.target.y, 10, dt);
  ring.position.z = damp(ring.position.z, scratch.target.z, 10, dt);

  if (!REDUCED_MOTION) {
    ringSpin.rotation.y = Math.sin(finishTime * 46) * 0.03 * (1 - flashFired * 0.8);
  }

  if (!flashFired && finishTime >= FINISH_FLASH) {
    flashFired = true;
    flash.classList.add("fire");
    audio.finishBoom();

    shockwave.visible = true;
    shockwave.position.copy(scratch.socketWorld);
    shockwave.position.z += 0.12;
    shockwave.userData.t = 0;

    emitSparks(REDUCED_MOTION ? 40 : 170, 2.4);
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

  if (!revealShown && finishTime >= FINISH_REVEAL) {
    revealShown = true;
    audio.reveal();
    reveal.classList.add("visible");
    reveal.setAttribute("aria-hidden", "false");
    restart.focus({ preventScroll: true });
  }
}

/* ===================================== */
/* RESET                                 */
/* ===================================== */

function resetExperience() {
  audio.reset();
  wasCharging = false;
  completed = false;
  isHolding = false;
  pointerHold = false;
  keyboardHold = false;
  isSnapped = false;
  charge = 0;
  holdTime = 0;
  attractionLevel = 0;
  finishTime = 0;
  flashFired = false;
  revealShown = false;
  lastAnnounced = 0;
  lastProgress = -1;
  emitCarry = 0;
  sparkCarry = 0;

  reveal.classList.remove("visible");
  reveal.setAttribute("aria-hidden", "true");
  flash.classList.remove("fire");
  shockwave.visible = false;

  lineState.fill(false);
  oathLines.forEach(line => line.classList.remove("visible", "active"));

  clearParticles();

  smoothX = pointerX;
  smoothY = pointerY;
  screenToWorld(smoothX, smoothY, 2.0, scratch.target);
  ring.position.copy(scratch.target);
  ring.rotation.copy(IDLE_ROT);
  ringSpin.rotation.set(0, 0, 0);

  battery.rotation.set(0, 0, 0);
  camera.position.set(0, 0, cameraBaseZ());

  updateProgressText();
  updateInstruction();
}

restart.addEventListener("click", () => {
  audio.unlock();
  resetExperience();
  announce("Ready");
});

/* ===================================== */
/* SOUND TOGGLE                          */
/* ===================================== */

function syncSoundLabel() {
  let label = "Sound on";
  if (!audio.isUnlocked()) label = "Sound · click to start";
  else if (audio.isMuted()) label = "Sound off";

  soundToggle.textContent = label;
  soundToggle.setAttribute("aria-pressed", String(audio.isUnlocked() && !audio.isMuted()));
}

function toggleSound() {
  audio.setMuted(!audio.isMuted());
  syncSoundLabel();
}

soundToggle.addEventListener("click", () => {
  if (!audio.isUnlocked()) {
    audio.unlock();
    syncSoundLabel();
    return;
  }

  toggleSound();
});

syncSoundLabel();

/* ===================================== */
/* CAMERA                                */
/* ===================================== */

const cameraLook = new THREE.Vector3();

// Portrait screens need the camera further back so the battery's arms fit.
function cameraBaseZ() {
  return CAMERA_Z * Math.max(1, 0.62 / camera.aspect);
}

function updateCamera(time, dt) {
  const px = (pointerX / vw() - 0.5) * 2;
  const py = (pointerY / vh() - 0.5) * 2;

  const build = completed
    ? THREE.MathUtils.smoothstep(finishTime / FINISH_PEAK, 0, 1)
    : 0;

  // Slow dolly toward the lens as the charge builds, a big push at the finish.
  const zTarget = cameraBaseZ() - charge * 0.55 - attractionLevel * 0.1 - build * 0.6;

  let xTarget = 0;
  let yTarget = 0;

  if (!REDUCED_MOTION) {
    xTarget = px * 0.22 + Math.sin(time * 0.37) * 0.05;
    yTarget = -py * 0.14 + Math.cos(time * 0.29) * 0.04;
  }

  camera.position.x = damp(camera.position.x, xTarget, 2.2, dt);
  camera.position.y = damp(camera.position.y, yTarget, 2.2, dt);
  camera.position.z = damp(camera.position.z, zTarget, 1.4, dt);

  cameraLook.set(0, 0, 0);
  camera.lookAt(cameraLook);
  camera.updateMatrixWorld();
}

/* ===================================== */
/* LOOP                                  */
/* ===================================== */

let lastTime = performance.now();
let elapsed = 0;

function animate(now) {
  requestAnimationFrame(animate);

  const dt = THREE.MathUtils.clamp((now - lastTime) / 1000, 0, 0.1);
  lastTime = now;
  elapsed += dt;

  if (!ready) return;

  updateCamera(elapsed, dt);
  updateSocket();
  updateRing(elapsed, dt);
  updateCharge(dt);
  updateFinish(dt);
  updateEnergy(elapsed, dt);
  updateParticles(dt);
  updateBeam();
  updateOath();
  updateProgressText();
  updateInstruction();

  audio.update({
    attraction: attractionLevel,
    snapped: isSnapped,
    holding: isHolding,
    charge,
    completed
  });

  battery.position.y = BATTERY_Y + Math.sin(elapsed * 0.85) * 0.012;

  composer.render();
}

window.addEventListener("resize", resizeRenderer);

/* ===================================== */
/* START                                 */
/* ===================================== */

Promise.resolve()
  .then(buildAssets)
  .then(() => {
    ready = true;
    modelStatus.textContent = "";
    modelStatus.classList.add("ready");
    document.body.classList.add("is-ready");
    updateInstruction();
  })
  .catch(error => {
    console.error(error);
    modelStatus.textContent = "Could not build the scene. Serve the folder over http instead of opening the file directly.";
    modelStatus.classList.add("error");
  });

requestAnimationFrame(animate);
