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

camera.position.set(0, 0.1, 8.8);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});

renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.35;

stage.appendChild(renderer.domElement);

/* ===================================== */
/* POST PROCESSING / BLOOM               */
/* ===================================== */

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.05,
  0.62,
  0.28
);

composer.addPass(bloomPass);

/* ===================================== */
/* LIGHTING                              */
/* ===================================== */

scene.add(new THREE.AmbientLight(0x7ea98c, 0.9));

const keyLight = new THREE.DirectionalLight(0xcdeed7, 2.8);
keyLight.position.set(4.2, 5.4, 6.5);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0x345c42, 1.9);
fillLight.position.set(-4, 1, 4);
scene.add(fillLight);

const rimLight = new THREE.DirectionalLight(0x00ff68, 2.2);
rimLight.position.set(-2, 3.5, -4);
scene.add(rimLight);

const chargeLight = new THREE.PointLight(0x35ff7d, 1.8, 12, 2);
chargeLight.position.set(0, 0, 2);
scene.add(chargeLight);

const contactLight = new THREE.PointLight(0xc9ffda, 0, 6, 2);
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
    clearcoat: 0.55,
    clearcoatRoughness: 0.2,
    transparent,
    opacity,
    side: THREE.DoubleSide
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
    side: THREE.DoubleSide
  });
}

/* ===================================== */
/* MOVIE-INSPIRED POWER BATTERY          */
/* ===================================== */

function createBattery() {
  const group = new THREE.Group();

  const shell = physicalMaterial({
    color: 0x123622,
    emissive: 0x062314,
    emissiveIntensity: 0.45,
    metalness: 0.25,
    roughness: 0.34
  });

  const trim = physicalMaterial({
    color: 0x2a6e44,
    emissive: 0x0b3d21,
    emissiveIntensity: 0.45,
    metalness: 0.45,
    roughness: 0.26
  });

  const luminous = physicalMaterial({
    color: 0x32e36e,
    emissive: 0x00ff66,
    emissiveIntensity: 1.5,
    metalness: 0.05,
    roughness: 0.22,
    transparent: true,
    opacity: 0.78
  });

  /* rounded organic central body */
  const bodyGeometry = new THREE.SphereGeometry(1.34, 64, 64);
  bodyGeometry.scale(1.0, 1.12, 0.52);

  batteryBody = new THREE.Mesh(bodyGeometry, shell);
  group.add(batteryBody);

  /* upper neck */
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.62, 0.82, 0.72, 48),
    shell
  );
  neck.position.y = 1.38;
  group.add(neck);

  /* upper cap */
  const upperCap = new THREE.Mesh(
    new THREE.CylinderGeometry(0.96, 0.76, 0.36, 48),
    trim
  );
  upperCap.position.y = 1.78;
  group.add(upperCap);

  /* base */
  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.82, 1.02, 0.62, 48),
    shell
  );
  base.position.y = -1.5;
  group.add(base);

  const baseTrim = new THREE.Mesh(
    new THREE.CylinderGeometry(1.05, 1.05, 0.14, 48),
    trim
  );
  baseTrim.position.y = -1.84;
  group.add(baseTrim);

  /* squared handle, closer to the 2011 battery silhouette */
  const handle = new THREE.Group();

  const handleMat = physicalMaterial({
    color: 0x163d27,
    emissive: 0x082716,
    emissiveIntensity: 0.35,
    metalness: 0.35,
    roughness: 0.3
  });

  const topBar = new THREE.Mesh(
    new THREE.BoxGeometry(1.75, 0.18, 0.18),
    handleMat
  );
  topBar.position.y = 2.52;

  const leftBar = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 1.25, 0.18),
    handleMat
  );
  leftBar.position.set(-0.79, 2.0, 0);

  const rightBar = leftBar.clone();
  rightBar.position.x = 0.79;

  handle.add(topBar, leftBar, rightBar);
  group.add(handle);

  /* side translucent energy fins */
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.28, 0.8, 8, 20),
      luminous.clone()
    );

    fin.rotation.z = Math.PI / 2;
    fin.scale.set(1.05, 1.0, 0.7);
    fin.position.set(side * 1.42, 0, 0.02);

    group.add(fin);
    batteryAccentMeshes.push(fin);
  }

  /* luminous seams */
  const seamMaterial = glowMaterial(0x38ff7f, 0.78);

  const seamTop = new THREE.Mesh(
    new THREE.TorusGeometry(1.1, 0.035, 12, 96),
    seamMaterial
  );
  seamTop.position.z = 0.63;
  seamTop.scale.y = 1.12;
  group.add(seamTop);
  batteryAccentMeshes.push(seamTop);

  /* front jewel / lens */
  const lensOuter = new THREE.Mesh(
    new THREE.CircleGeometry(0.72, 64),
    glowMaterial(0x20c95f, 0.95)
  );
  lensOuter.position.z = 0.72;
  group.add(lensOuter);

  batteryLens = new THREE.Mesh(
    new THREE.CircleGeometry(0.55, 64),
    glowMaterial(0x65ff9b, 1)
  );
  batteryLens.position.z = 0.755;
  group.add(batteryLens);

  batteryLensHalo = new THREE.Mesh(
    new THREE.RingGeometry(0.58, 0.82, 64),
    glowMaterial(0x20ff6a, 0.28)
  );
  batteryLensHalo.position.z = 0.74;
  group.add(batteryLensHalo);

  /* internal translucent core */
  batteryInner = new THREE.Mesh(
    new THREE.SphereGeometry(0.76, 48, 48),
    physicalMaterial({
      color: 0x0fd75a,
      emissive: 0x00ff66,
      emissiveIntensity: 1.2,
      metalness: 0,
      roughness: 0.25,
      transparent: true,
      opacity: 0.28
    })
  );

  batteryInner.scale.set(1, 1.1, 0.55);
  group.add(batteryInner);

  group.position.set(0, -0.05, 0);
  group.scale.setScalar(1.02);

  scene.add(group);
  return group;
}

