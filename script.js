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
const ATTRACTION_RADIUS = 220;
const SNAP_RADIUS = 86;

const BATTERY_YAW = THREE.MathUtils.degToRad(18);

const RING_IDLE_ROT = new THREE.Euler(
  THREE.MathUtils.degToRad(22),
  THREE.MathUtils.degToRad(-28),
  THREE.MathUtils.degToRad(-28)
);

const RING_SNAP_ROT = new THREE.Euler(
  THREE.MathUtils.degToRad(8),
  THREE.MathUtils.degToRad(82),
  THREE.MathUtils.degToRad(18)
);

let battery = null;
let ring = null;
let batteryGlow = null;
let ringGlow = null;
let batterySize = new THREE.Vector3(1, 1, 1);
let batteryTargetScale = 1;
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

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  34,
  window.innerWidth / window.innerHeight,
  0.1,
  100
);

camera.position.set(0, 0.55, 7.7);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.65;

stage.appendChild(renderer.domElement);


/* ===================================== */
/* LIGHTING                              */
/* ===================================== */

const hemi = new THREE.HemisphereLight(
  0xd8ffe7,
  0x04150c,
  3.4
);

scene.add(hemi);

const keyLight = new THREE.DirectionalLight(
  0xffffff,
  6.2
);

keyLight.position.set(4.5, 6.5, 7);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(
  0xa8ffc5,
  3.1
);

fillLight.position.set(-4, 2.5, 5.5);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(
  0x32ff7f,
  4.6
);

rimLight.position.set(-3.5, 3.8, -3.5);
scene.add(rimLight);

const frontLight = new THREE.PointLight(
  0xe6fff0,
  2.4,
  30,
  2
);

frontLight.position.set(0, 1.5, 6.5);
scene.add(frontLight);

const energyLight = new THREE.PointLight(
  0x00ff66,
  0,
  10,
  2
);

energyLight.position.set(0, 0.1, 1.1);
scene.add(energyLight);

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

  const scaledSize = size.clone().multiplyScalar(scale);

  return {
    scale,
    size: scaledSize
  };
}

