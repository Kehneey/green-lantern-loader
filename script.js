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

const BATTERY_ROTATION = new THREE.Euler(
  0,
  Math.PI,
  0
);

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
let batteryCoreGlow = null;

let ringGlow = null;
let ringCoreGlow = null;

let batterySize = new THREE.Vector3(
  1,
  1,
  1
);

let ringTargetScale = 1;

let loadedModels = 0;

let mouseX =
  window.innerWidth / 2;

let mouseY =
  window.innerHeight / 2;

let smoothX =
  mouseX;

let smoothY =
  mouseY;

let isNearBattery = false;
let isSnapped = false;
let isHolding = false;

let charge = 0;
let completed = false;

let attractionLevel = 0;


/* ===================================== */
/* SCENE                                 */
/* ===================================== */

const scene =
  new THREE.Scene();


const camera =
  new THREE.PerspectiveCamera(
    34,
    window.innerWidth /
      window.innerHeight,
    0.1,
    100
  );


camera.position.set(
  0,
  0.05,
  7.6
);


const renderer =
  new THREE.WebGLRenderer({
    antialias: true,
    alpha: true
  });


renderer.setSize(
  window.innerWidth,
  window.innerHeight
);


renderer.setPixelRatio(
  Math.min(
    window.devicePixelRatio,
    2
  )
);


renderer.setClearColor(
  0x000000,
  0
);


renderer.outputColorSpace =
  THREE.SRGBColorSpace;


renderer.toneMapping =
  THREE.ACESFilmicToneMapping;


renderer.toneMappingExposure =
  2.35;


stage.appendChild(
  renderer.domElement
);


/* ===================================== */
/* LIGHTING                              */
/* ===================================== */

scene.add(
  new THREE.AmbientLight(
    0xa8ffbf,
    3.2
  )
);


scene.add(
  new THREE.HemisphereLight(
    0xf3fff7,
    0x06331c,
    6.2
  )
);


const keyLight =
  new THREE.DirectionalLight(
    0xffffff,
    10.5
  );


keyLight.position.set(
  4.8,
  6.8,
  7.2
);


scene.add(
  keyLight
);


const fillLight =
  new THREE.DirectionalLight(
    0xc6ffd8,
    6.2
  );


fillLight.position.set(
  -4.8,
  2.6,
  5.6
);


scene.add(
  fillLight
);


const rimLight =
  new THREE.DirectionalLight(
    0x3dff86,
    8.2
  );


rimLight.position.set(
  -2.5,
  4.2,
  -3.8
);


scene.add(
  rimLight
);


const frontLight =
  new THREE.PointLight(
    0xffffff,
    8.5,
    40,
    2
  );


frontLight.position.set(
  0,
  1.1,
  6.8
);


scene.add(
  frontLight
);


/*
  Main energy light
*/

const energyLight =
  new THREE.PointLight(
    0x30ff78,
    5.5,
    22,
    2
  );


energyLight.position.set(
  0,
  0.08,
  1.45
);


scene.add(
  energyLight
);


/*
  Contact flare
*/

const contactLight =
  new THREE.PointLight(
    0xb8ffcc,
    0,
    14,
    2
  );


contactLight.position.set(
  0,
  0.08,
  1.55
);


scene.add(
  contactLight
);


/* ===================================== */
/* LOADER                                */
/* ===================================== */

const gltfLoader =
  new GLTFLoader();


/* ===================================== */
/* NORMALIZATION                         */
/* ===================================== */

function normalizeObject(
  object,
  targetSize,
  mode = "height"
) {

  const box =
    new THREE.Box3()
      .setFromObject(
        object
      );


  const size =
    new THREE.Vector3();


  box.getSize(
    size
  );


  const center =
    new THREE.Vector3();


  box.getCenter(
    center
  );


  object.position.sub(
    center
  );


  const source =

    mode === "height"

      ? size.y

      : Math.max(
          size.x,
          size.y,
          size.z
        );


  const scale =
    targetSize /
    source;


  object.scale.setScalar(
    scale
  );


  return {

    scale,

    size:
      size
        .clone()
        .multiplyScalar(
          scale
        )

  };
}


/* ===================================== */
/* MATERIALS                             */
/* ===================================== */

