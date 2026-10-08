import gsap from 'gsap';
import PlanetScene, { MERCURY, VENUS, EARTH, MOON, MARS, JUPITER, SATURN, URANUS, NEPTUNE } from './PlanetScene.js';

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
  [JUPITER, 42, 7],
  [SATURN, 35, 5],
  [URANUS, 26, 6],
  [NEPTUNE, 25, 6],
  [EARTH, 19, 13],
  [VENUS, 18, 11],
  [MARS, 13, 17],
  [MERCURY, 9.5, 20],
  [MOON, 8, 22]
];
/* Collision radius as a share of the drawn one: ringed planets keep
   their neighbours out of their rings. */
const REACH = { [SATURN]: 1.5, [URANUS]: 1.12 };

const GRAVITY = 2300;   // px/s²
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
        b.x = Math.min(Math.max(b.x, b.r), w - b.r);
        b.y = Math.min(b.y, h - b.r);
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
        const size = radius * unit * rand(0.93, 1.07);
        const r = size * (REACH[type] || 1);
        list.push({
          type,
          size,
          r,
          m: size * size,
          x: rand(r, W - r),
          y: -r - rand(0, 60),
          vx: rand(-70, 70),
          vy: rand(0, 160),
          rot: rand(0, Math.PI * 2),
          seed: Math.random(),
          /* Big ones a touch earlier, so the small ones rain on top. */
          at: Math.random() * SHOWER * (0.35 + 0.65 * (1 - Math.min(1, radius / 42))),
          live: false
        });
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
      /* Falling, up to a terminal speed (keeps a fast body from burying itself in the pile). */
      b.vy = Math.min(b.vy + GRAVITY * dt, 1500);
      b.vx *= 1 - 0.1 * dt;
      b.landing = b.vy;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    const n = bodies.length;
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < n; i++) {
        const a = bodies[i];
        if (!a.live) continue;
        for (let j = i + 1; j < n; j++) {
          const b = bodies[j];
          if (!b.live) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const min = a.r + b.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min || d2 < 1e-6) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const wa = 1 / a.m;
          const wb = 1 / b.m;
          const corr = (min - d) / (wa + wb);
          a.x -= nx * corr * wa;
          a.y -= ny * corr * wa;
          b.x += nx * corr * wb;
          b.y += ny * corr * wb;
        }
      }
      for (const b of bodies) {
        if (!b.live) continue;
        if (b.y > H - b.r) b.y = H - b.r;
        if (b.x < b.r) b.x = b.r;
        else if (b.x > W - b.r) b.x = W - b.r;
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
      const floor = b.y >= H - b.r - 0.01;
      /* A hard landing bounces; anything gentler just stops. */
      if (floor && b.landing > 260) b.vy = -b.landing * 0.3;
      /* Rolling resistance and friction against the floor and the pile. */
      if (floor) b.vx *= 1 - Math.min(1, 5 * dt);
      const mx = b.x - b.px;
      b.rot -= mx / b.r;
      const speed = Math.hypot(mx, b.y - b.py) / dt;
      if (speed < 3) b.vx *= 0.5;
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
      this.clock += dt;
      const sub = 4;
      for (let i = 0; i < sub; i++) this.step(dt / sub);
      this.settle(dt);
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
