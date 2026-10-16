import * as THREE from "three";

// Green-light constructs for the ending. Each one is built systematically: a
// drawing frame appears, each part's outline is traced in order, then the
// parts fly in one by one and lock onto their outlines, the finished construct
// flares and is named, holds, and finally breaks apart.
//
// Constructs are made from simple, low-poly parts so their edges read as hard
// light. Units: the finished object is roughly 2.4 units across.

const GREEN = 0x2dff7e;
const EDGE = 0xc6ffdc;

const cyl = (rTop, rBottom, h, seg = 10) => new THREE.CylinderGeometry(rTop, rBottom, h, seg);
const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const ball = (r, detail = 1) => new THREE.IcosahedronGeometry(r, detail);

// Each part: geometry, position, optional rotation and scale.
const p = (geo, pos, rot = [0, 0, 0], scale = [1, 1, 1]) => ({ geo, pos, rot, scale });

const BLUEPRINTS = [
  {
    name: "Sledgehammer",
    parts: () => [
      p(cyl(0.1, 0.12, 0.55), [0, -1.1, 0]),
      p(cyl(0.07, 0.07, 1.8), [0, -0.05, 0]),
      p(box(1.25, 0.55, 0.55), [0, 0.95, 0]),
      p(box(0.12, 0.66, 0.66), [-0.68, 0.95, 0]),
      p(box(0.12, 0.66, 0.66), [0.68, 0.95, 0])
    ]
  },
  {
    name: "Boxing glove",
    parts: () => [
      p(cyl(0.42, 0.5, 0.75), [0, -0.85, 0]),
      p(new THREE.TorusGeometry(0.47, 0.06, 6, 14), [0, -0.45, 0], [Math.PI / 2, 0, 0]),
      p(ball(0.75), [0, 0.3, 0], [0, 0, 0], [1, 0.9, 0.82]),
      p(new THREE.CapsuleGeometry(0.2, 0.45, 3, 8), [-0.62, 0.05, 0.3], [0, 0, 0.6])
    ]
  },
  {
    name: "Brick wall",
    parts: () => {
      // Built row by row, bottom up, with the joints staggered like real brickwork.
      const bricks = [];
      for (let row = 0; row < 4; row++) {
        const y = -0.75 + row * 0.34;
        if (row % 2 === 0) {
          for (const x of [-0.66, 0, 0.66]) bricks.push(p(box(0.6, 0.3, 0.32), [x, y, 0]));
        } else {
          bricks.push(p(box(0.27, 0.3, 0.32), [-0.83, y, 0]));
          for (const x of [-0.33, 0.33]) bricks.push(p(box(0.6, 0.3, 0.32), [x, y, 0]));
          bricks.push(p(box(0.27, 0.3, 0.32), [0.83, y, 0]));
        }
      }
      return bricks;
    }
  },
  {
    name: "Lantern shield",
    parts: () => [
      p(cyl(1.05, 1.05, 0.08, 16), [0, 0, -0.08], [Math.PI / 2, 0, 0]),
      p(new THREE.TorusGeometry(0.55, 0.09, 6, 20), [0, 0, 0.02]),
      p(box(1.55, 0.22, 0.14), [0, 0.82, 0.02]),
      p(box(1.55, 0.22, 0.14), [0, -0.82, 0.02])
    ]
  },
  {
    name: "Rubber duck, 40 ft",
    parts: () => [
      p(ball(0.78), [0, -0.25, 0], [0, 0, 0], [1.25, 0.8, 0.9]),
      p(new THREE.ConeGeometry(0.22, 0.55, 6), [-1.05, 0.05, 0], [0, 0, 1.1]),
      p(ball(0.45), [0.55, 0.62, 0]),
      p(new THREE.ConeGeometry(0.17, 0.42, 6), [1.08, 0.55, 0], [0, 0, -Math.PI / 2]),
      p(ball(0.07, 0), [0.72, 0.78, 0.36])
    ]
  },
  {
    name: "Ladder to the moon",
    parts: () => {
      const parts = [p(box(0.12, 2.5, 0.12), [-0.5, 0, 0]), p(box(0.12, 2.5, 0.12), [0.5, 0, 0])];
      for (let i = 0; i < 6; i++) parts.push(p(box(1.0, 0.08, 0.08), [0, -1.0 + i * 0.4, 0]));
      return parts;
    }
  },
  {
    name: "Catapult",
    parts: () => [
      p(box(2.0, 0.22, 0.9), [0, -0.85, 0]),
      p(cyl(0.3, 0.3, 0.14, 10), [-0.7, -1.05, 0.52], [Math.PI / 2, 0, 0]),
      p(cyl(0.3, 0.3, 0.14, 10), [0.7, -1.05, 0.52], [Math.PI / 2, 0, 0]),
      p(box(0.14, 0.9, 0.14), [0.25, -0.35, 0.3]),
      p(box(0.14, 0.9, 0.14), [0.25, -0.35, -0.3]),
      p(box(1.9, 0.12, 0.12), [0, 0.05, 0], [0, 0, 0.5]),
      p(ball(0.26, 0), [-0.85, -0.42, 0])
    ]
  },
  {
    name: "Umbrella",
    parts: () => [
      p(cyl(0.04, 0.04, 2.0, 6), [0, -0.1, 0]),
      p(new THREE.TorusGeometry(0.2, 0.045, 5, 10, Math.PI), [0.2, -1.1, 0], [0, 0, Math.PI]),
      p(new THREE.ConeGeometry(1.25, 0.6, 8, 1, true), [0, 0.75, 0]),
      p(ball(0.08, 0), [0, 1.1, 0])
    ]
  }
];