function prepareModelMaterials(
  object,
  isRing = false
) {

  object.traverse(
    child => {

      if (
        !child.isMesh
      )
        return;


      child.material =
        new THREE.MeshStandardMaterial({

          color:
            isRing
              ? 0x53ff8d
              : 0x2dd36f,

          metalness:
            isRing
              ? 0.18
              : 0.12,

          roughness:
            isRing
              ? 0.38
              : 0.42,

          emissive:
            isRing
              ? 0x16a34a
              : 0x0f8a3b,

          emissiveIntensity:
            isRing
              ? 1.8
              : 1.45

        });


      child.castShadow =
        false;


      child.receiveShadow =
        false;

    }

  );
}


function setEmissiveIntensity(
  object,
  value
) {

  if (
    !object
  )
    return;


  object.traverse(
    child => {

      if (
        child.isMesh &&
        child.material &&
        "emissiveIntensity"
          in child.material
      ) {

        child.material
          .emissiveIntensity =
          value;

      }

    }

  );
}


/* ===================================== */
/* STATUS                                */
/* ===================================== */

function setStatus(
  text,
  state = ""
) {

  if (
    !modelStatus
  )
    return;


  modelStatus.textContent =
    text;


  modelStatus
    .classList
    .remove(
      "ready",
      "error"
    );


  if (
    state
  ) {

    modelStatus
      .classList
      .add(
        state
      );

  }

}


function markLoaded() {

  loadedModels += 1;


  if (
    loadedModels === 2
  ) {

    setStatus(
      "Models ready",
      "ready"
    );

  }

}


function markError(
  label,
  error
) {

  console.error(
    `${label} failed to load`,
    error
  );


  setStatus(
    `${label} failed to load`,
    "error"
  );

}


/* ===================================== */
/* LOAD BATTERY                          */
/* ===================================== */

gltfLoader.load(

  BATTERY_MODEL,

  gltf => {

    battery =
      gltf.scene;


    prepareModelMaterials(
      battery,
      false
    );


    const info =
      normalizeObject(
        battery,
        3.75,
        "height"
      );


    batterySize.copy(
      info.size
    );


    battery.position.set(
      0,
      -0.1,
      0
    );


    battery.rotation.copy(
      BATTERY_ROTATION
    );


    scene.add(
      battery
    );


    createBatteryGlow();


    markLoaded();

  },


  undefined,


  error =>
    markError(
      "Battery",
      error
    )

);


/* ===================================== */
/* LOAD RING                             */
/* ===================================== */

gltfLoader.load(

  RING_MODEL,

  gltf => {

    ring =
      gltf.scene;


    prepareModelMaterials(
      ring,
      true
    );


    const info =
      normalizeObject(
        ring,
        0.82,
        "largest"
      );


    ringTargetScale =
      info.scale;


    ring.position.set(
      -2.15,
      0.82,
      2.15
    );


    ring.rotation.copy(
      RING_IDLE_ROT
    );


    scene.add(
      ring
    );


    createRingGlow();


    markLoaded();

  },


  undefined,


  error =>
    markError(
      "Ring",
      error
    )

);


/* ===================================== */
/* RADIAL GLOW TEXTURE                   */
/* ===================================== */

function createRadialGlowTexture() {

  const canvas =
    document.createElement(
      "canvas"
    );


  canvas.width =
    256;


  canvas.height =
    256;


  const ctx =
    canvas.getContext(
      "2d"
    );


  const gradient =
    ctx.createRadialGradient(

      128,
      128,
      0,

      128,
      128,
      128

    );


  gradient.addColorStop(
    0,
    "rgba(255,255,255,1)"
  );


  gradient.addColorStop(
    0.09,
    "rgba(230,255,238,1)"
  );


  gradient.addColorStop(
    0.2,
    "rgba(150,255,185,.98)"
  );


  gradient.addColorStop(
    0.38,
    "rgba(50,255,120,.82)"
  );


  gradient.addColorStop(
    0.65,
    "rgba(0,255,102,.35)"
  );


  gradient.addColorStop(
    1,
    "rgba(0,255,102,0)"
  );


  ctx.fillStyle =
    gradient;


  ctx.fillRect(
    0,
    0,
    256,
    256
  );


  const texture =
    new THREE.CanvasTexture(
      canvas
    );


  texture.colorSpace =
    THREE.SRGBColorSpace;


  return texture;

}


/* ===================================== */
/* BATTERY GLOW                          */
/* ===================================== */

