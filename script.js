/* =========================================================
   GREEN LANTERN CINEMATIC LOADER
========================================================= */


/* =========================================================
   ELEMENTS
========================================================= */

const loader =
  document.getElementById("loader");

const cursor =
  document.getElementById("cursorRing");

const lantern =
  document.getElementById("lantern");

const lanternWrap =
  document.getElementById("lanternWrap");

const lanternSymbol =
  document.getElementById("lanternSymbol");

const core =
  document.querySelector(".lantern-core");

const frontLight =
  document.getElementById("lanternFrontLight");

const backLight =
  document.querySelector(".lantern-backlight");

const outerAura =
  document.querySelector(".outer-aura");

const ambient =
  document.getElementById("ambient");

const floorGlow =
  document.getElementById("floorGlow");

const instruction =
  document.getElementById("instruction");

const progressText =
  document.getElementById("progressText");

const particlesContainer =
  document.getElementById("particles");

const dustContainer =
  document.getElementById("dust");

const oathLines =
  [...document.querySelectorAll(".oath-line")];

const beam =
  document.getElementById("beam");

const beamBlur =
  document.getElementById("beamBlur");

const flash =
  document.getElementById("flash");

const reveal =
  document.getElementById("reveal");

const restart =
  document.getElementById("restart");


/* =========================================================
   STATE
========================================================= */

let mouseX =
  window.innerWidth / 2;

let mouseY =
  window.innerHeight / 2;

let cursorX =
  mouseX;

let cursorY =
  mouseY;

let hoveringLantern =
  false;

let mouseDown =
  false;

let charge =
  0;

let completed =
  false;


/* =========================================================
   SETTINGS
========================================================= */

const CHARGE_SPEED =
  0.34;

const DRAIN_SPEED =
  0.085;

const INTERACTION_RADIUS =
  115;

const CURSOR_SMOOTHING =
  0.18;


/* =========================================================
   MOUSE
========================================================= */

window.addEventListener(
  "mousemove",
  (event) => {

    mouseX =
      event.clientX;

    mouseY =
      event.clientY;

  }
);


/* =========================================================
   CURSOR ANIMATION
========================================================= */

function animateCursor() {

  cursorX +=
    (mouseX - cursorX)
    * CURSOR_SMOOTHING;

  cursorY +=
    (mouseY - cursorY)
    * CURSOR_SMOOTHING;


  cursor.style.left =
    `${cursorX}px`;

  cursor.style.top =
    `${cursorY}px`;


  checkLanternDistance();

  updateBeam();

  requestAnimationFrame(
    animateCursor
  );

}

animateCursor();


/* =========================================================
   LANTERN CENTER
========================================================= */

function getLanternCenter() {

  const rect =
    lantern.getBoundingClientRect();

  return {

    x:
      rect.left
      + rect.width / 2,

    y:
      rect.top
      + rect.height * 0.575

  };

}


/* =========================================================
   DISTANCE / MAGNETIC ATTRACTION
========================================================= */

function checkLanternDistance() {

  if (completed) {
    return;
  }


  const center =
    getLanternCenter();


  const dx =
    mouseX - center.x;

  const dy =
    mouseY - center.y;


  const distance =
    Math.sqrt(
      dx * dx +
      dy * dy
    );


  hoveringLantern =
    distance <
    INTERACTION_RADIUS;


  if (hoveringLantern) {

    cursor.classList.add(
      "active"
    );


    if (!mouseDown) {

      instruction.textContent =
        "Press and hold to charge";

    }


  } else {

    cursor.classList.remove(
      "active"
    );


    if (
      !mouseDown &&
      charge <= 0
    ) {

      instruction.textContent =
        "Bring the ring to the battery";

    }

  }


  /* =========================================
     MAGNETIC EFFECT
  ========================================= */

  if (
    distance <
    INTERACTION_RADIUS * 1.8
  ) {

    const attraction =
      Math.max(
        0,
        1 -
        distance /
        (INTERACTION_RADIUS * 1.8)
      );


    const pull =
      attraction *
      attraction *
      0.12;


    cursorX +=
      (center.x - cursorX)
      * pull;

    cursorY +=
      (center.y - cursorY)
      * pull;

  }

}


/* =========================================================
   MOUSE DOWN
========================================================= */

window.addEventListener(
  "mousedown",
  () => {

    if (
      hoveringLantern &&
      !completed
    ) {

      mouseDown =
        true;

      lanternWrap.classList.add(
        "charging"
      );

      cursor.classList.add(
        "active"
      );

      instruction.textContent =
        "Hold the ring steady";

    }

  }
);


/* =========================================================
   MOUSE UP
========================================================= */

window.addEventListener(
  "mouseup",
  () => {

    mouseDown =
      false;

    lanternWrap.classList.remove(
      "charging"
    );


    if (!completed) {

      instruction.textContent =
        hoveringLantern
          ? "Press and hold to charge"
          : "Bring the ring to the battery";

    }

  }
);


