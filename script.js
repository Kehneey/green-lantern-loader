import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const stage = document.getElementById("threeStage");
const instruction = document.getElementById("instruction");
const progressText = document.getElementById("progressText");
const ambient = document.getElementById("ambient");
const floorGlow = document.getElementById("floorGlow");
const particlesContainer = document.getElementById("particles");
const dustContainer = document.getElementById("dust");
const beam = document.getElementById("beam");
const beamBlur = document.getElementById("beamBlur");
const flash = document.getElementById("flash");
const reveal = document.getElementById("reveal");
const restart = document.getElementById("restart");
const modelStatus = document.getElementById("modelStatus");
const oathLines = [...document.querySelectorAll(".oath-line")];

const CHARGE_SPEED = 0.34;
const DRAIN_SPEED = 0.07;
const ATTRACTION_RADIUS = 260;
const SNAP_RADIUS = 92;

let battery;
let batteryLens;
let batteryLensHalo;
let batteryInner;
let batteryBody;
let batteryAccentMeshes = [];

let ring;
let ringFace;
let ringFaceHalo;
let ringBand;

let mouseX = window.innerWidth * 0.2;
let mouseY = window.innerHeight * 0.58;
let smoothX = mouseX;
let smoothY = mouseY;

let isNearBattery = false;
let isSnapped = false;
let isHolding = false;
let completed = false;
let charge = 0;
let attractionLevel = 0;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x020604, 0.022);

const camera = new THREE.PerspectiveCamera(
  32,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 0.0, 10.6);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;

stage.appendChild(renderer.domElement);

/* ===================================== */
/* POST PROCESSING                       */
/* ===================================== */

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.58,
  0.42,
  0.84
);
composer.addPass(bloomPass);

/* ===================================== */
/* LIGHTING                              */
/* ===================================== */

scene.add(new THREE.AmbientLight(0x7fa88d, 0.74));

const keyLight = new THREE.DirectionalLight(0xe2f9ea, 2.15);
keyLight.position.set(4.2, 5.2, 6.6);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x254c34, 1.1);
fillLight.position.set(-4, 1.2, 4.2);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0x00ff66, 1.3);
rimLight.position.set(-2.2, 3.2, -4.2);
scene.add(rimLight);

const chargeLight = new THREE.PointLight(0x67ff9e, 1.4, 9, 2);
scene.add(chargeLight);

const contactLight = new THREE.PointLight(0xe2ffe9, 0, 6, 2);
scene.add(contactLight);

/* ===================================== */
/* MATERIAL HELPERS                      */
/* ===================================== */

function physicalMaterial({
  color,
  emissive = 0x000000,
  emissiveIntensity = 0,
  metalness = 0.3,
  roughness = 0.35,
  transparent = false,
  opacity = 1
}) {
  return new THREE.MeshPhysicalMaterial({
    color,
    emissive,
    emissiveIntensity,
    metalness,
    roughness,
    clearcoat: 0.45,
    clearcoatRoughness: 0.18,
    transparent,
    opacity,
    side: THREE.FrontSide
  });
}

function glowMaterial(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
    side: THREE.FrontSide
  });
}

/* ===================================== */
/* BATTERY                               */
/* ===================================== */