const easeOutBack = t => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const easeIn = t => t * t;

export function createConstructs({ container, audio, reducedMotion = false, lowPower = false, onStatus = () => {} }) {
  let renderer;

  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch (error) {
    return { spawn() {}, spawnCenter() {}, update() {}, resize() {}, clear() {} };
  }

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.5 : 2));
  renderer.setClearColor(0x000000, 0);
  renderer.domElement.className = "construct-layer";
  renderer.domElement.setAttribute("aria-hidden", "true");
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
  camera.position.set(0, 0, 1000);

  const live = [];
  let lastBlueprint = null;
  let needsClear = false;

  function resize() {
    // Constructs are short-lived and placed in pixels; drop them on resize.
    if (live.length) clear();

    const w = Math.max(1, window.innerWidth);
    const h = Math.max(1, window.innerHeight);
    renderer.setSize(w, h);
    camera.left = -w / 2;
    camera.right = w / 2;
    camera.top = h / 2;
    camera.bottom = -h / 2;
    camera.updateProjectionMatrix();
  }

  resize();

  function makePart(spec, index, count) {
    const faceMaterial = new THREE.MeshBasicMaterial({
      color: GREEN,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide
    });

    const edgeMaterial = new THREE.LineBasicMaterial({
      color: EDGE,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const holder = new THREE.Group();
    const face = new THREE.Mesh(spec.geo, faceMaterial);
    const edges = new THREE.LineSegments(new THREE.EdgesGeometry(spec.geo, 20), edgeMaterial);

    for (const obj of [face, edges]) {
      obj.rotation.set(...spec.rot);
      obj.scale.set(...spec.scale);
      holder.add(obj);
    }

    // Each part flies in from outside the object, along the line from the
    // object's centre through the part.
    const home = new THREE.Vector3(...spec.pos);
    const dir = home.clone();
    if (dir.lengthSq() < 0.01) dir.set(0, 1, 0);
    dir.normalize();
    dir.x += (Math.random() - 0.5) * 0.6;
    dir.y += (Math.random() - 0.5) * 0.6;
    dir.z = 0.4 + Math.random() * 0.6;
    const from = home.clone().addScaledVector(dir.normalize(), 1.8 + Math.random() * 0.6);

    holder.position.copy(from);
    holder.scale.setScalar(0.2);

    return { holder, faceMaterial, edgeMaterial, home, from, index, count, locked: false };
  }

  // Blueprint outlines, one per part, so they can be traced in build order.
  function makeGhosts(specs) {
    return specs.map(spec => {
      const material = new THREE.LineBasicMaterial({
        color: GREEN,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      const lines = new THREE.LineSegments(new THREE.EdgesGeometry(spec.geo, 20), material);
      lines.position.set(...spec.pos);
      lines.rotation.set(...spec.rot);
      lines.scale.set(...spec.scale);
      return { lines, material };
    });
  }

  // A technical drawing frame: fine grid, and corner brackets. It faces the
  // viewer and does not spin with the construct.
  function makeFrame() {
    const points = [];
    const half = 1.55;
    const step = half / 4;

    for (let i = -4; i <= 4; i++) {
      points.push(-half, i * step, 0, half, i * step, 0);
      points.push(i * step, -half, 0, i * step, half, 0);
    }

    const gridGeometry = new THREE.BufferGeometry();
    gridGeometry.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    const gridMaterial = new THREE.LineBasicMaterial({
      color: GREEN,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const corners = [];
    const c = half + 0.12;
    const arm = 0.3;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      corners.push(sx * c, sy * c, 0, sx * (c - arm), sy * c, 0);
      corners.push(sx * c, sy * c, 0, sx * c, sy * (c - arm), 0);
    }

    const cornerGeometry = new THREE.BufferGeometry();
    cornerGeometry.setAttribute("position", new THREE.Float32BufferAttribute(corners, 3));
    const cornerMaterial = new THREE.LineBasicMaterial({
      color: EDGE,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    const group = new THREE.Group();
    group.add(new THREE.LineSegments(gridGeometry, gridMaterial));
    group.add(new THREE.LineSegments(cornerGeometry, cornerMaterial));

    return { group, gridMaterial, cornerMaterial };
  }

  // `maxSize` (px) caps the construct so it fits a given space.
  function spawn(x, y, labelLayer, maxSize = Infinity) {
    // Keep at most two on screen: the oldest breaks up early.
    const building = live.filter(c => c.phase !== "dissolve");
    if (building.length >= 2) {
      building[0].phase = "dissolve";
      building[0].t = 0;
    }

    let blueprint;
    do {
      blueprint = BLUEPRINTS[Math.floor(Math.random() * BLUEPRINTS.length)];
    } while (blueprint === lastBlueprint);
    lastBlueprint = blueprint;

    const specs = blueprint.parts();
    const w = window.innerWidth;
    const h = window.innerHeight;
    const unit = Math.max(30, Math.min(120, Math.min(w, h) * 0.12, maxSize / 3.6));

    const cx = Math.min(Math.max(x, unit * 1.9), w - unit * 1.9);
    const cy = Math.min(Math.max(y, unit * 1.8), h - unit * 1.8);
    const px = cx - w / 2;
    const py = h / 2 - cy;

    const root = new THREE.Group();
    root.position.set(px, py, 0);
    root.scale.setScalar(unit);
    root.rotation.set(0.25, -0.5 + Math.random() * 0.3, 0);

    const frame = makeFrame();
    frame.group.position.set(px, py, -200);
    frame.group.scale.setScalar(unit);
    scene.add(frame.group);

    const ghosts = makeGhosts(specs);
    ghosts.forEach(ghost => root.add(ghost.lines));

    const parts = specs.map((spec, i) => {
      const part = makePart(spec, i, specs.length);
      root.add(part.holder);
      return part;
    });

    const pulse = new THREE.Mesh(
      new THREE.RingGeometry(1.25, 1.3, 64),
      new THREE.MeshBasicMaterial({ color: EDGE, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false })
    );
    root.add(pulse);

    const label = document.createElement("div");
    label.className = "construct-label";
    label.textContent = blueprint.name;
    label.style.left = `${cx}px`;
    label.style.top = `${cy + unit * 1.7}px`;
    labelLayer.appendChild(label);

    scene.add(root);

    // Timeline: draw the frame, trace each part's outline, then assemble.
    const traceGap = Math.min(0.22, 1.4 / specs.length);
    const traceEnd = 0.6 + traceGap * specs.length + 0.3;
    const stagger = Math.min(0.32, 2.4 / specs.length);
    const assembleEnd = traceEnd + stagger * specs.length + 0.5;

    live.push({
      name: blueprint.name,
      root,
      frame,
      ghosts,
      parts,
      pulse,
      label,
      phase: "build",
      t: 0,
      traceGap,
      traceEnd,
      stagger,
      assembleEnd,
      locked: 0,
      hold: 2.6,
      spin: (Math.random() < 0.5 ? -1 : 1) * 0.3
    });

    onStatus(`Blueprint · ${blueprint.name}`);
    needsClear = true;
  }

  function dispose(construct) {
    for (const group of [construct.root, construct.frame.group]) {
      group.traverse(obj => {
        obj.geometry?.dispose();
        obj.material?.dispose();
      });
      scene.remove(group);
    }
    construct.label.remove();
  }

  function update(dt) {
    if (!live.length) {
      if (needsClear) {
        renderer.render(scene, camera);
        needsClear = false;
      }
      return;
    }

    for (let i = live.length - 1; i >= 0; i--) {
      const c = live[i];
      c.t += dt;

      if (!reducedMotion) c.root.rotation.y += c.spin * dt;

      if (c.phase === "build") {
        // 1. The drawing frame appears.
        const frameIn = Math.min(c.t / 0.5, 1);
        c.frame.gridMaterial.opacity = frameIn * 0.07;
        c.frame.cornerMaterial.opacity = frameIn * 0.7;

        // 2. Each part's outline is traced, in build order.
        c.ghosts.forEach((ghost, index) => {
          if (c.parts[index].locked) return;
          const k = Math.min(Math.max((c.t - 0.5 - index * c.traceGap) / 0.35, 0), 1);
          ghost.material.opacity = k * 0.35;
        });

        // 3. Parts fly in and lock onto their outlines, one after another.
        for (const part of c.parts) {
          const start = c.traceEnd + part.index * c.stagger;
          const k = Math.min(Math.max((c.t - start) / 0.5, 0), 1);
          if (k <= 0) continue;

          const e = reducedMotion ? 1 : easeOutBack(k);
          part.holder.position.lerpVectors(part.from, part.home, Math.min(e, 1.08));
          part.holder.scale.setScalar(0.2 + 0.8 * Math.min(e, 1.05));
          part.edgeMaterial.opacity = Math.min(1, k * 2.2);
          part.faceMaterial.opacity = 0.14 * k;

          if (k >= 1 && !part.locked) {
            part.locked = true;
            part.lockFlash = 0.3;
            c.locked += 1;
            c.ghosts[part.index].material.opacity = 0;
            audio.construct(false);
            onStatus(`Assembling · ${c.locked} / ${c.parts.length}`);
          }

          if (part.lockFlash > 0) {
            part.lockFlash -= dt;
            part.faceMaterial.opacity = 0.14 + Math.max(0, part.lockFlash) * 1.6;
          }
        }

        // 4. Complete: flare, name it, hold.
        if (c.t >= c.assembleEnd) {
          c.phase = "hold";
          c.t = 0;
          c.ghosts.forEach(ghost => (ghost.material.opacity = 0));
          c.label.classList.add("is-on");
          audio.construct(true);
          onStatus(`Construct complete · ${c.name}`);
        }
      } else if (c.phase === "hold") {
        const k = Math.min(c.t / 0.8, 1);
        c.pulse.material.opacity = (1 - k) * 0.9;
        c.pulse.scale.setScalar(1 + k * 0.8);
        c.pulse.lookAt(camera.position);

        c.frame.gridMaterial.opacity = (1 - k) * 0.07;
        c.frame.cornerMaterial.opacity = 0.7 * (1 - k * 0.6);

        const glow = 0.22 + 0.06 * Math.sin(c.t * 6);
        for (const part of c.parts) {
          part.faceMaterial.opacity = glow + (1 - k) * 0.35;
          part.edgeMaterial.opacity = 1;
        }

        if (c.t >= c.hold) {
          c.phase = "dissolve";
          c.t = 0;
        }
      } else {
        // 5. Break apart: the last part built goes first.
        c.label.classList.remove("is-on");
        let alive = false;

        for (const part of c.parts) {
          const start = (part.count - 1 - part.index) * 0.06;
          const k = Math.min(Math.max((c.t - start) / 0.6, 0), 1);
          if (k < 1) alive = true;

          const e = easeIn(k);
          part.holder.position.lerpVectors(part.home, part.from, e * 0.5);
          part.holder.scale.setScalar(Math.max(0.01, 1 - e * 0.6));
          part.edgeMaterial.opacity = Math.min(part.edgeMaterial.opacity, 1 - k);
          part.faceMaterial.opacity = (1 - k) * 0.2;
        }

        c.ghosts.forEach(ghost => (ghost.material.opacity = 0));
        c.pulse.material.opacity = 0;
        c.frame.gridMaterial.opacity = 0;
        c.frame.cornerMaterial.opacity = Math.max(0, c.frame.cornerMaterial.opacity - dt * 2);

        if (!alive) {
          dispose(c);
          live.splice(i, 1);
        }
      }
    }

    needsClear = true;
    renderer.render(scene, camera);
  }

  function clear() {
    while (live.length) dispose(live.pop());
    needsClear = true;
  }

  // Build one centred in a given open area of the screen.
  function spawnCenter(labelLayer, area = null) {
    if (!area) {
      spawn(window.innerWidth / 2, window.innerHeight * 0.52, labelLayer);
      return;
    }
    spawn(area.x, area.y, labelLayer, area.size);
  }

  return { spawn, spawnCenter, update, resize, clear };
}
