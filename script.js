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
let ringAccentMeshes = [];

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

const camera = new THREE.PerspectiveCamera(
  32,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 0.05, 9.5);

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
  0.78,
  0.42,
  0.74
);
composer.addPass(bloomPass);

/* ===================================== */
/* LIGHTING                              */
/* ===================================== */

scene.add(new THREE.AmbientLight(0x7fa88d, 0.78));

const keyLight = new THREE.DirectionalLight(0xdaf4e1, 2.2);
keyLight.position.set(4.2, 5.2, 6.6);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x2d5a3d, 1.2);
fillLight.position.set(-4, 1.2, 4.2);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0x00ff66, 1.6);
rimLight.position.set(-2.2, 3.2, -4.2);
scene.add(rimLight);

const chargeLight = new THREE.PointLight(0x3bff82, 1.2, 9, 2);
scene.add(chargeLight);

const contactLight = new THREE.PointLight(0xcfffe0, 0, 5, 2);
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
    clearcoatRoughness: 0.22,
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
    color: 0x0f2d1d,
    emissive: 0x04160d,
    emissiveIntensity: 0.18,
    metalness: 0.58,
    roughness: 0.3
  });

  const trim = physicalMaterial({
    color: 0x1f5b39,
    emissive: 0x082b18,
    emissiveIntensity: 0.24,
    metalness: 0.68,
    roughness: 0.24
  });

  const darkMetal = physicalMaterial({
    color: 0x07150e,
    emissive: 0x020805,
    emissiveIntensity: 0.08,
    metalness: 0.72,
    roughness: 0.32
  });

  const luminous = physicalMaterial({
    color: 0x19c95a,
    emissive: 0x00ff66,
    emissiveIntensity: 0.72,
    metalness: 0.08,
    roughness: 0.24,
    transparent: true,
    opacity: 0.32
  });

  /* faceted main housing: deliberately not spherical */
  batteryBody = new THREE.Mesh(
    new THREE.CylinderGeometry(1.04, 1.04, 1.92, 12, 1, false),
    shell
  );
  batteryBody.rotation.x = Math.PI / 2;
  group.add(batteryBody);

  /* front and rear collars */
  const frontCollar = new THREE.Mesh(
    new THREE.CylinderGeometry(1.09, 1.09, 0.16, 12),
    trim
  );
  frontCollar.rotation.x = Math.PI / 2;
  frontCollar.position.z = 0.97;
  group.add(frontCollar);

  const rearCollar = frontCollar.clone();
  rearCollar.position.z = -0.97;
  group.add(rearCollar);

  /* shoulders and neck */
  const shoulder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.7, 0.98, 0.36, 12),
    shell
  );
  shoulder.position.y = 1.08;
  group.add(shoulder);

  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.58, 0.58, 0.58, 12),
    darkMetal
  );
  neck.position.y = 1.53;
  group.add(neck);

  const upperCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.86, 0.7, 0.26, 12),
    trim
  );
  upperCap.position.y = 1.94;
  group.add(upperCap);

  /* base */
  const lowerShoulder = new THREE.Mesh(
    new THREE.CylinderGeometry(0.82, 0.98, 0.3, 12),
    shell
  );
  lowerShoulder.position.y = -1.12;
  group.add(lowerShoulder);

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.76, 0.98, 0.54, 12),
    darkMetal
  );
  base.position.y = -1.5;
  group.add(base);

  const baseTrim = new THREE.Mesh(
    new THREE.CylinderGeometry(1.0, 1.0, 0.12, 12),
    trim
  );
  baseTrim.position.y = -1.84;
  group.add(baseTrim);

  /* hard rectangular handle */
  const handleMat = physicalMaterial({
    color: 0x0c2417,
    emissive: 0x031008,
    emissiveIntensity: 0.12,
    metalness: 0.7,
    roughness: 0.28
  });

  const topBar = new THREE.Mesh(
    new THREE.BoxGeometry(1.55, 0.16, 0.2),
    handleMat
  );
  topBar.position.y = 2.58;

  const leftBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.16, 1.15, 0.2),
    handleMat
  );
  leftBar.position.set(-0.7, 2.08, 0);

  const rightBar = leftBar.clone();
  rightBar.position.x = 0.7;

  group.add(topBar, leftBar, rightBar);

  /* angular side energy housings */
  for (const side of [-1, 1]) {
    const housing = new THREE.Mesh(
      new THREE.BoxGeometry(0.5, 0.72, 0.58),
      trim
    );
    housing.position.set(side * 1.24, 0, 0.03);
    housing.rotation.z = side * THREE.MathUtils.degToRad(-8);
    group.add(housing);

    const energyPanel = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.56, 0.08),
      luminous.clone()
    );
    energyPanel.position.set(side * 1.24, 0, 0.36);
    energyPanel.rotation.z = side * THREE.MathUtils.degToRad(-8);
    group.add(energyPanel);
    batteryAccentMeshes.push(energyPanel);
  }

  /* front lens assembly */
  const lensHousing = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.62, 0.16, 48),
    darkMetal
  );
  lensHousing.rotation.x = Math.PI / 2;
  lensHousing.position.z = 1.03;
  group.add(lensHousing);

  const lensBezel = new THREE.Mesh(
    new THREE.RingGeometry(0.42, 0.56, 64),
    new THREE.MeshStandardMaterial({
      color: 0x2d7c4a,
      emissive: 0x0a4723,
      emissiveIntensity: 0.34,
      metalness: 0.48,
      roughness: 0.24,
      side: THREE.DoubleSide
    })
  );
  lensBezel.position.z = 1.125;
  group.add(lensBezel);

  batteryLens = new THREE.Mesh(
    new THREE.CircleGeometry(0.4, 64),
    glowMaterial(0x56ff91, 0.82)
  );
  batteryLens.position.z = 1.13;
  group.add(batteryLens);

  batteryLensHalo = new THREE.Mesh(
    new THREE.RingGeometry(0.41, 0.5, 64),
    glowMaterial(0x18ff67, 0.12)
  );
  batteryLensHalo.position.z = 1.12;
  group.add(batteryLensHalo);

  /* recessed internal light, kept behind the front face */
  batteryInner = new THREE.Mesh(
    new THREE.CylinderGeometry(0.44, 0.44, 0.22, 48),
    physicalMaterial({
      color: 0x0fc957,
      emissive: 0x00ff66,
      emissiveIntensity: 0.58,
      metalness: 0,
      roughness: 0.3,
      transparent: true,
      opacity: 0.09
    })
  );
  batteryInner.rotation.x = Math.PI / 2;
  batteryInner.position.z = 0.94;
  group.add(batteryInner);

  group.position.set(0, -0.12, 0);
  group.scale.setScalar(0.78);

  scene.add(group);
  return group;
}