function createBattery() {
  const group = new THREE.Group();

  const shell = physicalMaterial({
    color: 0x0d2a1a,
    emissive: 0x03120b,
    emissiveIntensity: 0.12,
    metalness: 0.64,
    roughness: 0.24
  });

  const trim = physicalMaterial({
    color: 0x1b5f38,
    emissive: 0x072516,
    emissiveIntensity: 0.18,
    metalness: 0.72,
    roughness: 0.2
  });

  const darkMetal = physicalMaterial({
    color: 0x07130d,
    emissive: 0x010604,
    emissiveIntensity: 0.03,
    metalness: 0.84,
    roughness: 0.28
  });

  batteryAccentMeshes = [];

  const bodyProfile = [
    new THREE.Vector2(0.74, -1.18),
    new THREE.Vector2(0.9, -1.06),
    new THREE.Vector2(1.02, -0.74),
    new THREE.Vector2(1.08, -0.28),
    new THREE.Vector2(1.08, 0.28),
    new THREE.Vector2(1.0, 0.76),
    new THREE.Vector2(0.88, 1.04),
    new THREE.Vector2(0.72, 1.18)
  ];

  const bodyGeo = new THREE.LatheGeometry(bodyProfile, 72);
  bodyGeo.rotateX(Math.PI / 2);

  batteryBody = new THREE.Mesh(bodyGeo, shell);
  group.add(batteryBody);

  const upperShoulder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.72, 0.88, 0.26, 48),
    trim
  );
  upperShoulder.position.y = 1.24;
  group.add(upperShoulder);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.54, 0.54, 0.56, 48),
    darkMetal
  );
  neck.position.y = 1.62;
  group.add(neck);

  const upperCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.82, 0.7, 0.2, 48),
    trim
  );
  upperCap.position.y = 2.0;
  group.add(upperCap);

  const lowerShoulder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.78, 0.92, 0.24, 48),
    trim
  );
  lowerShoulder.position.y = -1.24;
  group.add(lowerShoulder);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.76, 0.94, 0.48, 48),
    darkMetal
  );
  base.position.y = -1.54;
  group.add(base);

  const baseTrim = new THREE.Mesh(
    new THREE.CylinderGeometry(0.98, 0.98, 0.1, 48),
    trim
  );
  baseTrim.position.y = -1.84;
  group.add(baseTrim);

  const handleMat = physicalMaterial({
    color: 0x0a2115,
    emissive: 0x020c07,
    emissiveIntensity: 0.06,
    metalness: 0.8,
    roughness: 0.24
  });

  const handleCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.66, 2.02, 0),
    new THREE.Vector3(-0.66, 2.48, 0),
    new THREE.Vector3(0, 2.72, 0),
    new THREE.Vector3(0.66, 2.48, 0),
    new THREE.Vector3(0.66, 2.02, 0)
  ]);

  const handle = new THREE.Mesh(
    new THREE.TubeGeometry(handleCurve, 64, 0.07, 16, false),
    handleMat
  );
  group.add(handle);

  for (const side of [-1, 1]) {
    const housing = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.16, 0.28, 10, 20),
      trim
    );
    housing.rotation.z = Math.PI / 2;
    housing.position.set(side * 1.18, 0, 0.02);
    group.add(housing);

    const energyPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(0.2, 0.42),
      glowMaterial(0x7effa8, 0.72)
    );
    energyPanel.position.set(side * 1.18, 0, 0.25);
    group.add(energyPanel);

    batteryAccentMeshes.push(energyPanel);
  }

  const lensHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.6, 0.6, 0.15, 72),
    darkMetal
  );
  lensHousing.rotation.x = Math.PI / 2;
  lensHousing.position.z = 1.1;
  group.add(lensHousing);

  const lensBezel = new THREE.Mesh(
    new THREE.RingGeometry(0.39, 0.53, 96),
    new THREE.MeshStandardMaterial({
      color: 0x2a7b48,
      emissive: 0x09361e,
      emissiveIntensity: 0.2,
      metalness: 0.52,
      roughness: 0.16,
      side: THREE.DoubleSide
    })
  );
  lensBezel.position.z = 1.18;
  group.add(lensBezel);

  batteryLens = new THREE.Mesh(
    new THREE.CircleGeometry(0.36, 96),
    glowMaterial(0xb7ffcb, 0.78)
  );
  batteryLens.position.z = 1.19;
  group.add(batteryLens);

  batteryLensHalo = new THREE.Mesh(
    new THREE.RingGeometry(0.37, 0.5, 96),
    glowMaterial(0x18ff67, 0.09)
  );
  batteryLensHalo.position.z = 1.185;
  group.add(batteryLensHalo);

  batteryInner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.38, 0.38, 0.16, 72),
    physicalMaterial({
      color: 0x12c857,
      emissive: 0x00ff66,
      emissiveIntensity: 0.32,
      metalness: 0,
      roughness: 0.26,
      transparent: true,
      opacity: 0.05
    })
  );
  batteryInner.rotation.x = Math.PI / 2;
  batteryInner.position.z = 1.04;
  group.add(batteryInner);

  group.position.set(0, -0.28, 0);
  group.scale.setScalar(0.68);

  scene.add(group);
  return group;
}

/* ===================================== */
/* RING                                  */
/* ===================================== */

