// The glove cursor that replaces the mouse pointer, and a "ghost" glove that
// demonstrates each gesture when the user hesitates.
//
// Both are plain DOM/SVG drawn in a comic style. The hotspot is the centre of
// the palm, so a grabbed ring sits in the hand.

const GLOVE = "#1f9d55";
const INK = "#03130a";
const SHINE = "#b6ffd0";

const stroke = `stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"`;

const OPEN_HAND = `
<svg class="hand-open" viewBox="0 0 64 64" aria-hidden="true">
  <rect x="5" y="31" width="9" height="21" rx="4.5" transform="rotate(-48 10 41)" fill="${GLOVE}" ${stroke}/>
  <rect x="19" y="10" width="8.5" height="26" rx="4.25" transform="rotate(-9 23 30)" fill="${GLOVE}" ${stroke}/>
  <rect x="28" y="5" width="8.5" height="30" rx="4.25" fill="${GLOVE}" ${stroke}/>
  <rect x="37" y="8" width="8.5" height="27" rx="4.25" transform="rotate(7 41 30)" fill="${GLOVE}" ${stroke}/>
  <rect x="45" y="15" width="7.5" height="21" rx="3.75" transform="rotate(15 48 31)" fill="${GLOVE}" ${stroke}/>
  <rect x="16" y="27" width="34" height="26" rx="11" fill="${GLOVE}" ${stroke}/>
  <rect x="18" y="50" width="30" height="10" rx="3" fill="#0f5c31" ${stroke}/>
  <path d="M30.5 9v12M39.5 12v10M22 15l1.2 9" stroke="${SHINE}" stroke-width="1.6" stroke-linecap="round" opacity=".45"/>
  <circle cx="33" cy="39" r="5.5" fill="none" stroke="${SHINE}" stroke-width="1.4" opacity=".35"/>
</svg>`;

const FIST = `
<svg class="hand-fist" viewBox="0 0 64 64" aria-hidden="true">
  <rect x="13" y="20" width="38" height="31" rx="12" fill="${GLOVE}" ${stroke}/>
  <rect x="15" y="17" width="9.5" height="17" rx="4.75" fill="${GLOVE}" ${stroke}/>
  <rect x="24" y="15" width="9.5" height="18" rx="4.75" fill="${GLOVE}" ${stroke}/>
  <rect x="33" y="16" width="9.5" height="17" rx="4.75" fill="${GLOVE}" ${stroke}/>
  <rect x="42" y="19" width="8.5" height="15" rx="4.25" fill="${GLOVE}" ${stroke}/>
  <rect x="11" y="33" width="27" height="10" rx="5" fill="${GLOVE}" ${stroke}/>
  <rect x="18" y="48" width="28" height="10" rx="3" fill="#0f5c31" ${stroke}/>
  <path d="M18 21v6M27 19v6M36 20v6" stroke="${SHINE}" stroke-width="1.6" stroke-linecap="round" opacity=".45"/>
</svg>`;

function mount(el) {
  el.innerHTML = `<div class="hand-inner">${OPEN_HAND}${FIST}</div>`;
}

export function createHand(el) {
  mount(el);

  let mode = "open";
  let visible = false;

  el.classList.add(`is-${mode}`);

  return {
    move(x, y) {
      el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
    },

    // open | reach | grab | press
    setMode(next) {
      if (next === mode) return;
      el.classList.remove(`is-${mode}`);
      mode = next;
      el.classList.add(`is-${mode}`);
    },

    show(value) {
      if (value === visible) return;
      visible = value;
      el.classList.toggle("is-visible", value);
    }
  };
}

const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// A looping demonstration. `from` and `to` are functions so the ghost tracks
// targets that move (the ring, the lantern, the screen edge).
export function createGhost(el) {
  mount(el);

  let lesson = null;
  let t = 0;

  const place = (x, y) => {
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  };

  const setMode = mode => {
    el.classList.toggle("is-grab", mode === "grab");
    el.classList.toggle("is-press", mode === "press");
  };

  return {
    // kind: "grab" (reach for the ring), "drag" (carry it from A to B),
    // "knock" (carry it fast into an edge), "press" (press and hold).
    play(kind, from, to = from) {
      if (lesson && lesson.kind === kind) return;
      lesson = { kind, from, to };
      t = 0;
      el.classList.add("is-visible");
    },

    stop() {
      if (!lesson) return;
      lesson = null;
      el.classList.remove("is-visible");
      el.style.opacity = "";
    },

    get playing() {
      return Boolean(lesson);
    },

    update(dt) {
      if (!lesson) return;

      t += dt;
      const { kind } = lesson;
      const a = lesson.from();
      const b = lesson.to();
      const cycle = kind === "press" ? 2.4 : 2.9;
      const p = t % cycle;

      let x = a.x;
      let y = a.y;
      let opacity = 0.85;
      let mode = "open";

      if (kind === "grab") {
        // Drift in from below, close on the ring, let go.
        const k = ease(Math.min(p / 1.1, 1));
        x = a.x + 40 * (1 - k);
        y = a.y + 70 * (1 - k);
        mode = p > 1.2 && p < 2.1 ? "grab" : "open";
        opacity = p < 0.3 ? p / 0.3 : p > 2.4 ? Math.max(0, 1 - (p - 2.4) / 0.4) : 0.85;
      } else if (kind === "press") {
        mode = p > 0.5 && p < 1.9 ? "press" : "open";
        opacity = p < 0.3 ? p / 0.3 : p > 2.0 ? Math.max(0, 1 - (p - 2.0) / 0.4) : 0.85;
      } else {
        // drag / knock: grab at A, carry to B, release.
        const moveStart = 0.6;
        const moveTime = kind === "knock" ? 0.45 : 1.3;
        const k = Math.min(Math.max((p - moveStart) / moveTime, 0), 1);
        const e = kind === "knock" ? k * k : ease(k);

        x = a.x + (b.x - a.x) * e;
        y = a.y + (b.y - a.y) * e;

        // A knock bounces back off the edge.
        if (kind === "knock" && k >= 1) {
          const back = Math.min((p - moveStart - moveTime) / 0.35, 1);
          const bounce = Math.sin(back * Math.PI) * 0.12;
          x = b.x + (a.x - b.x) * bounce;
          y = b.y + (a.y - b.y) * bounce;
        }

        mode = p > 0.35 && p < moveStart + moveTime + 0.4 ? "grab" : "open";
        opacity = p < 0.3 ? p / 0.3 : p > 2.4 ? Math.max(0, 1 - (p - 2.4) / 0.4) : 0.85;
      }

      place(x, y);
      setMode(mode);
      el.style.opacity = opacity.toFixed(3);
    }
  };
}