/* ===================================== */
/* RING                                  */
/* ===================================== */

function createRing() {
  const group = new THREE.Group();

  const bandMaterial = physicalMaterial({
    color: 0x102419,
    emissive: 0x030b07,
    emissiveIntensity: 0.08,
    metalness: 0.82,
    roughness: 0.2
  });

  const crownMaterial = physicalMaterial({
    color: 0x1c5f36,
    emissive: 0x082817,
    emissiveIntensity: 0.22,
    metalness: 0.68,
    roughness: 0.18
  });

  /* true shank: smaller cross-section, more jewelry-like */
  ringBand = new THREE.Mesh(
    new THREE.TorusGeometry(0.34, 0.055, 20, 72),
    bandMaterial
  );
  group.add(ringBand);

  /* shoulders that taper into the crown */
  const leftShoulder = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.12, 0.12),
    crownMaterial
  );
  leftShoulder.position.set(-0.19, 0, 0.08);
  leftShoulder.rotation.z = THREE.MathUtils.degToRad(18);

  const rightShoulder = leftShoulder.clone();
  rightShoulder.position.x = 0.19;
  rightShoulder.rotation.z = THREE.MathUtils.degToRad(-18);

  group.add(leftShoulder, rightShoulder);

  /* raised signet crown */
  const crown = new THREE.Mesh(
    new THREE.CylinderGeometry(0.17, 0.2, 0.1, 32),
    crownMaterial
  );
  crown.rotation.x = Math.PI / 2;
  crown.position.z = 0.11;
  group.add(crown);

  const bezel = new THREE.Mesh(
    new THREE.RingGeometry(0.11, 0.155, 40),
    new THREE.MeshStandardMaterial({
      color: 0x32a75b,
      emissive: 0x0c3c20,
      emissiveIntensity: 0.26,
      metalness: 0.5,
      roughness: 0.2,
      side: THREE.DoubleSide
    })
  );
  bezel.position.z = 0.17;
  group.add(bezel);

  ringFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.105, 48),
    glowMaterial(0x54ff8b, 0.82)
  );
  ringFace.position.z = 0.176;
  group.add(ringFace);

  ringFaceHalo = new THREE.Mesh(
    new THREE.RingGeometry(0.11, 0.145, 48),
    glowMaterial(0x12ff62, 0.08)
  );
  ringFaceHalo.position.z = 0.172;
  group.add(ringFaceHalo);

  const emblemMaterial = new THREE.MeshBasicMaterial({
    color: 0x061d0d,
    toneMapped: false,
    side: THREE.DoubleSide
  });

  const emblemCircle = new THREE.Mesh(
    new THREE.RingGeometry(0.03, 0.047, 32),
    emblemMaterial
  );
  emblemCircle.position.z = 0.181;

  const topLine = new THREE.Mesh(
    new THREE.PlaneGeometry(0.095, 0.012),
    emblemMaterial
  );
  topLine.position.set(0, 0.057, 0.183);

  const bottomLine = topLine.clone();
  bottomLine.position.y = -0.057;

  group.add(emblemCircle, topLine, bottomLine);

  ringAccentMeshes.push(ringFace, ringFaceHalo);

  group.scale.setScalar(0.74);

  /* reveal the shank depth so it reads as a ring, not a button */
  group.rotation.set(
    THREE.MathUtils.degToRad(18),
    THREE.MathUtils.degToRad(-28),
    THREE.MathUtils.degToRad(-14)
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
/* POINTER                               */
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
  return battery.localToWorld(new THREE.Vector3(0, 0, 0.92));
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
    target = socketWorld.clone().add(new THREE.Vector3(0, 0, 0.1));
  }

  ring.position.lerp(target, isSnapped ? 0.26 : 0.23);

  const targetX = isSnapped
    ? THREE.MathUtils.degToRad(10)
    : THREE.MathUtils.degToRad(18);

  const targetY = isSnapped
    ? THREE.MathUtils.degToRad(-12)
    : THREE.MathUtils.degToRad(-28);

  const targetZ = isSnapped
    ? THREE.MathUtils.degToRad(-6)
    : THREE.MathUtils.degToRad(-14) + Math.sin(time * 2.2) * 0.018;

  ring.rotation.x = THREE.MathUtils.lerp(ring.rotation.x, targetX, 0.08);
  ring.rotation.y = THREE.MathUtils.lerp(ring.rotation.y, targetY, 0.08);
  ring.rotation.z = THREE.MathUtils.lerp(ring.rotation.z, targetZ, 0.08);

  const snapPulse = isSnapped ? 1 + Math.sin(time * 7) * 0.01 : 1;
  ring.scale.setScalar(0.74 * snapPulse);

  if (charge <= 0) {
    instruction.textContent = isSnapped
      ? "Press and hold to charge"
      : isNearBattery
        ? "The battery is drawing the ring in"
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

  batteryLens.material.opacity = 0.82 + chargeLevel * 0.08;
  batteryLensHalo.material.opacity =
    0.12 + proximity * 0.14 + chargeLevel * 0.18;

  batteryLens.scale.setScalar(
    1 + proximity * 0.03 + chargeLevel * 0.05
  );

  batteryLensHalo.scale.setScalar(
    1 + proximity * 0.05 + chargeLevel * 0.09
  );

  batteryInner.material.emissiveIntensity =
    0.72 + proximity * 0.45 + chargeLevel * 1.25;
  batteryInner.material.opacity =
    0.1 + proximity * 0.04 + chargeLevel * 0.08;

  batteryBody.material.emissiveIntensity =
    0.2 + proximity * 0.15 + chargeLevel * 0.38;

  for (const mesh of batteryAccentMeshes) {
    if (mesh.material.emissiveIntensity !== undefined) {
      mesh.material.emissiveIntensity =
        0.8 + proximity * 0.35 + chargeLevel * 0.7;
    }

    if (mesh.material.opacity !== undefined) {
      mesh.material.opacity = Math.min(
        0.58,
        0.24 + proximity * 0.08 + chargeLevel * 0.14
      );
    }
  }

  ringFace.material.opacity =
    0.84 + proximity * 0.06 + chargeLevel * 0.04;
  ringFaceHalo.material.opacity =
    0.12 + proximity * 0.12 + chargeLevel * 0.16;

  ringFace.scale.setScalar(
    1 + proximity * 0.03 + chargeLevel * 0.04
  );

  ringFaceHalo.scale.setScalar(
    1 + proximity * 0.05 + chargeLevel * 0.08
  );

  ringBand.material.emissiveIntensity =
    0.14 + proximity * 0.18 + chargeLevel * 0.36;

  const socket = getChargeSocketWorld();

  chargeLight.position.copy(socket);
  chargeLight.intensity =
    1.2 + proximity * 1.5 + chargeLevel * 3.8;
  chargeLight.distance =
    9 + proximity * 1.2 + chargeLevel * 2.2;

  contactLight.position.copy(socket);
  contactLight.intensity =
    proximity * 0.8 +
    (isSnapped ? 1.1 : 0) +
    (isHolding ? 1.6 : 0) +
    chargeLevel * 2.6;
  contactLight.distance =
    5 + proximity * 0.8 + chargeLevel * 1.6;

  bloomPass.strength =
    0.62 + proximity * 0.12 + chargeLevel * 0.34;
  bloomPass.radius =
    0.32 + chargeLevel * 0.05;
  bloomPass.threshold =
    0.82 - chargeLevel * 0.04;

  ambient.style.opacity = String(
    0.11 + proximity * 0.06 + chargeLevel * 0.18
  );

  floorGlow.style.opacity = String(
    0.11 + proximity * 0.06 + chargeLevel * 0.22
  );

  floorGlow.style.width = `${360 + chargeLevel * 180}px`;

  if (isHolding) {
    battery.rotation.z =
      (Math.random() - 0.5) * chargeLevel * 0.002;
  } else {
    battery.rotation.z *= 0.84;
  }

  const thresholds = [14, 43, 72];

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

  batteryLens.scale.setScalar(1.07);
  batteryLensHalo.scale.setScalar(1.13);

  batteryInner.material.emissiveIntensity = 2.1;
  batteryBody.material.emissiveIntensity = 0.72;

  ringFace.scale.setScalar(1.08);
  ringFaceHalo.scale.setScalar(1.12);

  chargeLight.intensity = 5.8;
  contactLight.intensity = 4.4;

  bloomPass.strength = 0.94;
  bloomPass.radius = 0.38;
  bloomPass.threshold = 0.76;

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

  batteryInner.material.emissiveIntensity = 0.8;
  batteryInner.material.opacity = 0.12;
  batteryBody.material.emissiveIntensity = 0.28;

  ringBand.material.emissiveIntensity = 0.14;

  bloomPass.strength = 0.62;
  bloomPass.radius = 0.32;
  bloomPass.threshold = 0.82;

  chargeLight.intensity = 1.2;
  chargeLight.distance = 9;
  contactLight.intensity = 0;
  contactLight.distance = 5;

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

  battery.position.y =
    -0.18 + Math.sin(time * 0.85) * 0.007;

  const idlePulse = 1 + Math.sin(time * 2.2) * 0.01;

  if (!isHolding && charge < 2) {
    batteryLens.scale.setScalar(idlePulse);
    ringFace.scale.setScalar(
      1 + Math.sin(time * 2.7) * 0.006
    );
  }

  composer.render();
}

animate();