function createRing() {
  const group = new THREE.Group();

  const bandMaterial = physicalMaterial({
    color: 0x0d1f15,
    emissive: 0x020705,
    emissiveIntensity: 0.04,
    metalness: 0.92,
    roughness: 0.14
  });

  const crownMaterial = physicalMaterial({
    color: 0x1a5a33,
    emissive: 0x072315,
    emissiveIntensity: 0.12,
    metalness: 0.74,
    roughness: 0.15
  });

  ringBand = new THREE.Mesh(
    new THREE.TorusGeometry(0.29, 0.032, 32, 128),
    bandMaterial
  );
  group.add(ringBand);

  const leftShoulder = new THREE.Mesh(
    new THREE.BoxGeometry(0.11, 0.08, 0.08),
    crownMaterial
  );
  leftShoulder.position.set(-0.135, 0, 0.05);
  leftShoulder.rotation.z = THREE.MathUtils.degToRad(20);

  const rightShoulder = leftShoulder.clone();
  rightShoulder.position.x = 0.135;
  rightShoulder.rotation.z = THREE.MathUtils.degToRad(-20);

  group.add(leftShoulder, rightShoulder);

  const crown = new THREE.Mesh(
    new THREE.CylinderGeometry(0.11, 0.135, 0.06, 64),
    crownMaterial
  );
  crown.rotation.x = Math.PI / 2;
  crown.position.z = 0.07;
  group.add(crown);

  const bezel = new THREE.Mesh(
    new THREE.RingGeometry(0.075, 0.105, 64),
    new THREE.MeshStandardMaterial({
      color: 0x33aa5d,
      emissive: 0x092e19,
      emissiveIntensity: 0.12,
      metalness: 0.58,
      roughness: 0.14,
      side: THREE.DoubleSide
    })
  );
  bezel.position.z = 0.112;
  group.add(bezel);

  ringFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.07, 72),
    glowMaterial(0x9fffc0, 0.76)
  );
  ringFace.position.z = 0.118;
  group.add(ringFace);

  ringFaceHalo = new THREE.Mesh(
    new THREE.RingGeometry(0.072, 0.1, 72),
    glowMaterial(0x16ff66, 0.05)
  );
  ringFaceHalo.position.z = 0.115;
  group.add(ringFaceHalo);

  const emblemMaterial = new THREE.MeshBasicMaterial({
    color: 0x06190c,
    toneMapped: false,
    side: THREE.DoubleSide
  });

  const emblemCircle = new THREE.Mesh(
    new THREE.RingGeometry(0.02, 0.032, 48),
    emblemMaterial
  );
  emblemCircle.position.z = 0.122;

  const topLine = new THREE.Mesh(
    new THREE.PlaneGeometry(0.06, 0.008),
    emblemMaterial
  );
  topLine.position.set(0, 0.036, 0.124);

  const bottomLine = topLine.clone();
  bottomLine.position.y = -0.036;

  group.add(emblemCircle, topLine, bottomLine);

  group.scale.setScalar(0.62);
  group.rotation.set(
    THREE.MathUtils.degToRad(22),
    THREE.MathUtils.degToRad(-34),
    THREE.MathUtils.degToRad(-10)
  );

  scene.add(group);
  return group;
}

/* ===================================== */
/* INIT                                  */
/* ===================================== */

battery = createBattery();
ring = createRing();

if (modelStatus) {
  modelStatus.textContent = "Models ready";
  modelStatus.classList.add("ready");
}

/* ===================================== */
/* POINTER EVENTS                        */
/* ===================================== */

window.addEventListener("mousemove", event => {
  mouseX = event.clientX;
  mouseY = event.clientY;
});

window.addEventListener("mousedown", () => {
  if (isSnapped && !completed) {
    isHolding = true;
    instruction.textContent = "Hold the ring steady";
  }
});

window.addEventListener("mouseup", () => {
  isHolding = false;

  if (!completed) {
    instruction.textContent = isSnapped
      ? "Press and hold to charge"
      : "Bring the ring to the battery";
  }
});

window.addEventListener("mouseleave", () => {
  isHolding = false;
});

/* ===================================== */
/* WORLD / SCREEN                        */
/* ===================================== */

function screenToWorld(x, y, zPlane = 1.95) {
  const ndc = new THREE.Vector3(
    (x / window.innerWidth) * 2 - 1,
    -(y / window.innerHeight) * 2 + 1,
    0.5
  );

  ndc.unproject(camera);

  const direction = ndc.sub(camera.position).normalize();
  const distance = (zPlane - camera.position.z) / direction.z;

  return camera.position.clone().add(direction.multiplyScalar(distance));
}