/* =========================================================
   ENERGY BEAM
========================================================= */

function updateBeam() {

  const center =
    getLanternCenter();


  beam.setAttribute(
    "x1",
    cursorX
  );

  beam.setAttribute(
    "y1",
    cursorY
  );

  beam.setAttribute(
    "x2",
    center.x
  );

  beam.setAttribute(
    "y2",
    center.y
  );


  beamBlur.setAttribute(
    "x1",
    cursorX
  );

  beamBlur.setAttribute(
    "y1",
    cursorY
  );

  beamBlur.setAttribute(
    "x2",
    center.x
  );

  beamBlur.setAttribute(
    "y2",
    center.y
  );


  const showBeam =
    mouseDown &&
    hoveringLantern &&
    !completed;


  beam.classList.toggle(
    "visible",
    showBeam
  );

  beamBlur.classList.toggle(
    "visible",
    showBeam
  );

}


/* =========================================================
   CHARGE LOOP
========================================================= */

function chargeLoop() {

  if (!completed) {

    if (
      mouseDown &&
      hoveringLantern
    ) {

      charge +=
        CHARGE_SPEED;


      /*
       * Generate energy particles
       * while charging.
       */

      if (
        Math.random() > 0.55
      ) {

        createParticle();

      }

    } else {

      charge -=
        DRAIN_SPEED;

    }


    charge =
      Math.max(
        0,
        Math.min(
          100,
          charge
        )
      );


    updateScene();


    if (
      charge >= 100
    ) {

      completeCharge();

    }

  }


  requestAnimationFrame(
    chargeLoop
  );

}

chargeLoop();


/* =========================================================
   SCENE UPDATE
========================================================= */

function updateScene() {

  const intensity =
    charge / 100;


  /* =========================================
     TEXT
  ========================================= */

  progressText.textContent =
    `${Math.round(charge)}%`;


  /* =========================================
     FRONT LIGHT
  ========================================= */

  const frontSize =
    82 +
    intensity * 65;


  frontLight.style.width =
    `${frontSize}px`;

  frontLight.style.height =
    `${frontSize}px`;


  frontLight.style.opacity =
    0.035 +
    intensity * 0.58;


  /* =========================================
     CORE
  ========================================= */

  const coreSize =
    52 +
    intensity * 105;


  core.style.width =
    `${coreSize}px`;

  core.style.height =
    `${coreSize}px`;


  core.style.opacity =
    0.08 +
    intensity * 0.72;


  /* =========================================
     BACK LIGHT
  ========================================= */

  backLight.style.opacity =
    0.08 +
    intensity * 0.68;


  backLight.style.transform =
    `
      translate(-50%, -50%)
      scale(${1 + intensity * 0.18})
    `;


  /* =========================================
     SYMBOL
  ========================================= */

  lanternSymbol.style.opacity =
    0.08 +
    intensity * 0.92;


  lanternSymbol.style.transform =
    `
      scale(
        ${1 + intensity * 0.035}
      )
    `;


  /* =========================================
     OUTER AURA
  ========================================= */

  outerAura.style.opacity =
    intensity * 0.72;


  outerAura.style.transform =
    `
      scale(
        ${1 + intensity * 0.08}
      )
    `;


  /* =========================================
     ENVIRONMENT
  ========================================= */

  ambient.style.opacity =
    0.28 +
    intensity * 0.48;


  ambient.style.transform =
    `
      scale(
        ${1 + intensity * 0.12}
      )
    `;


  floorGlow.style.opacity =
    0.18 +
    intensity * 0.48;


  floorGlow.style.width =
    `
      ${380 + intensity * 180}px
    `;


  /* =========================================
     LANTERN PHYSICAL GLOW
  ========================================= */

  const glowRadius =
    8 +
    intensity * 24;


  const glowOpacity =
    0.06 +
    intensity * 0.28;


  lantern.style.filter =
    `
      drop-shadow(
        0 25px 34px
        rgba(0, 0, 0, 0.78)
      )

      drop-shadow(
        0 0 ${glowRadius}px
        rgba(
          0,
          255,
          102,
          ${glowOpacity}
        )
      )
    `;


  /* =========================================
     VERY SUBTLE CHARGE MOVEMENT
  ========================================= */

  if (
    mouseDown &&
    hoveringLantern
  ) {

    const shake =
      intensity * 0.35;


    lantern.style.transform =
      `
        translate(
          ${(Math.random() - 0.5) * shake}px,
          ${(Math.random() - 0.5) * shake}px
        )

        scale(
          ${1 + intensity * 0.004}
        )
      `;

  } else {

    lantern.style.transform =
      "translate(0,0) scale(1)";

  }


  /* =========================================
     OATH
  ========================================= */

  revealOath();

}


/* =========================================================
   OATH REVEAL
========================================================= */