/* ===================================== */
/* MOVIE-INSPIRED POWER RING             */
/* ===================================== */

function createRing() {
  const group = new THREE.Group();

  const bandMaterial = physicalMaterial({
    color: 0x1c3a2c,
    emissive: 0x06170e,
    emissiveIntensity: 0.25,
    metalness: 0.62,
    roughness: 0.22
  });

  const greenMetal = physicalMaterial({
    color: 0x24b85a,
    emissive: 0x0d5529,
    emissiveIntensity: 0.75,
    metalness: 0.32,
    roughness: 0.22
  });

  /* front-facing band */
  ringBand = new THREE.Mesh(
    new THREE.TorusGeometry(0.31, 0.095, 24, 64),
    bandMaterial
  );
  group.add(ringBand);

  /* crown */
  const crown = new THREE.Mesh(
    new THREE.CylinderGeometry(0.25, 0.3, 0.13, 48),
    greenMetal
  );

  crown.rotation.x = Math.PI / 2;
  crown.position.z = 0.105;
  group.add(crown);

  /* translucent energetic face */
  ringFace = new THREE.Mesh(
    new THREE.CircleGeometry(0.205, 48),
    glowMaterial(0x57ff91, 1)
  );

  ringFace.position.z = 0.18;
  group.add(ringFace);

  ringFaceHalo = new THREE.Mesh(
    new THREE.RingGeometry(0.2, 0.27, 48),
    glowMaterial(0x16ff67, 0.38)
  );

  ringFaceHalo.position.z = 0.17;
  group.add(ringFaceHalo);

  /* simplified GL mark on face */
  const emblemMaterial = new THREE.MeshBasicMaterial({
    color: 0x052611,
    toneMapped: false
  });

  const emblemCircle = new THREE.Mesh(
    new THREE.RingGeometry(0.07, 0.095, 40),
    emblemMaterial
  );
  emblemCircle.position.z = 0.195;

  const topLine = new THREE.Mesh(
    new THREE.PlaneGeometry(0.21, 0.025),
    emblemMaterial
  );
  topLine.position.set(0, 0.13, 0.197);

  const bottomLine = topLine.clone();
  bottomLine.position.y = -0.13;

  group.add(emblemCircle, topLine, bottomLine);

  ringAccentMeshes.push(ringFace, ringFaceHalo);

  group.scale.setScalar(1.15);
  group.rotation.z = THREE.MathUtils.degToRad(-18);

  scene.add(group);
  return group;
}

/* ===================================== */
/* INIT OBJECTS                          */
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
/* SCREEN / WORLD                        */
/* ===================================== */