function worldToScreen(position) {
  const projected = position.clone().project(camera);

  return {
    x: ((projected.x + 1) / 2) * window.innerWidth,
    y: ((1 - projected.y) / 2) * window.innerHeight
  };
}

function getChargeSocketWorld() {
  return battery.localToWorld(new THREE.Vector3(0, 0, 1.2));
}

/* ===================================== */
/* RING MOVEMENT                         */
/* ===================================== */

function updateRing(time) {
  if (completed) return;

  smoothX += (mouseX - smoothX) * 0.16;
  smoothY += (mouseY - smoothY) * 0.16;

  const socketWorld = getChargeSocketWorld();
  const socketScreen = worldToScreen(socketWorld);

  const dx = smoothX - socketScreen.x;
  const dy = smoothY - socketScreen.y;
  const distance = Math.hypot(dx, dy);

  isNearBattery = distance < ATTRACTION_RADIUS;
  isSnapped = distance < SNAP_RADIUS;

  let attraction = THREE.MathUtils.clamp(
    1 - distance / ATTRACTION_RADIUS,
    0,
    1
  );

  attraction = attraction * attraction * (3 - 2 * attraction);
  attractionLevel = attraction;

  if (isSnapped) {
    attraction = 0.99;
  }

  const visualX = THREE.MathUtils.lerp(smoothX, socketScreen.x, attraction);
  const visualY = THREE.MathUtils.lerp(smoothY, socketScreen.y, attraction);

  let target = screenToWorld(visualX, visualY, 2.0);

  if (isSnapped) {
    target = socketWorld.clone().add(new THREE.Vector3(0, 0, 0.08));
  }

  ring.position.lerp(target, isSnapped ? 0.26 : 0.23);

  const targetX = isSnapped
    ? THREE.MathUtils.degToRad(14)
    : THREE.MathUtils.degToRad(22);

  const targetY = isSnapped
    ? THREE.MathUtils.degToRad(-18)
    : THREE.MathUtils.degToRad(-34);

  const targetZ = isSnapped
    ? THREE.MathUtils.degToRad(-6)
    : THREE.MathUtils.degToRad(-10) + Math.sin(time * 2.1) * 0.014;

  ring.rotation.x = THREE.MathUtils.lerp(ring.rotation.x, targetX, 0.08);
  ring.rotation.y = THREE.MathUtils.lerp(ring.rotation.y, targetY, 0.08);
  ring.rotation.z = THREE.MathUtils.lerp(ring.rotation.z, targetZ, 0.08);

  const snapPulse = isSnapped ? 1 + Math.sin(time * 7) * 0.006 : 1;
  ring.scale.setScalar(0.62 * snapPulse);

  if (charge <= 0) {
    instruction.textContent = isSnapped
      ? "Press and hold to charge"
      : isNearBattery
        ? "Energy lock acquired"
        : "Bring the ring to the battery";
  }
}

/* ===================================== */
/* BEAM                                  */
/* ===================================== */

function updateBeam() {
  const socket = worldToScreen(getChargeSocketWorld());
  const ringScreen = worldToScreen(ring.position);

  [beam, beamBlur].forEach(line => {
    line.setAttribute("x1", ringScreen.x);
    line.setAttribute("y1", ringScreen.y);
    line.setAttribute("x2", socket.x);
    line.setAttribute("y2", socket.y);
  });

  let strength = attractionLevel * 0.32;

  if (isSnapped) strength = 0.46;
  if (isHolding) strength = 0.68;

  beam.classList.toggle("visible", strength > 0.04);
  beamBlur.classList.toggle("visible", strength > 0.04);

  beam.style.opacity = String(strength);
  beamBlur.style.opacity = String(strength * 0.58);
}

/* ===================================== */
/* CHARGE                                */
/* ===================================== */

function updateCharge() {
  if (completed) return;

  if (isHolding && isSnapped) {
    charge += CHARGE_SPEED;

    if (Math.random() > 0.5) createParticle();
    if (Math.random() > 0.8) createSocketSpark();
  } else {
    charge -= DRAIN_SPEED;
  }

  charge = THREE.MathUtils.clamp(charge, 0, 100);
  progressText.textContent = `${Math.round(charge)}%`;

  updateEnergyVisuals();

  if (charge >= 100) {
    finishCharge();
  }
}

