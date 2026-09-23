import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

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

const BATTERY_MODEL = "./assets/green_lantern.glb";
const RING_MODEL = "./assets/green-lantern-ring.glb";

const CHARGE_SPEED = 0.38;
const DRAIN_SPEED = 0.095;
const ATTRACTION_RADIUS = 245;
const SNAP_RADIUS = 92;

const BATTERY_ROTATION = new THREE.Euler(0, Math.PI, 0);
const RING_IDLE_ROT = new THREE.Euler(
  0,
  Math.PI,
  THREE.MathUtils.degToRad(-18)
);
const RING_SNAP_ROT = new THREE.Euler(
  0,
  Math.PI,
  THREE.MathUtils.degToRad(-4)
);

let battery = null;
let ring = null;
let batteryGlow = null;
let ringGlow = null;
let batterySize = new THREE.Vector3(1, 1, 1);
let ringTargetScale = 1;
let loadedModels = 0;

let mouseX = window.innerWidth / 2;
let mouseY = window.innerHeight / 2;
let smoothX = mouseX;
let smoothY = mouseY;
let isNearBattery = false;
let isSnapped = false;
let isHolding = false;
let charge = 0;
let completed = false;
let attractionLevel = 0;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  34,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);
camera.position.set(0, 0.05, 7.6);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 2.0;

stage.appendChild(renderer.domElement);

/* ===================================== */
/* LIGHTING                              */
/* ===================================== */

scene.add(new THREE.AmbientLight(0x8cffb2, 2.2));
scene.add(new THREE.HemisphereLight(0xeafff2, 0x041d12, 4.8));

const keyLight = new THREE.DirectionalLight(0xffffff, 8.5);
keyLight.position.set(4.8, 6.8, 7.2);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xb8ffd0, 4.8);
fillLight.position.set(-4.8, 2.6, 5.6);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0x38ff85, 6.1);
rimLight.position.set(-2.5, 4.2, -3.8);
scene.add(rimLight);

const frontLight = new THREE.PointLight(0xf0fff5, 5.5, 35, 2);
frontLight.position.set(0, 1.1, 6.8);
scene.add(frontLight);

/* overall lantern glow */
const energyLight = new THREE.PointLight(0x30ff78, 2.6, 16, 2);
energyLight.position.set(0, 0.08, 1.45);
scene.add(energyLight);

/* contact / snap glow */
const contactLight = new THREE.PointLight(0x9dffba, 0, 10, 2);
contactLight.position.set(0, 0.08, 1.55);
scene.add(contactLight);

const gltfLoader = new GLTFLoader();

/* ===================================== */
/* HELPERS                               */
/* ===================================== */

function normalizeObject(object, targetSize, mode = "height") {
  const box = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  box.getSize(size);

  const center = new THREE.Vector3();
  box.getCenter(center);
  object.position.sub(center);

  const source =
    mode === "height"
      ? size.y
      : Math.max(size.x, size.y, size.z);

  const scale = targetSize / source;
  object.scale.setScalar(scale);

  return {
    scale,
    size: size.clone().multiplyScalar(scale)
  };
}

function prepareModelMaterials(object, isRing = false) {
  object.traverse(child => {
    if (!child.isMesh) return;

    child.material = new THREE.MeshPhysicalMaterial({
      color: isRing ? 0x22d965 : 0x587066,
      metalness: isRing ? 0.98 : 0.82,
      roughness: isRing ? 0.12 : 0.25,
      clearcoat: 1,
      clearcoatRoughness: 0.12,
      emissive: isRing ? 0x0f7735 : 0x0b4e24,
      emissiveIntensity: isRing ? 1.1 : 1.0
    });

    child.castShadow = true;
    child.receiveShadow = true;
  });
}

function setEmissiveIntensity(object, value) {
  if (!object) return;

  object.traverse(child => {
    if (
      child.isMesh &&
      child.material &&
      "emissiveIntensity" in child.material
    ) {
      child.material.emissiveIntensity = value;
    }
  });
}

function setStatus(text, state = "") {
  if (!modelStatus) return;

  modelStatus.textContent = text;
  modelStatus.classList.remove("ready", "error");

  if (state) modelStatus.classList.add(state);
}

function markLoaded() {
  loadedModels += 1;

  if (loadedModels === 2) {
    setStatus("Models ready", "ready");
  }
}