function revealOath() {

  /*
   * The oath reveals as the battery fills.
   */

  const thresholds = [
    5,
    28,
    53,
    78
  ];


  oathLines.forEach(
    (line, index) => {

      if (
        charge >=
        thresholds[index]
      ) {

        line.classList.add(
          "visible"
        );

      } else {

        line.classList.remove(
          "visible"
        );

      }

    }
  );

}


/* =========================================================
   ENERGY PARTICLES
========================================================= */

function createParticle() {

  const center =
    getLanternCenter();


  const particle =
    document.createElement(
      "span"
    );


  particle.className =
    "particle";


  const startX =
    cursorX +
    (Math.random() - 0.5) * 14;


  const startY =
    cursorY +
    (Math.random() - 0.5) * 14;


  particle.style.left =
    `${startX}px`;

  particle.style.top =
    `${startY}px`;


  particle.style.setProperty(
    "--moveX",
    `
      ${
        center.x -
        startX +
        (Math.random() - 0.5) * 28
      }px
    `
  );


  particle.style.setProperty(
    "--moveY",
    `
      ${
        center.y -
        startY +
        (Math.random() - 0.5) * 28
      }px
    `
  );


  particle.style.setProperty(
    "--duration",
    `
      ${0.5 + Math.random() * 0.55}s
    `
  );


  particlesContainer.appendChild(
    particle
  );


  setTimeout(
    () => {
      particle.remove();
    },
    1200
  );

}


/* =========================================================
   AMBIENT DUST
========================================================= */

function createDust() {

  const count =
    55;


  for (
    let i = 0;
    i < count;
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
      Math.random() * 2;


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
      `${4 + Math.random() * 7}s`
    );


    dot.style.setProperty(
      "--dx",
      `${-30 + Math.random() * 60}px`
    );


    dot.style.setProperty(
      "--dy",
      `${-45 + Math.random() * 90}px`
    );


    dot.style.animationDelay =
      `${Math.random() * 6}s`;


    dustContainer.appendChild(
      dot
    );

  }

}

createDust();


/* =========================================================
   COMPLETION
========================================================= */

function completeCharge() {

  completed =
    true;

  mouseDown =
    false;


  lanternWrap.classList.remove(
    "charging"
  );


  beam.classList.remove(
    "visible"
  );

  beamBlur.classList.remove(
    "visible"
  );


  instruction.textContent =
    "Charge complete";


  progressText.textContent =
    "100%";


  /* =========================================
     FULL POWER
  ========================================= */

  lanternSymbol.style.opacity =
    "1";


  lanternSymbol.style.transform =
    "scale(1.04)";


  core.style.width =
    "150px";

  core.style.height =
    "150px";

  core.style.opacity =
    "0.9";


  frontLight.style.width =
    "170px";

  frontLight.style.height =
    "170px";

  frontLight.style.opacity =
    "0.82";


  backLight.style.opacity =
    "1";


  outerAura.style.opacity =
    "0.95";


  ambient.style.opacity =
    "0.82";


  floorGlow.style.opacity =
    "0.68";


  lantern.style.filter =
    `
      drop-shadow(
        0 25px 34px
        rgba(0, 0, 0, 0.78)
      )

      drop-shadow(
        0 0 28px
        rgba(0, 255, 102, 0.36)
      )
    `;


  /* =========================================
     FLASH
  ========================================= */

  setTimeout(
    () => {

      flash.classList.add(
        "fire"
      );

    },
    350
  );


  /* =========================================
     FINAL SCREEN
  ========================================= */

  setTimeout(
    () => {

      reveal.classList.add(
        "visible"
      );

    },
    1150
  );

}


/* =========================================================
   RESTART
========================================================= */

restart.addEventListener(
  "click",
  () => {

    completed =
      false;

    mouseDown =
      false;

    charge =
      0;


    reveal.classList.remove(
      "visible"
    );


    flash.classList.remove(
      "fire"
    );


    beam.classList.remove(
      "visible"
    );


    beamBlur.classList.remove(
      "visible"
    );


    lanternWrap.classList.remove(
      "charging"
    );


    oathLines.forEach(
      (line) => {

        line.classList.remove(
          "visible"
        );

      }
    );


    lanternSymbol.style.transform =
      "scale(1)";


    lanternSymbol.style.opacity =
      "0.08";


    instruction.textContent =
      "Bring the ring to the battery";


    updateScene();

  }
);


/* =========================================================
   MOUSE LEAVE
========================================================= */

window.addEventListener(
  "mouseleave",
  () => {

    mouseDown =
      false;

    lanternWrap.classList.remove(
      "charging"
    );

  }
);


/* =========================================================
   WINDOW RESIZE
========================================================= */

window.addEventListener(
  "resize",
  () => {

    mouseX =
      window.innerWidth / 2;

    mouseY =
      window.innerHeight / 2;

  }
);