/* ===================================== */
/* ENERGY                                */
/* ===================================== */

function updateEnergyVisuals() {
  const chargeLevel = charge / 100;
  const proximity = attractionLevel;

  batteryLens.material.opacity = 0.78 + chargeLevel * 0.12;
  batteryLensHalo.material.opacity =
    0.09 + proximity * 0.14 + chargeLevel * 0.22;

  batteryLens.scale.setScalar(
    1 + proximity * 0.04 + chargeLevel * 0.08
  );

  batteryLensHalo.scale.setScalar(
    1 + proximity * 0.06 + chargeLevel * 0.12
  );

  batteryInner.material.emissiveIntensity =
    0.32 + proximity * 0.34 + chargeLevel * 1.3;
  batteryInner.material.opacity =
    0.05 + proximity * 0.03 + chargeLevel * 0.09;

  batteryBody.material.emissiveIntensity =
    0.12 + proximity * 0.08 + chargeLevel * 0.24;

  for (const mesh of batteryAccentMeshes) {
    if (mesh.material.opacity !== undefined) {
      mesh.material.opacity = Math.min(
        0.9,
        0.28 + proximity * 0.12 + chargeLevel * 0.18
      );
    }
  }

  ringFace.material.opacity =
    0.76 + proximity * 0.06 + chargeLevel * 0.06;
  ringFaceHalo.material.opacity =
    0.05 + proximity * 0.08 + chargeLevel * 0.12;

  ringFace.scale.setScalar(
    1 + proximity * 0.025 + chargeLevel * 0.05
  );

  ringFaceHalo.scale.setScalar(
    1 + proximity * 0.04 + chargeLevel * 0.08
  );

  ringBand.material.emissiveIntensity =
    0.05 + proximity * 0.08 + chargeLevel * 0.18;

  const socket = getChargeSocketWorld();

  chargeLight.position.copy(socket);
  chargeLight.intensity =
    1.4 + proximity * 1.9 + chargeLevel * 4.8;
  chargeLight.distance =
    9 + proximity * 1.6 + chargeLevel * 3;

  contactLight.position.copy(socket.clone().add(new THREE.Vector3(0, 0, 0.28)));
  contactLight.intensity =
    0.3 + proximity * 1.2 + (isSnapped ? 1.2 : 0) + (isHolding ? 2.2 : 0) + chargeLevel * 3.2;
  contactLight.distance =
    6 + proximity * 1 + chargeLevel * 2.1;

  bloomPass.strength =
    0.58 + proximity * 0.1 + chargeLevel * 0.32;
  bloomPass.radius =
    0.42 + chargeLevel * 0.04;
  bloomPass.threshold =
    0.84 - chargeLevel * 0.03;

  ambient.style.opacity = String(
    0.1 + proximity * 0.05 + chargeLevel * 0.16
  );

  floorGlow.style.opacity = String(
    0.1 + proximity * 0.05 + chargeLevel * 0.22
  );

  floorGlow.style.width = `${360 + chargeLevel * 180}px`;

  if (isHolding) {
    battery.rotation.z =
      (Math.random() - 0.5) * chargeLevel * 0.0018;
  } else {
    battery.rotation.z *= 0.84;
  }

  const thresholds = [10, 32, 56, 78];

  oathLines.forEach((line, index) => {
    const visible = charge >= thresholds[index];
    const nextThreshold = thresholds[index + 1] ?? 101;
    const active = visible && charge < nextThreshold;

    line.classList.toggle("visible", visible);
    line.classList.toggle("active", active);
  });
}

/* ===================================== */
/* PARTICLES                             */
/* ===================================== */

function createParticle() {
  const ringPos = worldToScreen(ring.position);
  const socketPos = worldToScreen(getChargeSocketWorld());

  const particle = document.createElement("span");
  particle.className = "particle";

  const startX = ringPos.x + (Math.random() - 0.5) * 12;
  const startY = ringPos.y + (Math.random() - 0.5) * 12;

  particle.style.left = `${startX}px`;
  particle.style.top = `${startY}px`;

  particle.style.setProperty(
    "--moveX",
    `${socketPos.x - startX + (Math.random() - 0.5) * 14}px`
  );

  particle.style.setProperty(
    "--moveY",
    `${socketPos.y - startY + (Math.random() - 0.5) * 14}px`
  );

  particle.style.setProperty(
    "--duration",
    `${0.34 + Math.random() * 0.3}s`
  );

  particlesContainer.appendChild(particle);

  setTimeout(() => particle.remove(), 850);
}