function markError(label, error) {
  console.error(`${label} failed to load`, error);
  setStatus(`${label} failed to load`, "error");
}

/* ===================================== */
/* LOAD BATTERY                          */
/* ===================================== */

gltfLoader.load(
  BATTERY_MODEL,
  gltf => {
    battery = gltf.scene;

    prepareModelMaterials(battery, false);

    const info = normalizeObject(battery, 3.75, "height");
    batterySize.copy(info.size);

    battery.position.set(0, -0.1, 0);
    battery.rotation.copy(BATTERY_ROTATION);

    scene.add(battery);

    createBatteryGlow();
    markLoaded();
  },
  undefined,
  error => markError("Battery", error)
);

/* ===================================== */
/* LOAD RING                             */
/* ===================================== */

gltfLoader.load(
  RING_MODEL,
  gltf => {
    ring = gltf.scene;

    prepareModelMaterials(ring, true);

    const info = normalizeObject(ring, 0.82, "largest");
    ringTargetScale = info.scale;

    ring.position.set(-2.15, 0.82, 2.15);
    ring.rotation.copy(RING_IDLE_ROT);

    scene.add(ring);

    createRingGlow();
    markLoaded();
  },
  undefined,
  error => markError("Ring", error)
);

/* ===================================== */
/* GLOWS                                 */
/* ===================================== */

