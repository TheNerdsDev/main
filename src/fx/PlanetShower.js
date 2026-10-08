import gsap from 'gsap';
import PlanetScene, { ringShape, MERCURY, VENUS, EARTH, MOON, MARS, JUPITER, SATURN, URANUS, NEPTUNE } from './PlanetScene.js';

/*
 * The finale: a shower of tiny planets.
 *
 * As the closing section scrolls in, a shower of miniature solar-system
 * bodies pours in from its top edge — the seam with the work reel above —
 * falls under gravity, bounces, rolls and piles up along the bottom.
 * Moving the pointer through the pile nudges the bodies near it; pressing
 * and dragging (mouse or touch) swipes them away with the drag, and they
 * glide on, then fall and settle. Scroll back up and the pile stays exactly
 * as it is; leave the section altogether and come back down, and a fresh
 * shower falls.
 *
 * Physics: circles under gravity, resolved against each other, the floor
 * and the walls (position-based, so stacks come truly to rest). Drawing:
 * PlanetScene — real maps on physically based materials (three.js).
 */

/* Radius at a 1280px-wide section, and how many fall. The real ratios are
   far too extreme, so the scale is squeezed: the giants clearly biggest,
   then Earth and Venus, Mars, then Mercury and the Moon. */
const BODIES = [
  [JUPITER, 42, 6],
  [SATURN, 35, 4],
  [URANUS, 26, 4],
  [NEPTUNE, 25, 5],
  [EARTH, 19, 11],
  [VENUS, 18, 9],
  [MARS, 13, 14],
  [MERCURY, 9.5, 17],
  [MOON, 8, 19]
];
/* Everything drawn a little larger than the table above. */
const GROW = 1.15;
/* Collision shapes sit just outside what's drawn, so atmospheres and ring
   edges never touch. */
const PAD = 1.04;

/**
 * A body's collision shape: capsules (segments with a radius, relative to
 * its centre). A planet is one circle — a zero-length capsule; a ringed
 * planet adds a capsule along its ring's on-screen ellipse, so neighbours
 * rest against the ring instead of sliding into it. Also sets the bounding
 * radius `r` and the half-extents `ex`, `ey` used against the walls.
 */
function shape(b) {
  const disc = b.size * PAD;
  b.prims = [[0, 0, 0, 0, disc]];
  b.ex = b.ey = b.r = disc;
  const ring = ringShape(b.type, b.seed);
  if (!ring) return;
  const c = Math.max(ring.minor, 0.14) * b.size * PAD;
  const L = Math.max(0, ring.major * b.size * PAD - c);
  const hx = ring.ux * L;
  const hy = ring.uy * L;
  b.prims.push([-hx, -hy, hx, hy, c]);
  b.r = Math.max(disc, L + c);
  b.ex = Math.max(disc, Math.abs(hx) + c);
  b.ey = Math.max(disc, Math.abs(hy) + c);
}

/* Closest points between segments p1–q1 and p2–q2 (Ericson, Real-Time
   Collision Detection 5.1.9). Writes them into OUT = [x1, y1, x2, y2]. */
const OUT = [0, 0, 0, 0];
function closest(p1x, p1y, q1x, q1y, p2x, p2y, q2x, q2y) {
  const d1x = q1x - p1x, d1y = q1y - p1y;
  const d2x = q2x - p2x, d2y = q2y - p2y;
  const rx = p1x - p2x, ry = p1y - p2y;
  const a = d1x * d1x + d1y * d1y;
  const e = d2x * d2x + d2y * d2y;
  const f = d2x * rx + d2y * ry;
  let sv = 0, t = 0;
  if (a <= 1e-9 && e <= 1e-9) {
    sv = t = 0;
  } else if (a <= 1e-9) {
    t = Math.min(Math.max(f / e, 0), 1);
  } else {
    const c = d1x * rx + d1y * ry;
    if (e <= 1e-9) {
      sv = Math.min(Math.max(-c / a, 0), 1);
    } else {
      const b = d1x * d2x + d1y * d2y;
      const den = a * e - b * b;
      sv = den > 1e-9 ? Math.min(Math.max((b * f - c * e) / den, 0), 1) : 0;
      t = (b * sv + f) / e;
      if (t < 0) {
        t = 0;
        sv = Math.min(Math.max(-c / a, 0), 1);
      } else if (t > 1) {
        t = 1;
        sv = Math.min(Math.max((b - c) / a, 0), 1);
      }
    }
  }
  OUT[0] = p1x + d1x * sv;
  OUT[1] = p1y + d1y * sv;
  OUT[2] = p2x + d2x * t;
  OUT[3] = p2y + d2y * t;
}