function screenToWorld(x, y, zPlane = 1.9) {
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

function getChargeSocketWorld() {
  return battery.localToWorld(
    new THREE.Vector3(
      0,
      0,
      0.91
    )
  );
}

/* ===================================== */
/* RING MAGNETISM                        */
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

  isNearBattery =
    distance <
    ATTRACTION_RADIUS;

  isSnapped =
    distance <
    SNAP_RADIUS;

  let attraction =
    THREE.MathUtils.clamp(
      1 -
      distance /
      ATTRACTION_RADIUS,
      0,
      1
    );

  attraction =
    attraction *
    attraction *
    (3 - 2 * attraction);

  attractionLevel = attraction;

  if (isSnapped) {
    attraction = 0.99;
  }

  const visualX =
    THREE.MathUtils.lerp(
      smoothX,
      socketScreen.x,
      attraction
    );

  const visualY =
    THREE.MathUtils.lerp(
      smoothY,
      socketScreen.y,
      attraction
    );

  let target =
    screenToWorld(
      visualX,
      visualY,
      1.95
    );

  if (isSnapped) {
    target =
      socketWorld
        .clone()
        .add(
          new THREE.Vector3(
            0,
            0,
            0.12
          )
        );
  }

  ring.position.lerp(
    target,
    isSnapped
      ? 0.26
      : 0.23
  );

  const desiredZ =
    isSnapped
      ? THREE.MathUtils.degToRad(-4)
      : THREE.MathUtils.degToRad(-18) +
        Math.sin(time * 2.2) * 0.025;

  ring.rotation.z =
    THREE.MathUtils.lerp(
      ring.rotation.z,
      desiredZ,
      0.08
    );

  ring.rotation.x =
    THREE.MathUtils.lerp(
      ring.rotation.x,
      0,
      0.08
    );

  ring.rotation.y =
    THREE.MathUtils.lerp(
      ring.rotation.y,
      0,
      0.08
    );

  const snapPulse =
    isSnapped
      ? 1 + Math.sin(time * 7) * 0.018
      : 1;

  ring.scale.setScalar(
    1.15 *
    snapPulse
  );

  if (charge <= 0) {
    instruction.textContent =
      isSnapped
        ? "Press and hold to charge"
        : isNearBattery
          ? "The battery is drawing the ring in"
          : "Bring the ring to the battery";
  }
}

/* ===================================== */
/* ENERGY CONNECTION                     */
/* ===================================== */

function updateBeam() {
  const socket =
    worldToScreen(
      getChargeSocketWorld()
    );

  const ringScreen =
    worldToScreen(
      ring.position
    );

  [beam, beamBlur].forEach(line => {
    line.setAttribute("x1", ringScreen.x);
    line.setAttribute("y1", ringScreen.y);
    line.setAttribute("x2", socket.x);
    line.setAttribute("y2", socket.y);
  });

  let strength =
    attractionLevel *
    0.38;

  if (isSnapped) {
    strength = 0.5;
  }

  if (isHolding) {
    strength = 0.78;
  }

  beam.classList.toggle(
    "visible",
    strength > 0.04
  );

  beamBlur.classList.toggle(
    "visible",
    strength > 0.04
  );

  beam.style.opacity =
    String(strength);

  beamBlur.style.opacity =
    String(strength * 0.65);
}

/* ===================================== */
/* CHARGE                                */
/* ===================================== */

function updateCharge() {
  if (completed) return;

  if (isHolding && isSnapped) {
    charge += CHARGE_SPEED;

    if (Math.random() > 0.5) {
      createParticle();
    }

    if (Math.random() > 0.78) {
      createSocketSpark();
    }
  } else {
    charge -= DRAIN_SPEED;
  }

  charge =
    THREE.MathUtils.clamp(
      charge,
      0,
      100
    );

  progressText.textContent =
    `${Math.round(charge)}%`;

  updateEnergyVisuals();

  if (charge >= 100) {
    finishCharge();
  }
}

/* ===================================== */
/* CINEMATIC ENERGY BEHAVIOUR            */
/* ===================================== */