function createBatteryGlow() {
  const geometry = new THREE.SphereGeometry(0.98, 36, 36);

  const material = new THREE.MeshBasicMaterial({
    color: 0x38ff85,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  batteryGlow = new THREE.Mesh(geometry, material);
  batteryGlow.position.set(0, 0.04, 0.42);
  battery.add(batteryGlow);
}

function createRingGlow() {
  const geometry = new THREE.SphereGeometry(0.48, 24, 24);

  const material = new THREE.MeshBasicMaterial({
    color: 0x38ff85,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  ringGlow = new THREE.Mesh(geometry, material);
  ring.add(ringGlow);
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
/* SCREEN / WORLD                        */
/* ===================================== */

function screenToWorld(x, y, zPlane = 2.2) {
  const ndc = new THREE.Vector3(
    (x / window.innerWidth) * 2 - 1,
    -(y / window.innerHeight) * 2 + 1,
    0.5
  );

  ndc.unproject(camera);

  const direction = ndc.sub(camera.position).normalize();
  const distance = (zPlane - camera.position.z) / direction.z;

  return camera.position
    .clone()
    .add(direction.multiplyScalar(distance));
}

function worldToScreen(position) {
  const projected = position.clone().project(camera);

  return {
    x: ((projected.x + 1) / 2) * window.innerWidth,
    y: ((1 - projected.y) / 2) * window.innerHeight
  };
}

/* ===================================== */
/* SOCKET                                */
/* ===================================== */

function getChargeSocketWorld() {
  if (!battery) return new THREE.Vector3();

  /* center-front contact, closer to the usual GL charging pose */
  const socket = new THREE.Vector3(
    0,
    0.02,
    batterySize.z * 0.53
  );

  return battery.localToWorld(socket);
}

/* ===================================== */
/* RING MOVEMENT                         */
/* ===================================== */

function updateRing(time) {
  if (!ring || !battery || completed) return;

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

  attraction =
    attraction *
    attraction *
    (3 - 2 * attraction);

  if (isSnapped) attraction = 0.985;

  attractionLevel = attraction;

  const visualX = THREE.MathUtils.lerp(
    smoothX,
    socketScreen.x,
    attraction
  );

  const visualY = THREE.MathUtils.lerp(
    smoothY,
    socketScreen.y,
    attraction
  );

  let targetWorld = screenToWorld(visualX, visualY, 2.2);

  if (isSnapped) {
    targetWorld = socketWorld
      .clone()
      .add(new THREE.Vector3(0, 0.01, 0.16));
  }

  ring.position.lerp(targetWorld, isSnapped ? 0.24 : 0.22);

  const targetRotation = isNearBattery ? RING_SNAP_ROT : RING_IDLE_ROT;

  ring.rotation.x = THREE.MathUtils.lerp(
    ring.rotation.x,
    targetRotation.x,
    0.08
  );

  ring.rotation.y = THREE.MathUtils.lerp(
    ring.rotation.y,
    targetRotation.y,
    0.08
  );

  ring.rotation.z = THREE.MathUtils.lerp(
    ring.rotation.z,
    targetRotation.z + (!isNearBattery ? Math.sin(time * 2.4) * 0.03 : 0),
    0.08
  );

  const pulse =
    isSnapped
      ? 1 + Math.sin(time * 8) * 0.03
      : 1 + Math.sin(time * 2.8) * 0.01;

  ring.scale.setScalar(ringTargetScale * pulse);

  if (charge <= 0) {
    instruction.textContent = isSnapped
      ? "Press and hold to charge"
      : isNearBattery
        ? "The lantern is pulling the ring in"
        : "Bring the ring to the battery";
  }
}

/* ===================================== */
/* BEAM / MAGNETIC PULL                  */
/* ===================================== */

function updateBeam() {
  if (!battery || !ring) return;

  const socket = worldToScreen(getChargeSocketWorld());
  const ringScreen = worldToScreen(ring.position.clone());

  [beam, beamBlur].forEach(line => {
    line.setAttribute("x1", ringScreen.x);
    line.setAttribute("y1", ringScreen.y);
    line.setAttribute("x2", socket.x);
    line.setAttribute("y2", socket.y);
  });

  let beamStrength = attractionLevel * 0.55;

  if (isSnapped) {
    beamStrength = 0.72;
  }

  if (isHolding && isSnapped) {
    beamStrength = 1;
  }

  beam.classList.toggle("visible", beamStrength > 0.03);
  beamBlur.classList.toggle("visible", beamStrength > 0.03);

  beam.style.opacity = `${beamStrength}`;
  beamBlur.style.opacity = `${Math.min(1, beamStrength * 0.85)}`;
}

/* ===================================== */
/* CHARGE / VISUAL STATE                 */
/* ===================================== */

function updateCharge() {
  if (completed) return;

  if (isHolding && isSnapped) {
    charge += CHARGE_SPEED;

    if (Math.random() > 0.48) {
      createParticle();
    }

    if (Math.random() > 0.75) {
      createSocketSpark();
    }
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

function updateEnergyVisuals() {
  const chargeLevel = charge / 100;
  const proximity = attractionLevel;

  const socketWorld = getChargeSocketWorld();

  energyLight.position.copy(socketWorld);
  contactLight.position.copy(socketWorld.clone().add(new THREE.Vector3(0, 0, 0.15)));

  energyLight.intensity =
    2.8 +
    proximity * 4.5 +
    chargeLevel * 10;

  energyLight.distance =
    15 +
    proximity * 3 +
    chargeLevel * 10;

  contactLight.intensity =
    proximity * 6 +
    (isSnapped ? 4 : 0) +
    (isHolding ? 5 : 0) +
    chargeLevel * 9;

  contactLight.distance =
    6 +
    proximity * 2 +
    chargeLevel * 5;

  if (batteryGlow) {
    batteryGlow.material.opacity =
      0.22 +
      proximity * 0.18 +
      chargeLevel * 0.44;

    batteryGlow.scale.setScalar(
      1.2 +
      proximity * 0.5 +
      chargeLevel * 2.6
    );
  }

  if (ringGlow) {
    ringGlow.material.opacity =
      0.22 +
      proximity * 0.28 +
      chargeLevel * 0.32;

    ringGlow.scale.setScalar(
      1.05 +
      proximity * 0.35 +
      chargeLevel * 0.95
    );
  }

  setEmissiveIntensity(
    battery,
    1.0 +
    proximity * 0.8 +
    chargeLevel * 1.9
  );

  setEmissiveIntensity(
    ring,
    1.1 +
    proximity * 1.1 +
    chargeLevel * 2.2
  );

  ambient.style.opacity = `${
    0.24 +
    proximity * 0.2 +
    chargeLevel * 0.58
  }`;

  ambient.style.transform = `scale(${
    1 +
    proximity * 0.08 +
    chargeLevel * 0.22
  })`;

  floorGlow.style.opacity = `${
    0.24 +
    proximity * 0.2 +
    chargeLevel * 0.58
  }`;

  floorGlow.style.width = `${
    470 +
    proximity * 90 +
    chargeLevel * 320
  }px`;

  if (battery && isHolding) {
    battery.rotation.z =
      (Math.random() - 0.5) *
      (0.003 + chargeLevel * 0.004);
  } else if (battery) {
    battery.rotation.z *= 0.82;
  }

  const thresholds = [17, 45, 71];
  oathLines.forEach((line, index) => {
    line.classList.toggle("visible", charge >= thresholds[index]);
  });
}

/* ===================================== */
/* PARTICLES                             */
/* ===================================== */

function createParticle() {
  if (!ring || !battery) return;

  const ringPos = worldToScreen(ring.position.clone());
  const socketPos = worldToScreen(getChargeSocketWorld());

  const particle = document.createElement("span");
  particle.className = "particle";

  const startX = ringPos.x + (Math.random() - 0.5) * 14;
  const startY = ringPos.y + (Math.random() - 0.5) * 14;

  particle.style.left = `${startX}px`;
  particle.style.top = `${startY}px`;

  particle.style.setProperty(
    "--moveX",
    `${socketPos.x - startX + (Math.random() - 0.5) * 18}px`
  );

  particle.style.setProperty(
    "--moveY",
    `${socketPos.y - startY + (Math.random() - 0.5) * 18}px`
  );

  particle.style.setProperty(
    "--duration",
    `${0.32 + Math.random() * 0.35}s`
  );

  particlesContainer.appendChild(particle);

  setTimeout(() => particle.remove(), 900);
}

function createSocketSpark() {
  if (!battery) return;

  const socketPos = worldToScreen(getChargeSocketWorld());

  const particle = document.createElement("span");
  particle.className = "particle";

  particle.style.left = `${socketPos.x + (Math.random() - 0.5) * 10}px`;
  particle.style.top = `${socketPos.y + (Math.random() - 0.5) * 10}px`;

  particle.style.setProperty(
    "--moveX",
    `${(Math.random() - 0.5) * 40}px`
  );

  particle.style.setProperty(
    "--moveY",
    `${(Math.random() - 0.5) * 40}px`
  );

  particle.style.setProperty(
    "--duration",
    `${0.2 + Math.random() * 0.2}s`
  );

  particlesContainer.appendChild(particle);

  setTimeout(() => particle.remove(), 500);
}

function createDust() {
  for (let i = 0; i < 55; i++) {
    const dot = document.createElement("span");
    dot.className = "dust-particle";

    const size = 1 + Math.random() * 2.2;

    dot.style.left = `${Math.random() * 100}%`;
    dot.style.top = `${Math.random() * 100}%`;
    dot.style.setProperty("--size", `${size}px`);
    dot.style.setProperty("--duration", `${4 + Math.random() * 8}s`);
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

  beam.classList.remove("visible");
  beamBlur.classList.remove("visible");

  instruction.textContent = "Charge complete";

  energyLight.intensity = 22;
  energyLight.distance = 24;
  contactLight.intensity = 18;
  contactLight.distance = 10;

  if (batteryGlow) {
    batteryGlow.material.opacity = 0.96;
    batteryGlow.scale.setScalar(4.7);
  }

  if (ringGlow) {
    ringGlow.material.opacity = 0.98;
    ringGlow.scale.setScalar(2.35);
  }

  setEmissiveIntensity(battery, 3.0);
  setEmissiveIntensity(ring, 3.3);

  setTimeout(() => flash.classList.add("fire"), 280);
  setTimeout(() => reveal.classList.add("visible"), 980);
}

/* ===================================== */
/* RESET                                 */
/* ===================================== */

restart.addEventListener("click", () => {
  completed = false;
  isHolding = false;
  charge = 0;
  attractionLevel = 0;

  reveal.classList.remove("visible");
  flash.classList.remove("fire");
  beam.classList.remove("visible");
  beamBlur.classList.remove("visible");

  beam.style.opacity = "0";
  beamBlur.style.opacity = "0";

  oathLines.forEach(line => line.classList.remove("visible"));

  instruction.textContent = "Bring the ring to the battery";

  energyLight.intensity = 2.6;
  energyLight.distance = 16;
  contactLight.intensity = 0;
  contactLight.distance = 8;

  if (batteryGlow) {
    batteryGlow.material.opacity = 0.22;
    batteryGlow.scale.setScalar(1.2);
  }

  if (ringGlow) {
    ringGlow.material.opacity = 0.22;
    ringGlow.scale.setScalar(1.05);
  }

  setEmissiveIntensity(battery, 1.0);
  setEmissiveIntensity(ring, 1.1);
});

/* ===================================== */
/* RESIZE                                */
/* ===================================== */

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
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

  if (battery && !completed) {
    battery.position.y = -0.1 + Math.sin(time * 0.9) * 0.012;
  }

  renderer.render(scene, camera);
}

animate();