const GRAVITY = 2300;   // px/s²
const ITERATIONS = 6;   // constraint passes per substep
const STEP = 1 / 240;   // physics time step, s
const SHOWER = 2.1;     // seconds over which the bodies are let go

const rand = (a, b) => a + Math.random() * (b - a);

export default class PlanetShower {
  static supported() {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** How many of each kind can ever fall at once (the widest screens). */
  static capacity() {
    const cap = {};
    for (const [type, , count] of BODIES) cap[type] = Math.round(count * 1.5);
    return cap;
  }

  /**
   * section   the closing section (the planets live in its box)
   * canvas    the canvas inside it
   * onShower  called each time a fresh shower starts
   */
  constructor(section, canvas, { onShower } = {}) {
    this.section = section;
    this.canvas = canvas;
    this.onShower = onShower;
    this.bodies = [];
    this.armed = true;
    this.awake = false;
    this.time = 0;
    this.pointer = null;

    /* Phones and small screens get 1K maps and lighter geometry. */
    const small = Math.min(window.screen?.width || 9999, window.screen?.height || 9999) < 820;
    try {
      this.scene = new PlanetScene(canvas, { small });
    } catch {
      this.dead = true;
      return;
    }
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.dead = true; this.stop(); });

    const local = (e) => {
      const r = this.section.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, t: performance.now() };
    };
    /* Press and drag (mouse or touch): swipe the planets away with the drag. */
    this.onDown = (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (e.target.closest?.('a, button')) return;
      const p = local(e);
      this.drag = { id: e.pointerId, ...p, vx: 0, vy: 0 };
      try { this.section.setPointerCapture(e.pointerId); } catch { /* no live pointer to capture */ }
    };
    this.onMove = (e) => {
      const p = local(e);
      const d = this.drag;
      if (d && e.pointerId === d.id) {
        const dt = Math.max((p.t - d.t) / 1000, 1 / 240);
        /* The drag's velocity, smoothed so one jittery event can't fling the pile. */
        const k = 1 - Math.exp(-dt * 18);
        d.vx += ((p.x - d.x) / dt - d.vx) * k;
        d.vy += ((p.y - d.y) / dt - d.vy) * k;
        this.swipe(p.x, p.y, d.vx, d.vy, dt);
        Object.assign(d, p);
        return;
      }
      /* Just passing over: a gentle nudge. */
      if (this.pointer && p.t - this.pointer.t < 120) {
        const dt = Math.max((p.t - this.pointer.t) / 1000, 1 / 240);
        this.push(p.x, p.y, (p.x - this.pointer.x) / dt, (p.y - this.pointer.y) / dt);
      }
      this.pointer = p;
    };
    this.onUp = (e) => {
      if (!this.drag || e.pointerId !== this.drag.id) return;
      try { this.section.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      this.drag = null;
    };
    this.onLeave = () => { this.pointer = null; };
    section.addEventListener('pointerdown', this.onDown);
    section.addEventListener('pointermove', this.onMove, { passive: true });
    section.addEventListener('pointerup', this.onUp);
    section.addEventListener('pointercancel', this.onUp);
    section.addEventListener('pointerleave', this.onLeave, { passive: true });

    /* Only run while the section is near the screen. */
    this.io = new IntersectionObserver((entries) => {
      this.near = entries.some((e) => e.isIntersecting);
      if (this.near) {
        /* Fetch the maps as the section approaches, not with the page. */
        this.scene.load(PlanetShower.capacity()).catch(() => { this.dead = true; });
        this.start();
      } else this.stop();
    }, { rootMargin: '100% 0px 100% 0px' });
    this.io.observe(section);
    this.resize();
  }

  resize() {
    if (this.dead) return;
    const w = this.section.clientWidth;
    const h = this.section.clientHeight;
    const changed = w !== this.W || h !== this.H;
    this.W = w;
    this.H = h;
    this.scene.resize(w, h);
    if (changed && this.bodies.length) {
      /* Keep everyone inside the new box; they'll settle again. */
      for (const b of this.bodies) {
        b.x = Math.min(Math.max(b.x, b.ex), w - b.ex);
        b.y = Math.min(b.y, h - b.ey);
      }
      this.awake = true;
    }
  }

  /* ------------------------------------------------------------ shower */

  shower() {
    const W = this.W;
    const unit = Math.min(Math.max(W / 1280, 0.55), 1.4);
    /* Narrow screens get fewer bodies so the pile is the same depth. */
    const howMany = Math.min(Math.max(W / 1280, 0.4), 1.5);
    const list = [];
    for (const [type, radius, count] of BODIES) {
      const n = Math.max(1, Math.round(count * howMany));
      for (let i = 0; i < n; i++) {
        const size = radius * GROW * unit * rand(0.93, 1.07);
        const b = { type, size, seed: Math.random() };
        shape(b);
        list.push(Object.assign(b, {
          m: size * size,
          x: rand(b.ex, W - b.ex),
          y: -b.ey - rand(0, 60),
          vx: rand(-70, 70),
          vy: rand(0, 160),
          rot: rand(0, Math.PI * 2),
          /* Big ones a touch earlier, so the small ones rain on top. */
          at: Math.random() * SHOWER * (0.35 + 0.65 * (1 - Math.min(1, radius / 42))),
          live: false
        }));
      }
    }
    this.bodies = list;
    this.clock = 0;
    this.still = 0;
    this.awake = true;
    this.onShower?.();
  }

  /** The pointer moved through the pile at (x, y) with velocity (vx, vy). */
  push(x, y, vx, vy) {
    if (!this.bodies.length) return;
    const speed = Math.hypot(vx, vy);
    if (speed < 30) return;
    const cap = 2600 / speed;
    const ux = vx * Math.min(1, cap);
    const uy = vy * Math.min(1, cap);
    let hit = false;
    for (const b of this.bodies) {
      if (!b.live) continue;
      const reach = 60 + b.r;
      const dx = b.x - x;
      const dy = b.y - y;
      const d = Math.hypot(dx, dy);
      if (d > reach) continue;
      const f = (1 - d / reach) ** 2;
      /* Heavier bodies budge less. */
      const k = f * Math.min(1, 900 / b.m) * 0.9 + f * 0.25;
      b.vx += ux * k;
      b.vy += uy * k - 140 * f;
      b.kick = 0.35;
      hit = true;
    }
    if (hit) {
      this.awake = true;
      this.still = 0;
    }
  }

  /**
   * A press-and-drag through the pile at (x, y) moving at (vx, vy): the
   * planets near the pointer are carried along with it — their velocity
   * eased towards the drag's, closer ones more — so they sweep away with
   * it and keep gliding once released, until gravity brings them down.
   */
  swipe(x, y, vx, vy, dt) {
    if (!this.bodies.length) return;
    const speed = Math.hypot(vx, vy);
    if (speed < 20) return;
    const cap = Math.min(1, 3200 / speed);
    const ux = vx * cap;
    const uy = vy * cap;
    const ease = 1 - Math.exp(-dt * 26);
    let hit = false;
    for (const b of this.bodies) {
      if (!b.live) continue;
      const reach = 120 + b.size;
      const dx = b.x - x;
      const dy = b.y - y;
      const d = Math.hypot(dx, dy);
      if (d > reach) continue;
      const f = (1 - d / reach) ** 1.5;
      const carry = 1.05 * Math.min(1, 1200 / b.m + 0.45);
      const k = ease * f;
      b.vx += (ux * carry - b.vx) * k;
      b.vy += (uy * carry - 90 - b.vy) * k;
      b.kick = 0.5;
      hit = true;
    }
    if (hit) {
      this.awake = true;
      this.still = 0;
    }
  }

  /* ----------------------------------------------------------- physics */

  /**
   * Position-based dynamics: move everything, untangle the overlaps (each
   * pair pushed apart by mass), then take each body's velocity from where
   * it actually ended up. Stacks come truly to rest that way instead of
   * shivering. Hard landings on the floor still bounce.
   */
  step(dt) {
    const { W, H } = this;
    const bodies = this.bodies;
    for (const b of bodies) {
      if (!b.live) {
        if (this.clock >= b.at) b.live = true;
        else continue;
      }
      b.px = b.x;
      b.py = b.y;
      b.rest = false;
      /* Falling, up to a terminal speed (keeps a fast body from burying itself in the pile). */
      b.vy = Math.min(b.vy + GRAVITY * dt, 1500);
      b.vx *= 1 - 0.1 * dt;
      b.landing = b.vy;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    const n = bodies.length;
    for (let it = 0; it < ITERATIONS; it++) {
      for (let i = 0; i < n; i++) {
        const a = bodies[i];
        if (!a.live) continue;
        for (let j = i + 1; j < n; j++) {
          const b = bodies[j];
          if (!b.live) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const reach = a.r + b.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= reach * reach) continue;
          /* The deepest overlap between their capsules, and its direction. */
          let depth = -Infinity, nx = 0, ny = 0;
          if (a.prims.length === 1 && b.prims.length === 1) {
            /* Two plain planets: circles, the common case. */
            const d = Math.sqrt(d2);
            depth = reach - d;
            if (d > 1e-6) {
              nx = dx / d;
              ny = dy / d;
            } else ny = 1;
          } else for (const pa of a.prims) {
            for (const pb of b.prims) {
              closest(a.x + pa[0], a.y + pa[1], a.x + pa[2], a.y + pa[3],
                b.x + pb[0], b.y + pb[1], b.x + pb[2], b.y + pb[3]);
              let ex = OUT[2] - OUT[0];
              let ey = OUT[3] - OUT[1];
              let e = Math.hypot(ex, ey);
              const over = pa[4] + pb[4] - e;
              if (over <= depth) continue;
              if (e < 1e-6) {
                /* Centred on each other: part them along the line between centres, or straight up. */
                e = Math.hypot(dx, dy);
                ex = e > 1e-6 ? dx : 0;
                ey = e > 1e-6 ? dy : 1;
                e = e > 1e-6 ? e : 1;
              }
              depth = over;
              nx = ex / e;
              ny = ey / e;
            }
          }
          const wa = 1 / a.m;
          const wb = 1 / b.m;
          if (depth > 0) {
            const corr = depth / (wa + wb);
            a.x -= nx * corr * wa;
            a.y -= ny * corr * wa;
            b.x += nx * corr * wb;
            b.y += ny * corr * wb;
          }
          /* Resting on something: the upper of the two is supported. */
          if (depth > -0.5) {
            if (ny > 0.3) a.rest = true;
            else if (ny < -0.3) b.rest = true;
          }
        }
      }
      for (const b of bodies) {
        if (!b.live) continue;
        if (b.y > H - b.ey) b.y = H - b.ey;
        if (b.x < b.ex) b.x = b.ex;
        else if (b.x > W - b.ex) b.x = W - b.ex;
      }
    }

    for (const b of bodies) {
      if (!b.live) continue;
      b.vx = (b.x - b.px) / dt;
      b.vy = (b.y - b.py) / dt;
      /* Untangling may nudge, never fling: cap what it can hand back — unless
         the pointer has just shoved this one. */
      if (!(b.kick > 0)) {
        if (b.vy < -320) b.vy = -320;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 1600) {
          b.vx *= 1600 / sp;
          b.vy *= 1600 / sp;
        }
      } else b.kick -= dt;
      const floor = b.y >= H - b.ey - 0.01;
      /* A hard landing bounces; anything gentler just stops. */
      if (floor && b.landing > 260) b.vy = -b.landing * 0.3;
      /* Rolling resistance and friction against the floor and the pile. */
      if (floor) b.vx *= 1 - Math.min(1, 5 * dt);
      const mx = b.x - b.px;
      b.rot -= mx / b.size;
      const speed = Math.hypot(mx, b.y - b.py) / dt;
      if (speed < 3) b.vx *= 0.5;
      /* Friction for a body resting on others: slow sideways drift dies
         away, so nothing creeps down a ring's slope forever. */
      else if (b.rest && !(b.kick > 0) && speed < 60) b.vx *= 1 - Math.min(1, 14 * dt);
    }
  }

  /**
   * Asleep once nothing has really moved over a short window — checked on
   * where things are, since a resting pile still trembles by fractions of
   * a pixel from one tiny physics step to the next.
   */
  settle(dt) {
    this.window = (this.window || 0) + dt;
    if (this.window < 0.25) return;
    this.window = 0;
    let moved = 0;
    for (const b of this.bodies) {
      if (!b.live) return;
      if (b.sx !== undefined) moved = Math.max(moved, Math.hypot(b.x - b.sx, b.y - b.sy));
      b.sx = b.x;
      b.sy = b.y;
    }
    if (this.clock > SHOWER + 0.5 && moved < 0.75) this.awake = false;
  }

  /* -------------------------------------------------------------- loop */

  start() {
    if (this.running || this.dead) return;
    this.running = true;
    this.last = performance.now();
    gsap.ticker.add(this.tick);
  }

  stop() {
    this.running = false;
    gsap.ticker.remove(this.tick);
  }

  tick = () => {
    if (this.dead) return;
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 1 / 30);
    this.last = now;
    this.time += dt;

    /* Arm once the section has gone (scrolled back up past it); a fresh
       shower falls the next time it comes in. In between, nothing resets. */
    const r = this.section.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.top > vh * 0.95) this.armed = true;
    else if (this.armed && r.top < vh * 0.72) {
      this.armed = false;
      this.pending = true;
    }
    /* Let it fall once the maps are in (they start loading well before). */
    if (this.pending && this.scene.ready) {
      this.pending = false;
      if (this.section.clientWidth !== this.W || this.section.clientHeight !== this.H) this.resize();
      this.shower();
    }

    if (this.awake) {
      /* Fixed steps: the solver takes velocity from movement over the step,
         so an uneven step would feed jitter into the pile and keep it from
         ever resting. Leftover time carries over to the next frame. */
      this.acc = Math.min((this.acc || 0) + dt, STEP * 16);
      while (this.acc >= STEP) {
        this.acc -= STEP;
        this.clock += STEP;
        this.step(STEP);
        this.settle(STEP);
        if (!this.awake) break;
      }
    }
    this.draw();
  };

  draw() {
    this.scene.render(this.bodies, this.time);
  }

  destroy() {
    this.stop();
    this.io?.disconnect();
    this.section.removeEventListener('pointerdown', this.onDown);
    this.section.removeEventListener('pointermove', this.onMove);
    this.section.removeEventListener('pointerup', this.onUp);
    this.section.removeEventListener('pointercancel', this.onUp);
    this.section.removeEventListener('pointerleave', this.onLeave);
    this.scene?.dispose();
  }
}