function updateEnergyVisuals() {
  const chargeLevel =
    charge / 100;

  const proximity =
    attractionLevel;

  /*
    Movie / animated reference:
    - front jewel is the brightest point
    - body carries softer green energy
    - ring gem glows rather than becoming
      a giant white ball
  */

  const lensIntensity =
    1.35 +
    proximity * 1.6 +
    chargeLevel * 4.2;

  batteryLens.material.color.setScalar(1);
  batteryLens.material.opacity =
    0.78 +
    chargeLevel * 0.2;

  batteryLensHalo.material.opacity =
    0.18 +
    proximity * 0.18 +
    chargeLevel * 0.34;

  const lensScale =
    1 +
    proximity * 0.045 +
    chargeLevel * 0.09;

  batteryLens.scale.setScalar(
    lensScale
  );

  batteryLensHalo.scale.setScalar(
    1 +
    proximity * 0.08 +
    chargeLevel * 0.16
  );

  batteryInner.material.emissiveIntensity =
    1.05 +
    proximity * 0.7 +
    chargeLevel * 2.3;

  batteryInner.material.opacity =
    0.24 +
    proximity * 0.08 +
    chargeLevel * 0.16;

  batteryBody.material.emissiveIntensity =
    0.35 +
    proximity * 0.25 +
    chargeLevel * 0.75;

  for (const mesh of batteryAccentMeshes) {
    if (mesh.material.emissiveIntensity !== undefined) {
      mesh.material.emissiveIntensity =
        1.1 +
        proximity * 0.7 +
        chargeLevel * 1.8;
    }

    if (mesh.material.opacity !== undefined) {
      mesh.material.opacity =
        Math.min(
          0.9,
          0.5 +
          proximity * 0.12 +
          chargeLevel * 0.28
        );
    }
  }

  ringFace.material.opacity =
    0.78 +
    proximity * 0.12 +
    chargeLevel * 0.1;

  ringFaceHalo.material.opacity =
    0.18 +
    proximity * 0.26 +
    chargeLevel * 0.28;

  ringFace.scale.setScalar(
    1 +
    proximity * 0.05 +
    chargeLevel * 0.07
  );

  ringFaceHalo.scale.setScalar(
    1 +
    proximity * 0.1 +
    chargeLevel * 0.14
  );

  ringBand.material.emissiveIntensity =
    0.2 +
    proximity * 0.35 +
    chargeLevel * 0.7;

  chargeLight.position.copy(
    getChargeSocketWorld()
  );

  chargeLight.intensity =
    1.6 +
    proximity * 2.4 +
    chargeLevel * 5;

  contactLight.position.copy(
    getChargeSocketWorld()
  );

  contactLight.intensity =
    proximity * 2 +
    (isSnapped ? 2.5 : 0) +
    (isHolding ? 2.5 : 0) +
    chargeLevel * 4.5;

  bloomPass.strength =
    0.95 +
    proximity * 0.35 +
    chargeLevel * 0.95;

  bloomPass.radius =
    0.5 +
    chargeLevel * 0.18;

  ambient.style.opacity =
    String(
      0.12 +
      proximity * 0.08 +
      chargeLevel * 0.25
    );

  floorGlow.style.opacity =
    String(
      0.12 +
      proximity * 0.08 +
      chargeLevel * 0.32
    );

  floorGlow.style.width =
    `${390 + chargeLevel * 220}px`;

  if (isHolding) {
    battery.rotation.z =
      (Math.random() - 0.5) *
      chargeLevel *
      0.0025;
  } else {
    battery.rotation.z *= 0.84;
  }

  /*
    Progressive oath reveal
  */
  const thresholds = [14, 43, 72];

  oathLines.forEach((line, index) => {
    line.classList.toggle(
      "visible",
      charge >= thresholds[index]
    );
  });

  /*
    Store a brightness value in the
    lens material without turning
    it into a flat white disc.
  */
  batteryLens.material.color.setRGB(
    0.15 * lensIntensity,
    0.62 * lensIntensity,
    0.27 * lensIntensity
  );
}

/* ===================================== */
/* PARTICLES                             */
/* ===================================== */

function createParticle() {
  const ringPos =
    worldToScreen(ring.position);

  const socketPos =
    worldToScreen(
      getChargeSocketWorld()
    );

  const particle =
    document.createElement("span");

  particle.className = "particle";

  const startX =
    ringPos.x +
    (Math.random() - 0.5) * 12;

  const startY =
    ringPos.y +
    (Math.random() - 0.5) * 12;

  particle.style.left =
    `${startX}px`;

  particle.style.top =
    `${startY}px`;

  particle.style.setProperty(
    "--moveX",
    `${
      socketPos.x -
      startX +
      (Math.random() - 0.5) * 14
    }px`
  );

  particle.style.setProperty(
    "--moveY",
    `${
      socketPos.y -
      startY +
      (Math.random() - 0.5) * 14
    }px`
  );

  particle.style.setProperty(
    "--duration",
    `${0.34 + Math.random() * 0.32}s`
  );

  particlesContainer.appendChild(
    particle
  );

  setTimeout(
    () => particle.remove(),
    850
  );
}