function createSocketSpark() {
  const socket = worldToScreen(getChargeSocketWorld());

  const particle = document.createElement("span");
  particle.className = "particle";

  particle.style.left = `${socket.x + (Math.random() - 0.5) * 8}px`;
  particle.style.top = `${socket.y + (Math.random() - 0.5) * 8}px`;

  particle.style.setProperty(
    "--moveX",
    `${(Math.random() - 0.5) * 28}px`
  );

  particle.style.setProperty(
    "--moveY",
    `${(Math.random() - 0.5) * 28}px`
  );

  particle.style.setProperty(
    "--duration",
    `${0.18 + Math.random() * 0.18}s`
  );

  particlesContainer.appendChild(particle);

  setTimeout(() => particle.remove(), 450);
}

/* ===================================== */
/* DUST                                  */
/* ===================================== */

function createDust() {
  for (let i = 0; i < 48; i++) {
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
/* COMPLETE                              */
/* ===================================== */

function finishCharge() {
  completed = true;
  isHolding = false;
  charge = 100;

  progressText.textContent = "100%";
  instruction.textContent = "Charge complete";

  beam.classList.remove("visible");
  beamBlur.classList.remove("visible");

  batteryLens.scale.setScalar(1.14);
  batteryLensHalo.scale.setScalar(1.24);

  batteryInner.material.emissiveIntensity = 1.4;
  batteryBody.material.emissiveIntensity = 0.42;

  ringFace.scale.setScalar(1.08);
  ringFaceHalo.scale.setScalar(1.13);

  chargeLight.intensity = 6.6;
  chargeLight.distance = 14;
  contactLight.intensity = 5.2;
  contactLight.distance = 10;

  bloomPass.strength = 0.94;
  bloomPass.radius = 0.48;
  bloomPass.threshold = 0.8;

  setTimeout(() => {
    flash.classList.add("fire");
  }, 350);

  setTimeout(() => {
    reveal.classList.add("visible");
  }, 1050);
}

/* ===================================== */
/* RESET                                 */
/* ===================================== */

restart.addEventListener("click", () => {
  completed = false;
  isHolding = false;
  isSnapped = false;
  isNearBattery = false;
  attractionLevel = 0;
  charge = 0;

  reveal.classList.remove("visible");
  flash.classList.remove("fire");

  oathLines.forEach(line => {
    line.classList.remove("visible", "active");
  });

  batteryLens.scale.setScalar(1);
  batteryLensHalo.scale.setScalar(1);
  ringFace.scale.setScalar(1);
  ringFaceHalo.scale.setScalar(1);

  batteryInner.material.emissiveIntensity = 0.32;
  batteryInner.material.opacity = 0.05;
  batteryBody.material.emissiveIntensity = 0.12;

  ringBand.material.emissiveIntensity = 0.04;

  bloomPass.strength = 0.58;
  bloomPass.radius = 0.42;
  bloomPass.threshold = 0.84;

  chargeLight.intensity = 1.4;
  chargeLight.distance = 9;
  contactLight.intensity = 0;
  contactLight.distance = 6;

  instruction.textContent = "Bring the ring to the battery";
});

/* ===================================== */
/* RESIZE                                */
/* ===================================== */

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
});

/* ===================================== */
/* ANIMATE                               */
/* ===================================== */

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const time = clock.getElapsedTime();

  updateRing(time);
  updateBeam();
  updateCharge();

  const chargeLevel = charge / 100;
  const targetZ = 10.6 - chargeLevel * 0.22 - attractionLevel * 0.05;
  camera.position.z = THREE.MathUtils.lerp(camera.position.z, targetZ, 0.03);

  battery.position.y =
    -0.28 + Math.sin(time * 0.85) * 0.006;

  const idlePulse = 1 + Math.sin(time * 2.2) * 0.008;

  if (!isHolding && charge < 2) {
    batteryLens.scale.setScalar(idlePulse);
    ringFace.scale.setScalar(
      1 + Math.sin(time * 2.7) * 0.004
    );
  }

  composer.render();
}

animate();