function createBatteryGlow() {

  const texture =
    createRadialGlowTexture();


  const auraMaterial =
    new THREE.SpriteMaterial({

      map:
        texture,

      color:
        0x4dff91,

      transparent:
        true,

      opacity:
        0.68,

      depthWrite:
        false,

      depthTest:
        false,

      blending:
        THREE.AdditiveBlending

    });


  const coreMaterial =
    new THREE.SpriteMaterial({

      map:
        texture,

      color:
        0xf3fff7,

      transparent:
        true,

      opacity:
        1,

      depthWrite:
        false,

      depthTest:
        false,

      blending:
        THREE.AdditiveBlending

    });


  batteryGlow =
    new THREE.Sprite(
      auraMaterial
    );


  batteryCoreGlow =
    new THREE.Sprite(
      coreMaterial
    );


  batteryGlow.renderOrder =
    1000;


  batteryCoreGlow.renderOrder =
    1001;


  batteryGlow.scale.set(
    2.8,
    2.8,
    1
  );


  batteryCoreGlow.scale.set(
    1.15,
    1.15,
    1
  );


  scene.add(
    batteryGlow
  );


  scene.add(
    batteryCoreGlow
  );

}


/* ===================================== */
/* RING GLOW                             */
/* ===================================== */

function createRingGlow() {

  const texture =
    createRadialGlowTexture();


  const auraMaterial =
    new THREE.SpriteMaterial({

      map:
        texture,

      color:
        0x4dff91,

      transparent:
        true,

      opacity:
        0.58,

      depthWrite:
        false,

      depthTest:
        false,

      blending:
        THREE.AdditiveBlending

    });


  const coreMaterial =
    new THREE.SpriteMaterial({

      map:
        texture,

      color:
        0xf3fff7,

      transparent:
        true,

      opacity:
        1,

      depthWrite:
        false,

      depthTest:
        false,

      blending:
        THREE.AdditiveBlending

    });


  ringGlow =
    new THREE.Sprite(
      auraMaterial
    );


  ringCoreGlow =
    new THREE.Sprite(
      coreMaterial
    );


  ringGlow.renderOrder =
    1002;


  ringCoreGlow.renderOrder =
    1003;


  ringGlow.scale.set(
    0.95,
    0.95,
    1
  );


  ringCoreGlow.scale.set(
    0.42,
    0.42,
    1
  );


  scene.add(
    ringGlow
  );


  scene.add(
    ringCoreGlow
  );

}


/* ===================================== */
/* INPUT                                 */
/* ===================================== */

window.addEventListener(
  "mousemove",

  event => {

    mouseX =
      event.clientX;


    mouseY =
      event.clientY;

  }

);


window.addEventListener(
  "mousedown",

  () => {

    if (
      isSnapped &&
      !completed
    ) {

      isHolding =
        true;


      instruction.textContent =
        "Hold the ring steady";

    }

  }

);


window.addEventListener(
  "mouseup",

  () => {

    isHolding =
      false;


    if (
      !completed
    ) {

      instruction.textContent =

        isSnapped

          ? "Press and hold to charge"

          : "Bring the ring to the battery";

    }

  }

);


window.addEventListener(
  "mouseleave",

  () => {

    isHolding =
      false;

  }

);


/* ===================================== */
/* SCREEN → WORLD                        */
/* ===================================== */

function screenToWorld(
  x,
  y,
  zPlane = 2.2
) {

  const ndc =
    new THREE.Vector3(

      (
        x /
        window.innerWidth
      ) * 2 - 1,

      -(
        y /
        window.innerHeight
      ) * 2 + 1,

      0.5

    );


  ndc.unproject(
    camera
  );


  const direction =
    ndc
      .sub(
        camera.position
      )
      .normalize();


  const distance =
    (
      zPlane -
      camera.position.z
    ) /
    direction.z;


  return camera.position
    .clone()
    .add(
      direction
        .multiplyScalar(
          distance
        )
    );

}


/* ===================================== */
/* WORLD → SCREEN                        */
/* ===================================== */

function worldToScreen(
  position
) {

  const projected =
    position
      .clone()
      .project(
        camera
      );


  return {

    x:
      (
        (
          projected.x +
          1
        ) / 2
      ) *
      window.innerWidth,


    y:
      (
        (
          1 -
          projected.y
        ) / 2
      ) *
      window.innerHeight

  };

}


/* ===================================== */
/* FRONT POSITIONS                       */
/* ===================================== */