function prepareModelMaterials(object, isRing = false) {
  object.traverse(child => {
    if (!child.isMesh) return;

    child.material = new THREE.MeshPhysicalMaterial({
      color: isRing ? 0x1eb454 : 0x3d4a42,
      metalness: isRing ? 0.95 : 0.66,
      roughness: isRing ? 0.16 : 0.3,
      clearcoat: isRing ? 0.9 : 0.3,
      clearcoatRoughness: 0.18,
      emissive: isRing ? 0x0a4f24 : 0x062b15,
      emissiveIntensity: isRing ? 0.65 : 0.42
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

function markLoaded() {
  loadedModels += 1;

  if (loadedModels === 2) {
    modelStatus.textContent = "Models ready";
    modelStatus.classList.add("ready");
  }
}

function markError(label, error) {
  console.error(`${label} failed to load`, error);
  modelStatus.textContent = `${label} failed to load`;
  modelStatus.classList.add("error");
}


/* ===================================== */
/* LOAD BATTERY                          */
/* ===================================== */

gltfLoader.load(
  BATTERY_MODEL,
  gltf => {
    battery = gltf.scene;

    prepareModelMaterials(battery, false);

    const info = normalizeObject(
      battery,
      3.7,
      "height"
    );

    batteryTargetScale = info.scale;
    batterySize.copy(info.size);

    battery.position.set(0, -0.85, 0);

    /* IMPORTANT:
       No old -90deg STL rotation here.
       The battery stays upright and only gets a slight yaw.
    */
    battery.rotation.set(0, BATTERY_YAW, 0);

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

    const info = normalizeObject(
      ring,
      0.72,
      "largest"
    );

    ringTargetScale = info.scale;

    ring.rotation.copy(RING_IDLE_ROT);
    ring.position.set(-1.9, 1.0, 2.2);

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
  const geometry = new THREE.SphereGeometry(0.75, 32, 32);

  const material = new THREE.MeshBasicMaterial({
    color: 0x3dff86,
    transparent: true,
    opacity: 0.06,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  batteryGlow = new THREE.Mesh(
    geometry,
    material
  );

  batteryGlow.position.set(0, 0.08, 0.28);
  battery.add(batteryGlow);
}

function createRingGlow() {
  const geometry = new THREE.SphereGeometry(0.42, 24, 24);

  const material = new THREE.MeshBasicMaterial({
    color: 0x3dff86,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });

  ringGlow = new THREE.Mesh(
    geometry,
    material
  );

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
/* SCREEN/WORLD CONVERSIONS              */
/* ===================================== */

function screenToWorld(x, y, zPlane = 2.15) {
  const ndc = new THREE.Vector3(
    (x / window.innerWidth) * 2 - 1,
    -(y / window.innerHeight) * 2 + 1,
    0.5
  );

  ndc.unproject(camera);

  const direction = ndc
    .sub(camera.position)
    .normalize();

  const distance =
    (zPlane - camera.position.z) /
    direction.z;

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
/* SNAP / SOCKET                         */
/* ===================================== */

function getChargeSocketWorld() {
  if (!battery) return new THREE.Vector3();

  const socket = new THREE.Vector3(
    batterySize.x * 0.19,
    batterySize.y * 0.01,
    batterySize.z * 0.22
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

  if (isSnapped) {
    attraction = 0.98;
  }

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

  let targetWorld = screenToWorld(
    visualX,
    visualY,
    2.15
  );

  if (isSnapped) {
    targetWorld = socketWorld
      .clone()
      .add(new THREE.Vector3(0.0, 0.02, 0.16));
  }

  ring.position.lerp(
    targetWorld,
    isSnapped ? 0.22 : 0.24
  );

  if (isNearBattery) {
    ring.rotation.x = THREE.MathUtils.lerp(
      ring.rotation.x,
      RING_SNAP_ROT.x,
      0.1
    );

    ring.rotation.y = THREE.MathUtils.lerp(
      ring.rotation.y,
      RING_SNAP_ROT.y,
      0.1
    );

    ring.rotation.z = THREE.MathUtils.lerp(
      ring.rotation.z,
      RING_SNAP_ROT.z,
      0.1
    );
  } else {
    const wobble = Math.sin(time * 2.4) * 0.08;

    ring.rotation.x = THREE.MathUtils.lerp(
      ring.rotation.x,
      RING_IDLE_ROT.x + wobble * 0.25,
      0.08
    );

    ring.rotation.y = THREE.MathUtils.lerp(
      ring.rotation.y,
      RING_IDLE_ROT.y + wobble * 0.6,
      0.08
    );

    ring.rotation.z = THREE.MathUtils.lerp(
      ring.rotation.z,
      RING_IDLE_ROT.z,
      0.08
    );
  }

  const pulse = isSnapped
    ? 1 + Math.sin(time * 8) * 0.025
    : 1 + Math.sin(time * 2.8) * 0.01;

  ring.scale.setScalar(ringTargetScale * pulse);

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
  if (!battery || !ring) return;

  const socket = worldToScreen(getChargeSocketWorld());
  const ringScreen = worldToScreen(ring.position.clone());

  [beam, beamBlur].forEach(line => {
    line.setAttribute("x1", ringScreen.x);
    line.setAttribute("y1", ringScreen.y);
    line.setAttribute("x2", socket.x);
    line.setAttribute("y2", socket.y);
  });

  const visible = isHolding && isSnapped && !completed;

  beam.classList.toggle("visible", visible);
  beamBlur.classList.toggle("visible", visible);
}


/* ===================================== */
/* CHARGE                                */
/* ===================================== */

function updateCharge() {
  if (completed) return;

  if (isHolding && isSnapped) {
    charge += CHARGE_SPEED;

    if (Math.random() > 0.48) {
      createParticle();
    }
  } else {
    charge -= DRAIN_SPEED;
  }

  charge = THREE.MathUtils.clamp(charge, 0, 100);

  progressText.textContent = `${Math.round(charge)}%`;

  updateChargeVisuals();

  if (charge >= 100) {
    finishCharge();
  }
}

function updateChargeVisuals() {
  const intensity = charge / 100;

  energyLight.intensity = intensity * 12;
  energyLight.distance = 6 + intensity * 8;

  if (batteryGlow) {
    batteryGlow.material.opacity = 0.06 + intensity * 0.58;
    batteryGlow.scale.setScalar(1 + intensity * 2.4);
  }

  if (ringGlow) {
    ringGlow.material.opacity = 0.16 + intensity * 0.52;
    ringGlow.scale.setScalar(1 + intensity * 0.9);
  }

  setEmissiveIntensity(
    battery,
    0.42 + intensity * 1.55
  );

  setEmissiveIntensity(
    ring,
    0.65 + intensity * 1.85
  );

  ambient.style.opacity = `${0.16 + intensity * 0.77}`;
  ambient.style.transform = `scale(${1 + intensity * 0.2})`;

  floorGlow.style.opacity = `${0.16 + intensity * 0.72}`;
  floorGlow.style.width = `${430 + intensity * 320}px`;

  if (battery && isHolding) {
    battery.rotation.z =
      (Math.random() - 0.5) *
      intensity *
      0.006;
  } else if (battery) {
    battery.rotation.z *= 0.82;
  }

  const thresholds = [17, 45, 71];

  oathLines.forEach((line, index) => {
    line.classList.toggle(
      "visible",
      charge >= thresholds[index]
    );
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
    `${socketPos.x - startX + (Math.random() - 0.5) * 25}px`
  );

  particle.style.setProperty(
    "--moveY",
    `${socketPos.y - startY + (Math.random() - 0.5) * 25}px`
  );

  particle.style.setProperty(
    "--duration",
    `${0.4 + Math.random() * 0.5}s`
  );

  particlesContainer.appendChild(particle);

  setTimeout(() => particle.remove(), 1000);
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

  energyLight.intensity = 20;

  if (batteryGlow) {
    batteryGlow.material.opacity = 0.88;
    batteryGlow.scale.setScalar(4.2);
  }

  if (ringGlow) {
    ringGlow.material.opacity = 0.92;
    ringGlow.scale.setScalar(2.2);
  }

  setEmissiveIntensity(battery, 2.25);
  setEmissiveIntensity(ring, 2.5);

  setTimeout(() => {
    flash.classList.add("fire");
  }, 280);

  setTimeout(() => {
    reveal.classList.add("visible");
  }, 980);
}


/* ===================================== */
/* RESET                                 */
/* ===================================== */

restart.addEventListener("click", () => {
  completed = false;
  isHolding = false;
  charge = 0;

  reveal.classList.remove("visible");
  flash.classList.remove("fire");
  beam.classList.remove("visible");
  beamBlur.classList.remove("visible");

  oathLines.forEach(line =>
    line.classList.remove("visible")
  );

  instruction.textContent = "Bring the ring to the battery";

  energyLight.intensity = 0;

  if (batteryGlow) {
    batteryGlow.material.opacity = 0.06;
    batteryGlow.scale.setScalar(1);
  }

  if (ringGlow) {
    ringGlow.material.opacity = 0.16;
    ringGlow.scale.setScalar(1);
  }

  setEmissiveIntensity(battery, 0.42);
  setEmissiveIntensity(ring, 0.65);
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
    battery.position.y =
      -0.85 + Math.sin(time * 0.9) * 0.012;
  }

  renderer.render(scene, camera);
}

animate();
