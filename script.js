import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";

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
const RING_DIAMETER = 0.78;

/* ===================================== */
/* STATE                                 */
/* ===================================== */

let battery;          // group: model + glow overlays
let batteryMesh;
let ring;             // group that follows the pointer
let ringSpin;         // inner group that spins around the emblem axis
let ringMesh;
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

function metalMaterial({ color, emissive, roughness, metalness, clearcoat = 0.6 }) {
  return new THREE.MeshPhysicalMaterial({
    color,
    emissive,
    emissiveIntensity: 0,
    metalness,
    roughness,
    clearcoat,
    clearcoatRoughness: 0.22,
    envMapIntensity: 1.0
  });
}

// The GLBs are raw STL conversions: no normals, no materials, arbitrary units.
// Give them crease-aware smooth normals, centre them and scale them to size.
async function loadModel(url, material, onProgress) {
  const gltf = await new GLTFLoader().loadAsync(url, event => {
    if (event.lengthComputable) onProgress(event.loaded / event.total);
  });

  let mesh = null;
  gltf.scene.traverse(node => {
    if (node.isMesh && !mesh) mesh = node;
  });

  if (!mesh) throw new Error(`No mesh found in ${url}`);

  const geometry = toCreasedNormals(mesh.geometry, THREE.MathUtils.degToRad(38));
  geometry.computeBoundingBox();

  const box = geometry.boundingBox;
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  geometry.translate(-center.x, -center.y, -center.z);
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();

  const model = new THREE.Mesh(geometry, material);
  mesh.geometry.dispose();

  return { model, size };
}

async function loadAssets() {
  const progress = [0, 0];
  const report = () => {
    const percent = Math.round(((progress[0] + progress[1]) / 2) * 100);
    modelStatus.textContent = `Forging the ring… ${percent}%`;
  };

  const batteryMaterial = metalMaterial({
    color: 0x1c6a3c,
    emissive: 0x00ff66,
    roughness: 0.3,
    metalness: 0.88
  });

  const ringMaterial = metalMaterial({
    color: 0x1f6a3e,
    emissive: 0x00ff66,
    roughness: 0.22,
    metalness: 0.94,
    clearcoat: 0.8
  });

  const [batteryAsset, ringAsset] = await Promise.all([
    loadModel("assets/green_lantern.glb", batteryMaterial, value => {
      progress[0] = value;
      report();
    }),
    loadModel("assets/green-lantern-ring.glb", ringMaterial, value => {
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

  // The lens (the emblem face) points down +Z in the model.
  const frontZ = (batteryAsset.size.z / 2) * batteryScale;
  battery.userData.socket = new THREE.Vector3(0, 0, frontZ);

  lensGlow = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    additive(glowTexture, 0x9dffc0, 0.0)
  );
  lensGlow.position.copy(battery.userData.socket).add(new THREE.Vector3(0, 0, 0.05));
  battery.add(lensGlow);

  lensHalo = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    additive(glowTexture, 0x20ff74, 0.0)
  );
  lensHalo.position.copy(battery.userData.socket).add(new THREE.Vector3(0, 0, 0.03));
  battery.add(lensHalo);

  flare = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    additive(flareTexture, 0xb8ffd0, 0.0)
  );
  flare.position.copy(battery.userData.socket).add(new THREE.Vector3(0, 0, 0.08));
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
  ringSpin = new THREE.Group();
  ringMesh = ringAsset.model;

  const ringScale = RING_DIAMETER / Math.max(ringAsset.size.x, ringAsset.size.z);
  ringMesh.scale.setScalar(ringScale);
  ringSpin.add(ringMesh);
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

  // While charging the ring slowly spins about its own emblem axis.
  const spinTarget = isHolding && isSnapped ? 0.35 + charge * 4.2 : 0.18;
  ringSpin.userData.spinSpeed = damp(ringSpin.userData.spinSpeed ?? 0.18, spinTarget, 2.2, dt);
  ringSpin.rotation.z += ringSpin.userData.spinSpeed * dt;
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

  const lensSize = 0.55 + proximity * 0.06 + energy * 0.32;
  lensGlow.scale.setScalar(lensSize);
  lensGlow.material.opacity = Math.min(
    0.85,
    (0.08 + proximity * 0.12 + energy * (0.38 + pulse * 0.14) + flicker) *
      (isSnapped && !completed ? 0.7 : 1)
  );

  const haloSize = 1.3 + proximity * 0.3 + energy * 1.1;
  lensHalo.scale.setScalar(haloSize);
  lensHalo.material.opacity = Math.min(0.7, 0.08 + proximity * 0.14 + energy * 0.3);

  flare.scale.set(1.4 + energy * 4.6, 0.08 + energy * 0.16, 1);
  flare.material.opacity = Math.min(1, Math.max(0, energy - 0.12) * 0.9 + (completed ? 0.1 : 0));

  batteryMesh.material.emissiveIntensity =
    0.02 + proximity * 0.04 + energy * (0.1 + pulse * 0.04);

  ringMesh.material.emissiveIntensity =
    0.03 + proximity * 0.1 + (holding ? 0.18 : 0) + energy * 0.5;

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

  ringSpin.userData.spinSpeed = damp(ringSpin.userData.spinSpeed ?? 1, 7, 1.6, dt);
  ringSpin.rotation.z += ringSpin.userData.spinSpeed * dt;

  if (!flashFired && finishTime >= FINISH_FLASH) {
    flashFired = true;
    flash.classList.add("fire");

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
    reveal.classList.add("visible");
    reveal.setAttribute("aria-hidden", "false");
    restart.focus({ preventScroll: true });
  }
}

/* ===================================== */
/* RESET                                 */
/* ===================================== */

function resetExperience() {
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
  ringSpin.rotation.z = 0;
  ringSpin.userData.spinSpeed = 0.18;

  battery.rotation.set(0, 0, 0);
  camera.position.set(0, 0, cameraBaseZ());

  updateProgressText();
  updateInstruction();
}

restart.addEventListener("click", () => {
  resetExperience();
  announce("Ready");
});

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

  battery.position.y = BATTERY_Y + Math.sin(elapsed * 0.85) * 0.012;

  composer.render();
}

window.addEventListener("resize", resizeRenderer);

/* ===================================== */
/* START                                 */
/* ===================================== */

loadAssets()
  .then(() => {
    ready = true;
    modelStatus.textContent = "";
    modelStatus.classList.add("ready");
    document.body.classList.add("is-ready");
    updateInstruction();
  })
  .catch(error => {
    console.error(error);
    modelStatus.textContent =
      "Could not load the models. Serve the folder over http instead of opening the file directly.";
    modelStatus.classList.add("error");
  });

requestAnimationFrame(animate);