function getBatteryFrontWorld() {

  if (
    !battery
  )
    return new THREE.Vector3();


  const point =
    new THREE.Vector3(

      0,

      0.02,

      -batterySize.z *
      0.56

    );


  return battery
    .localToWorld(
      point
    );

}


function getChargeSocketWorld() {

  return getBatteryFrontWorld();

}


function getRingFrontWorld() {

  if (
    !ring
  )
    return new THREE.Vector3();


  const point =
    new THREE.Vector3(
      0,
      0,
      -0.24
    );


  return ring
    .localToWorld(
      point
    );

}


/* ===================================== */
/* FRONT GLOW POSITIONING                */
/* ===================================== */

function updateFrontGlows() {

  if (
    batteryGlow &&
    batteryCoreGlow &&
    battery
  ) {

    const point =
      getBatteryFrontWorld();


    const towardCamera =
      camera.position
        .clone()
        .sub(
          point
        )
        .normalize();


    batteryGlow
      .position
      .copy(
        point
      )
      .addScaledVector(
        towardCamera,
        0.08
      );


    batteryCoreGlow
      .position
      .copy(
        point
      )
      .addScaledVector(
        towardCamera,
        0.12
      );

  }


  if (
    ringGlow &&
    ringCoreGlow &&
    ring
  ) {

    const point =
      getRingFrontWorld();


    const towardCamera =
      camera.position
        .clone()
        .sub(
          point
        )
        .normalize();


    ringGlow
      .position
      .copy(
        point
      )
      .addScaledVector(
        towardCamera,
        0.04
      );


    ringCoreGlow
      .position
      .copy(
        point
      )
      .addScaledVector(
        towardCamera,
        0.06
      );

  }

}


/* ===================================== */
/* RING MOVEMENT                         */
/* ===================================== */

function updateRing(
  time
) {

  if (
    !ring ||
    !battery ||
    completed
  )
    return;


  smoothX +=

    (
      mouseX -
      smoothX
    ) *

    0.16;


  smoothY +=

    (
      mouseY -
      smoothY
    ) *

    0.16;


  const socketWorld =
    getChargeSocketWorld();


  const socketScreen =
    worldToScreen(
      socketWorld
    );


  const dx =
    smoothX -
    socketScreen.x;


  const dy =
    smoothY -
    socketScreen.y;


  const distance =
    Math.hypot(
      dx,
      dy
    );


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
    (
      3 -
      2 *
      attraction
    );


  if (
    isSnapped
  ) {

    attraction =
      0.985;

  }


  attractionLevel =
    attraction;


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


  let targetWorld =

    screenToWorld(

      visualX,

      visualY,

      2.2

    );


  if (
    isSnapped
  ) {

    targetWorld =
      socketWorld
        .clone()
        .add(

          new THREE.Vector3(

            0,

            0.01,

            0.16

          )

        );

  }


  ring.position.lerp(

    targetWorld,

    isSnapped
      ? 0.24
      : 0.22

  );


  const targetRotation =

    isNearBattery

      ? RING_SNAP_ROT

      : RING_IDLE_ROT;


  ring.rotation.x =

    THREE.MathUtils.lerp(

      ring.rotation.x,

      targetRotation.x,

      0.08

    );


  ring.rotation.y =

    THREE.MathUtils.lerp(

      ring.rotation.y,

      targetRotation.y,

      0.08

    );


  ring.rotation.z =

    THREE.MathUtils.lerp(

      ring.rotation.z,

      targetRotation.z +

      (
        !isNearBattery

          ? Math.sin(
              time *
              2.4
            ) *
            0.03

          : 0
      ),

      0.08

    );


  const pulse =

    isSnapped

      ? 1 +
        Math.sin(
          time *
          8
        ) *
        0.03

      : 1 +
        Math.sin(
          time *
          2.8
        ) *
        0.01;


  ring.scale.setScalar(

    ringTargetScale *
    pulse

  );


  if (
    charge <= 0
  ) {

    instruction.textContent =

      isSnapped

        ? "Press and hold to charge"

        : isNearBattery

          ? "The lantern is pulling the ring in"

          : "Bring the ring to the battery";

  }

}


/* ===================================== */
/* ENERGY BEAM                           */
/* ===================================== */