function createSocketSpark() {
  const socket =
    worldToScreen(
      getChargeSocketWorld()
    );

  const particle =
    document.createElement("span");

  particle.className = "particle";

  particle.style.left =
    `${socket.x + (Math.random() - 0.5) * 8}px`;

  particle.style.top =
    `${socket.y + (Math.random() - 0.5) * 8}px`;

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

  particlesContainer.appendChild(
    particle
  );

  setTimeout(
    () => particle.remove(),
    450
  );
}

/* ===================================== */
/* DUST                                  */
/* ===================================== */

function createDust() {
  for (let i = 0; i < 48; i++) {
    const dot =
      document.createElement("span");

    dot.className =
      "dust-particle";

    const size =
      1 + Math.random() * 2;

    dot.style.left =
      `${Math.random() * 100}%`;

    dot.style.top =
      `${Math.random() * 100}%`;

    dot.style.setProperty(
      "--size",
      `${size}px`
    );

    dot.style.setProperty(
      "--duration",
      `${5 + Math.random() * 8}s`
    );

    dot.style.setProperty(
      "--dx",
      `${-35 + Math.random() * 70}px`
    );

    dot.style.setProperty(
      "--dy",
      `${-50 + Math.random() * 100}px`
    );

    dot.style.animationDelay =
      `${Math.random() * 7}s`;

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

  progressText.textContent =
    "100%";

  instruction.textContent =
    "Charge complete";

  beam.classList.remove("visible");
  beamBlur.classList.remove("visible");

  batteryLens.scale.setScalar(1.12);
  batteryLensHalo.scale.setScalar(1.22);

  batteryInner.material.emissiveIntensity = 4.5;
  batteryBody.material.emissiveIntensity = 1.35;

  ringFace.scale.setScalar(1.12);
  ringFaceHalo.scale.setScalar(1.2);

  chargeLight.intensity = 9;
  contactLight.intensity = 7;

  bloomPass.strength = 2.25;
  bloomPass.radius = 0.72;

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
    line.classList.remove("visible");
  });

  batteryLens.scale.setScalar(1);
  batteryLensHalo.scale.setScalar(1);
  ringFace.scale.setScalar(1);
  ringFaceHalo.scale.setScalar(1);

  batteryInner.material.emissiveIntensity = 1.2;
  batteryInner.material.opacity = 0.28;
  batteryBody.material.emissiveIntensity = 0.45;

  ringBand.material.emissiveIntensity = 0.25;

  bloomPass.strength = 1.05;
  bloomPass.radius = 0.62;

  chargeLight.intensity = 1.8;
  contactLight.intensity = 0;

  instruction.textContent =
    "Bring the ring to the battery";
});

/* ===================================== */
/* RESIZE                                */
/* ===================================== */

window.addEventListener("resize", () => {
  camera.aspect =
    window.innerWidth /
    window.innerHeight;

  camera.updateProjectionMatrix();

  renderer.setSize(
    window.innerWidth,
    window.innerHeight
  );

  composer.setSize(
    window.innerWidth,
    window.innerHeight
  );

  bloomPass.setSize(
    window.innerWidth,
    window.innerHeight
  );
});

/* ===================================== */
/* ANIMATION                             */
/* ===================================== */

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const time =
    clock.getElapsedTime();

  updateRing(time);
  updateBeam();
  updateCharge();

  battery.position.y =
    -0.05 +
    Math.sin(time * 0.85) *
    0.008;

  /*
    Energy is alive, but not flashing.
  */
  const idlePulse =
    1 +
    Math.sin(time * 2.2) *
    0.015;

  if (!isHolding && charge < 2) {
    batteryLens.scale.setScalar(idlePulse);
    ringFace.scale.setScalar(
      1 +
      Math.sin(time * 2.7) *
      0.008
    );
  }

  composer.render();
}

animate();