function updateBeam() {

  if (
    !battery ||
    !ring
  )
    return;


  const socket =
    worldToScreen(
      getChargeSocketWorld()
    );


  const ringScreen =
    worldToScreen(
      ring.position
        .clone()
    );


  [
    beam,
    beamBlur
  ].forEach(
    line => {

      line.setAttribute(
        "x1",
        ringScreen.x
      );


      line.setAttribute(
        "y1",
        ringScreen.y
      );


      line.setAttribute(
        "x2",
        socket.x
      );


      line.setAttribute(
        "y2",
        socket.y
      );

    }

  );


  let beamStrength =

    attractionLevel *
    0.55;


  if (
    isSnapped
  ) {

    beamStrength =
      0.78;

  }


  if (
    isHolding &&
    isSnapped
  ) {

    beamStrength =
      1;

  }


  beam.classList.toggle(

    "visible",

    beamStrength >
    0.03

  );


  beamBlur.classList.toggle(

    "visible",

    beamStrength >
    0.03

  );


  beam.style.opacity =
    `${beamStrength}`;


  beamBlur.style.opacity =

    `${

      Math.min(
        1,
        beamStrength *
        0.9
      )

    }`;

}


/* ===================================== */
/* CHARGE                                */
/* ===================================== */

function updateCharge() {

  if (
    completed
  )
    return;


  if (
    isHolding &&
    isSnapped
  ) {

    charge +=
      CHARGE_SPEED;


    if (
      Math.random() >
      0.48
    ) {

      createParticle();

    }


    if (
      Math.random() >
      0.75
    ) {

      createSocketSpark();

    }

  }

  else {

    charge -=
      DRAIN_SPEED;

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


  if (
    charge >= 100
  ) {

    finishCharge();

  }

}


/* ===================================== */
/* ENERGY VISUALS                        */
/* ===================================== */

function updateEnergyVisuals() {

  const chargeLevel =
    charge /
    100;


  const proximity =
    attractionLevel;


  const socketWorld =
    getChargeSocketWorld();


  const towardCamera =
    camera.position
      .clone()
      .sub(
        socketWorld
      )
      .normalize();


  energyLight
    .position
    .copy(
      socketWorld
    )
    .addScaledVector(
      towardCamera,
      0.18
    );


  contactLight
    .position
    .copy(
      socketWorld
    )
    .addScaledVector(
      towardCamera,
      0.26
    );


  energyLight.intensity =

    5.5 +

    proximity *
    7 +

    chargeLevel *
    14;


  energyLight.distance =

    20 +

    proximity *
    5 +

    chargeLevel *
    12;


  contactLight.intensity =

    proximity *
    8 +

    (
      isSnapped
        ? 6
        : 0
    ) +

    (
      isHolding
        ? 7
        : 0
    ) +

    chargeLevel *
    12;


  contactLight.distance =

    8 +

    proximity *
    3 +

    chargeLevel *
    6;


  if (
    batteryGlow
  ) {

    batteryGlow.material.opacity =

      0.68 +

      proximity *
      0.18 +

      chargeLevel *
      0.16;


    const auraScale =

      2.8 +

      proximity *
      0.5 +

      chargeLevel *
      1.3;


    batteryGlow.scale.set(

      auraScale,

      auraScale,

      1

    );

  }


  if (
    batteryCoreGlow
  ) {

    batteryCoreGlow.material.opacity =
      1;


    const coreScale =

      1.15 +

      proximity *
      0.18 +

      chargeLevel *
      0.38;


    batteryCoreGlow.scale.set(

      coreScale,

      coreScale,

      1

    );

  }


  if (
    ringGlow
  ) {

    ringGlow.material.opacity =

      0.58 +

      proximity *
      0.2 +

      chargeLevel *
      0.14;


    const ringAuraScale =

      0.95 +

      proximity *
      0.2 +

      chargeLevel *
      0.22;


    ringGlow.scale.set(

      ringAuraScale,

      ringAuraScale,

      1

    );

  }


  if (
    ringCoreGlow
  ) {

    ringCoreGlow.material.opacity =
      1;


    const ringCoreScale =

      0.42 +

      proximity *
      0.08 +

      chargeLevel *
      0.14;


    ringCoreGlow.scale.set(

      ringCoreScale,

      ringCoreScale,

      1

    );

  }


  setEmissiveIntensity(

    battery,

    1.8 +

    proximity *
    1.2 +

    chargeLevel *
    2.2

  );


  setEmissiveIntensity(

    ring,

    2.1 +

    proximity *
    1.4 +

    chargeLevel *
    2.4

  );


  ambient.style.opacity =

    `${

      0.28 +

      proximity *
      0.22 +

      chargeLevel *
      0.5

    }`;


  ambient.style.transform =

    `scale(${

      1 +

      proximity *
      0.08 +

      chargeLevel *
      0.22

    })`;


  floorGlow.style.opacity =

    `${

      0.28 +

      proximity *
      0.22 +

      chargeLevel *
      0.5

    }`;


  floorGlow.style.width =

    `${

      500 +

      proximity *
      100 +

      chargeLevel *
      340

    }px`;


  if (
    battery &&
    isHolding
  ) {

    battery.rotation.z =

      (
        Math.random() -
        0.5
      ) *

      (
        0.003 +
        chargeLevel *
        0.004
      );

  }

  else if (
    battery
  ) {

    battery.rotation.z *=
      0.82;

  }


  const thresholds =
    [
      17,
      45,
      71
    ];


  oathLines.forEach(

    (
      line,
      index
    ) => {

      line.classList.toggle(

        "visible",

        charge >=
        thresholds[index]

      );

    }

  );

}


/* ===================================== */
/* PARTICLES                             */
/* ===================================== */

function createParticle() {

  if (
    !ring ||
    !battery
  )
    return;


  const ringPos =
    worldToScreen(
      ring.position
        .clone()
    );


  const socketPos =
    worldToScreen(
      getChargeSocketWorld()
    );


  const particle =
    document.createElement(
      "span"
    );


  particle.className =
    "particle";


  const startX =

    ringPos.x +

    (
      Math.random() -
      0.5
    ) *
    14;


  const startY =

    ringPos.y +

    (
      Math.random() -
      0.5
    ) *
    14;


  particle.style.left =
    `${startX}px`;


  particle.style.top =
    `${startY}px`;


  particle.style.setProperty(

    "--moveX",

    `${

      socketPos.x -
      startX +

      (
        Math.random() -
        0.5
      ) *
      18

    }px`

  );


  particle.style.setProperty(

    "--moveY",

    `${

      socketPos.y -
      startY +

      (
        Math.random() -
        0.5
      ) *
      18

    }px`

  );


  particle.style.setProperty(

    "--duration",

    `${

      0.32 +

      Math.random() *
      0.35

    }s`

  );


  particlesContainer
    .appendChild(
      particle
    );


  setTimeout(

    () =>
      particle.remove(),

    900

  );

}


/* ===================================== */
/* CONTACT SPARKS                        */
/* ===================================== */

function createSocketSpark() {

  if (
    !battery
  )
    return;


  const socketPos =
    worldToScreen(
      getChargeSocketWorld()
    );


  const particle =
    document.createElement(
      "span"
    );


  particle.className =
    "particle";


  particle.style.left =

    `${

      socketPos.x +

      (
        Math.random() -
        0.5
      ) *
      10

    }px`;


  particle.style.top =

    `${

      socketPos.y +

      (
        Math.random() -
        0.5
      ) *
      10

    }px`;


  particle.style.setProperty(

    "--moveX",

    `${

      (
        Math.random() -
        0.5
      ) *
      40

    }px`

  );


  particle.style.setProperty(

    "--moveY",

    `${

      (
        Math.random() -
        0.5
      ) *
      40

    }px`

  );


  particle.style.setProperty(

    "--duration",

    `${

      0.2 +

      Math.random() *
      0.2

    }s`

  );


  particlesContainer
    .appendChild(
      particle
    );


  setTimeout(

    () =>
      particle.remove(),

    500

  );

}


/* ===================================== */
/* DUST                                  */
/* ===================================== */

function createDust() {

  for (
    let i = 0;
    i < 55;
    i++
  ) {

    const dot =
      document.createElement(
        "span"
      );


    dot.className =
      "dust-particle";


    const size =

      1 +

      Math.random() *
      2.2;


    dot.style.left =

      `${

        Math.random() *
        100

      }%`;


    dot.style.top =

      `${

        Math.random() *
        100

      }%`;


    dot.style.setProperty(

      "--size",

      `${size}px`

    );


    dot.style.setProperty(

      "--duration",

      `${

        4 +

        Math.random() *
        8

      }s`

    );


    dot.style.setProperty(

      "--dx",

      `${

        -35 +

        Math.random() *
        70

      }px`

    );


    dot.style.setProperty(

      "--dy",

      `${

        -50 +

        Math.random() *
        100

      }px`

    );


    dot.style.animationDelay =

      `${

        Math.random() *
        7

      }s`;


    dustContainer
      .appendChild(
        dot
      );

  }

}


createDust();


/* ===================================== */
/* COMPLETE                              */
/* ===================================== */

function finishCharge() {

  completed =
    true;


  isHolding =
    false;


  charge =
    100;


  progressText.textContent =
    "100%";


  beam.classList.remove(
    "visible"
  );


  beamBlur.classList.remove(
    "visible"
  );


  instruction.textContent =
    "Charge complete";


  energyLight.intensity =
    28;


  energyLight.distance =
    28;


  contactLight.intensity =
    22;


  contactLight.distance =
    14;


  if (
    batteryGlow
  ) {

    batteryGlow.material.opacity =
      1;


    batteryGlow.scale.set(

      4.8,

      4.8,

      1

    );

  }


  if (
    batteryCoreGlow
  ) {

    batteryCoreGlow.material.opacity =
      1;


    batteryCoreGlow.scale.set(

      1.8,

      1.8,

      1

    );

  }


  if (
    ringGlow
  ) {

    ringGlow.material.opacity =
      1;


    ringGlow.scale.set(

      1.5,

      1.5,

      1

    );

  }


  if (
    ringCoreGlow
  ) {

    ringCoreGlow.material.opacity =
      1;


    ringCoreGlow.scale.set(

      0.72,

      0.72,

      1

    );

  }


  setEmissiveIntensity(

    battery,

    4.2

  );


  setEmissiveIntensity(

    ring,

    4.6

  );


  setTimeout(

    () => {

      flash
        .classList
        .add(
          "fire"
        );

    },

    280

  );


  setTimeout(

    () => {

      reveal
        .classList
        .add(
          "visible"
        );

    },

    980

  );

}


/* ===================================== */
/* RESET                                 */
/* ===================================== */

restart.addEventListener(

  "click",

  () => {

    completed =
      false;


    isHolding =
      false;


    charge =
      0;


    attractionLevel =
      0;


    reveal
      .classList
      .remove(
        "visible"
      );


    flash
      .classList
      .remove(
        "fire"
      );


    beam
      .classList
      .remove(
        "visible"
      );


    beamBlur
      .classList
      .remove(
        "visible"
      );


    beam.style.opacity =
      "0";


    beamBlur.style.opacity =
      "0";


    oathLines.forEach(
      line => {

        line
          .classList
          .remove(
            "visible"
          );

      }
    );


    instruction.textContent =
      "Bring the ring to the battery";


    energyLight.intensity =
      5.5;


    energyLight.distance =
      22;


    contactLight.intensity =
      0;


    contactLight.distance =
      8;


    if (
      batteryGlow
    ) {

      batteryGlow.material.opacity =
        0.68;


      batteryGlow.scale.set(

        2.8,

        2.8,

        1

      );

    }


    if (
      batteryCoreGlow
    ) {

      batteryCoreGlow.material.opacity =
        1;


      batteryCoreGlow.scale.set(

        1.15,

        1.15,

        1

      );

    }


    if (
      ringGlow
    ) {

      ringGlow.material.opacity =
        0.58;


      ringGlow.scale.set(

        0.95,

        0.95,

        1

      );

    }


    if (
      ringCoreGlow
    ) {

      ringCoreGlow.material.opacity =
        1;


      ringCoreGlow.scale.set(

        0.42,

        0.42,

        1

      );

    }


    setEmissiveIntensity(

      battery,

      1.8

    );


    setEmissiveIntensity(

      ring,

      2.1

    );

  }

);


/* ===================================== */
/* RESIZE                                */
/* ===================================== */

window.addEventListener(

  "resize",

  () => {

    camera.aspect =

      window.innerWidth /
      window.innerHeight;


    camera.updateProjectionMatrix();


    renderer.setSize(

      window.innerWidth,

      window.innerHeight

    );

  }

);


/* ===================================== */
/* ANIMATE                               */
/* ===================================== */

const clock =
  new THREE.Clock();


function animate() {

  requestAnimationFrame(
    animate
  );


  const time =
    clock.getElapsedTime();


  updateRing(
    time
  );


  updateFrontGlows();


  updateBeam();


  updateCharge();


  if (
    battery &&
    !completed
  ) {

    battery.position.y =

      -0.1 +

      Math.sin(
        time *
        0.9
      ) *

      0.012;

  }


  renderer.render(

    scene,

    camera

  );

}


animate();
