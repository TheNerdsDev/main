import gsap from 'gsap';
import store from '../core/Store.js';
import gpu from '../core/gpu.js';
import { pacer, drawInterval } from '../core/pace.js';
import PlanetSprites from './PlanetSprites.js';
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
const CATCH_UP = 5;     // most steps in one frame (a 60 fps frame takes 4)
const SHOWER = 2.1;     // seconds over which the bodies are let go

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.min(Math.max(v, a), b);

/**
 * How the shower fits a section of w × h. Planet size follows the square
 * root of its area against the 1280 × 720 the table above is drawn for —
 * smaller on a phone, bigger on a large monitor — and the count makes up
 * the rest, so the pile fills the same share of the section's height on
 * every screen (a tall phone gets as deep a pile as a laptop).
 */
const FILL = 1.25;      // bodies per table entry at the reference size (sets how deep the pile is)
const plan = (w, h) => {
  const area = (w * h) / (1280 * 720);
  const unit = clamp(Math.sqrt(area), 0.5, 1.7);
  return { unit, howMany: clamp((FILL * area) / (unit * unit), 0.6, 1.8) };
};

/* The scene — its WebGL context, its maps and its compiled shaders — lasts
   the whole visit: a page that ends with the shower takes over the last
   one's (canvas and all, see the constructor) rather than building it all
   again, which on each visit to a page held up its entrance. */
let kept = null;

export default class PlanetShower {
  /* (WebGL2 itself was checked at boot, Store.hasWebGL: without it the
     site is the plain document. Should the planets' own context fail, they
     fall in 2D: PlanetSprites.) */
  static supported() {
    return !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** How many of each kind can ever fall at once (the widest screens). */
  static capacity() {
    const cap = {};
    for (const [type, , count] of BODIES) cap[type] = Math.round(count * 1.8);
    return cap;
  }

  /**
   * section   the closing section (the planets live in its box)
   * canvas    the canvas inside it
   * onShower  called each time a fresh shower starts
   */
  constructor(section, canvas, { onShower } = {}) {
    this.section = section;
    this.onShower = onShower;
    this.bodies = [];
    this.order = [];
    this.pace = pacer();
    this.armed = true;
    this.awake = false;
    this.time = 0;
    this.pointer = null;

    /* Phones and small screens get 1K maps and lighter geometry. */
    const small = Math.min(window.screen?.width || 9999, window.screen?.height || 9999) < 820;
    this.small = small;
    kept?.claim();
    const reuse = kept && kept.small === small && !kept.scene.renderer.getContext().isContextLost();
    if (reuse) {
      /* The last page's scene, ready to go: its canvas takes this one's place. */
      canvas.replaceWith(kept.canvas);
      canvas = kept.canvas;
      this.scene = kept.scene;
      this.scene.blank = false;
      kept.untrack();
    } else if (kept) {
      kept.untrack();
      kept.scene.dispose();
    }
    kept = null;
    this.canvas = canvas;
    if (!reuse) {
      try {
        this.scene = new PlanetScene(canvas, { small });
      } catch (err) {
        gpu.warn('planets: no WebGL context, showing them in 2D', err);
        this.toFlat();
        if (this.dead) return;
      }
    }
    if (!this.flat) this.watch();

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

    /* Fetch the maps and get them onto the GPU (PlanetScene.warm) before
       the section arrives, so the planets fall the moment it does: once the
       page has come in and things are quiet — on the welcome page, while
       it's still being looked at, long before the scroll reaches the end —
       or as the section comes within a few screens, if that's sooner. */
    const prepare = () => {
      if (this.prepared || this.dead) return;
      this.prepared = true;
      this.loadIo.disconnect();
      clearTimeout(this.prepareAt);
      this.ready(this.scene);
    };
    this.loadIo = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) prepare();
    }, { rootMargin: '300% 0px 300% 0px' });
    this.loadIo.observe(section);
    /* (A moment after the page's entrance — never while the loader is
       still fetching the page itself — then the first idle moment.) */
    const later = () => {
      if (!document.documentElement.classList.contains('loaded')) {
        this.prepareAt = setTimeout(later, 600);
        return;
      }
      if ('requestIdleCallback' in window) requestIdleCallback(prepare, { timeout: 2000 });
      else prepare();
    };
    this.prepareAt = setTimeout(later, 1500);
    /* Only run while the section is near the screen. */
    this.io = new IntersectionObserver((entries) => {
      this.near = entries.some((e) => e.isIntersecting);
      if (this.near) this.start();
      else this.stop();
    }, { rootMargin: '100% 0px 100% 0px' });
    this.io.observe(section);
    /* When to rain: every time the section comes in from above — armed once
       it has gone (its top below 95% of the screen: scrolled back up past
       it), it falls when the top comes up past 72%. The moment it has gone,
       the old pile is cleared, out of sight, so each return is a clean sky
       to rain into — not the old pile showing for a moment and then swept
       away for the new one. Watched by the browser, after it has drawn the
       frame, rather than read in tick(): there it made the browser restyle
       the page mid-frame, every frame, while the work reel above was
       moving. */
    const last = (entries) => entries[entries.length - 1];
    this.armIo = new IntersectionObserver((entries) => {
      const e = last(entries);
      if (e.isIntersecting || e.boundingClientRect.top <= 0) return;
      this.armed = true;
      this.pending = false;
      if (this.bodies.length) {
        this.bodies = [];
        this.order = [];
        this.awake = false;
      }
    }, { rootMargin: '0px 0px -5% 0px' });
    this.fireIo = new IntersectionObserver((entries) => {
      if (last(entries).isIntersecting && this.armed) {
        this.armed = false;
        this.pending = true;
        /* (Here before the maps are on the GPU: finish them without waiting
           for quiet moments — PlanetScene.warm.) */
        if (!this.scene.warmed) this.scene.hurry = true;
      }
    }, { rootMargin: '0px 0px -28% 0px' });
    /* Drawn only while it's actually on screen: just above it the work
       reel is moving, and the planets (which keep turning) needn't be
       redrawn under it. The physics still runs while it's near. */
    this.visIo = new IntersectionObserver((entries) => {
      this.visible = last(entries).isIntersecting;
    }, { rootMargin: '20% 0px 20% 0px' });   // (a little early, so it's never shown stale)
    this.armIo.observe(section);
    this.fireIo.observe(section);
    this.visIo.observe(section);
    /* Watch the section's own size, so any change (window, rotation,
       devtools) refits the pile, whoever else notices it. */
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(section);
    this.resize();
  }

  /* ------------------------------------------------- WebGL, or 2D */

  /** Load a scene's maps and get it ready to draw; a failure falls back to 2D. */
  ready(scene) {
    Promise.resolve()
      .then(() => scene.load(PlanetShower.capacity()))
      .then(() => scene.warm())
      .catch((err) => {
        if (scene !== this.scene || this.gone) return;
        if (this.flat) {
          gpu.warn('planets (2D) failed too, showing the text alone', err);
          this.dead = true;
          this.stop();
          return;
        }
        this.toFlat('their maps failed to load', err);
      });
  }

  /** Log the WebGL context's loss (the shower goes on in 2D) and its return (back to WebGL). */
  watch() {
    this.untrack = gpu.track('planets (PlanetScene)', this.canvas, {
      onLost: (e) => {
        e.preventDefault();
        this.toFlat(null, null, true);
      },
      onRestored: () => this.backToGl()
    });
  }

  /** The largest a body of `type` is drawn on this screen (CSS px). */
  largest(type) {
    const row = BODIES.find((r) => r[0] === type);
    const w = this.W || this.section.clientWidth;
    const h = this.H || this.section.clientHeight;
    return (row ? row[1] : 42) * GROW * plan(w, h).unit * 1.07 * PAD;
  }

  /**
   * Go on in 2D, on a canvas of its own (one that has had a WebGL context
   * can't give a 2D one). With `hold`, the WebGL scene is kept aside to come
   * back to when its context does; otherwise it's let go.
   */
  toFlat(reason, err, hold = false) {
    if (this.flat || this.gone || this.dead) return;
    if (reason) gpu.warn(`planets: ${reason}, showing them in 2D`, ...(err ? [err] : []));
    const old = this.canvas;
    const canvas = document.createElement('canvas');
    canvas.className = old?.className || 'planet-canvas';
    canvas.setAttribute('aria-hidden', 'true');
    if (old?.isConnected) old.replaceWith(canvas);
    else this.section.querySelector('.planet-canvas')?.replaceWith(canvas);
    if (this.scene) {
      if (hold) this.held = { scene: this.scene, canvas: old };
      else {
        this.untrack?.();
        this.untrack = null;
        this.scene.dispose();
      }
    }
    this.canvas = canvas;
    try {
      this.scene = new PlanetSprites(canvas, { radius: (t) => this.largest(t) });
    } catch (e) {
      gpu.warn('planets: no 2D canvas either, showing the text alone', e);
      canvas.remove();
      this.scene = null;
      this.dead = true;
      this.stop();
      return;
    }
    this.flat = true;
    if (this.W) this.scene.resize(this.W, this.H);
    /* (Wanted now, if a shower is waiting or a pile is showing.) */
    if (this.pending || this.bodies.length) this.scene.hurry = true;
    if (this.prepared || this.pending || this.bodies.length) this.ready(this.scene);
  }

  /** The WebGL context is back: put the maps up again, then swap the 3D planets back in. */
  backToGl() {
    const held = this.held;
    if (!held || this.gone) return;
    const scene = held.scene;
    Promise.resolve()
      .then(() => scene.load(PlanetShower.capacity()))
      .then(() => {
        scene.warmed = false;
        scene.warming = null;
        scene.blank = false;
        return scene.warm();
      })
      .then(() => {
        if (this.gone || this.held !== held || scene.renderer.getContext().isContextLost()) return;
        this.canvas.replaceWith(held.canvas);
        this.scene.dispose();
        this.scene = scene;
        this.canvas = held.canvas;
        this.held = null;
        this.flat = false;
        this.scene.resize(this.W, this.H);
      })
      .catch((err) => gpu.warn('planets: couldn\'t rebuild after the context came back, staying in 2D', err));
  }

  resize() {
    if (this.dead) return;
    const w = this.section.clientWidth;
    const h = this.section.clientHeight;
    const changed = w !== this.W || h !== this.H;
    this.W = w;
    this.H = h;
    this.scene.resize(w, h);
    if (!changed || !this.bodies.length) return;
    /* A real change of screen (a phone turned, a window going from phone
       width to laptop): this pile was planned for another size. Once the
       resizing stops, rain a fresh one sized for this screen if the section
       is in view; otherwise clear it, and the next visit brings a fresh
       shower anyway. */
    const next = plan(w, h);
    const shifted = Math.abs(next.unit / this.plan.unit - 1) > 0.1
      || Math.abs(next.howMany / this.plan.howMany - 1) > 0.1;
    clearTimeout(this.refit);
    if (shifted) {
      this.refit = setTimeout(() => {
        if (this.dead) return;
        const r = this.section.getBoundingClientRect();
        if (r.top < window.innerHeight && r.bottom > 0 && this.scene.warmed) this.shower({ reveal: false });
        else {
          this.bodies = [];
          this.order = [];
          this.awake = false;
        }
      }, 250);
    }
    /* Meanwhile (or for a small change, for good): keep everyone inside
       the new box; they'll settle again. */
    for (const b of this.bodies) {
      b.x = Math.min(Math.max(b.x, b.ex), w - b.ex);
      b.y = Math.min(b.y, h - b.ey);
    }
    this.awake = true;
  }

  /* ------------------------------------------------------------ shower */

  /** reveal: also replay the heading's entrance (not when it's only refitting a resized screen). */
  shower({ reveal = true } = {}) {
    const W = this.W;
    this.plan = plan(W, this.H);
    const { unit, howMany } = this.plan;
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
    this.order = list.slice();
    this.clock = 0;
    this.still = 0;
    this.awake = true;
    if (reveal) this.onShower?.();
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

    /* Broad phase: bodies sorted by their left edge (an insertion sort —
       the order barely changes from one step to the next; ones not yet
       falling go last). A pair only needs testing while their spans
       overlap across, which skips most of them. */
    const order = this.order;
    for (const b of order) b.lo = b.live ? b.x - b.r : Infinity;
    for (let i = 1; i < order.length; i++) {
      const b = order[i];
      let j = i - 1;
      while (j >= 0 && order[j].lo > b.lo) {
        order[j + 1] = order[j];
        j--;
      }
      order[j + 1] = b;
    }

    /* The pairs that might touch during this step, found once and reused
       by every pass: those whose spans overlap across (the sweep above),
       and down too. In a deep pile, each body shares its column with
       dozens of others far above or below it, and every pass used to test
       each of those again. (A little slack either way: everyone shifts
       slightly over the passes.) */
    const n = order.length;
    const pairs = this.pairs || (this.pairs = []);
    let np = 0;
    for (let i = 0; i < n; i++) {
      const a = order[i];
      if (!a.live) break;
      const right = a.x + a.r + 8;
      for (let j = i + 1; j < n; j++) {
        const b = order[j];
        if (b.lo > right) break;
        if (Math.abs(b.y - a.y) > a.r + b.r + 8) continue;
        pairs[np++] = a;
        pairs[np++] = b;
      }
    }
    for (let it = 0; it < ITERATIONS; it++) {
      for (let k = 0; k < np; k += 2) {
        const a = pairs[k];
        const b = pairs[k + 1];
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
    /* (Under the open phone menu: unseen.) */
    if (this.dead || store.covered) return;
    const now = performance.now();
    const delta = now - this.last;
    const dt = Math.min(delta / 1000, 1 / 30);
    this.last = now;
    this.time += dt;

    /* (`pending`: the section has come in — see armIo/fireIo. A fresh
       shower falls each time it comes in; in between, nothing resets.)
       Let it fall once the maps are in and on the GPU (they start loading
       well before). */
    if (this.pending && this.scene.warmed) {
      this.pending = false;
      if (this.section.clientWidth !== this.W || this.section.clientHeight !== this.H) this.resize();
      this.shower();
    }

    if (this.awake) {
      /* Fixed steps: the solver takes velocity from movement over the step,
         so an uneven step would feed jitter into the pile and keep it from
         ever resting. Leftover time carries over to the next frame. */
      this.acc = Math.min((this.acc || 0) + dt, STEP * 16);
      /* Never more than CATCH_UP steps in one frame: a slow frame (a busy
         phone) used to be followed by one doing twice the work to catch
         up — slow again, so the next did as much — and the fall stuttered
         on. The time beyond that is let go instead: for a moment the
         planets fall a touch slower, but every frame shows. */
      let steps = 0;
      while (this.acc >= STEP) {
        if (++steps > CATCH_UP) {
          this.acc = 0;
          break;
        }
        this.acc -= STEP;
        this.clock += STEP;
        this.step(STEP);
        this.settle(STEP);
        if (!this.awake) break;
      }
    }
    /* (Drawn at a steady 60 fps on a phone with a faster screen:
       core/pace.js. The falling itself is worked out every frame.) Once
       the pile has come to rest, every other frame: the planets only turn
       on their axes then, slowly — well under a pixel a frame — and it
       looks the same, for half the GPU's work. */
    if (this.visible && this.pace(delta)) {
      this.calm = !this.awake && !this.drag && !this.calm;
      if (!this.calm) {
        this.draw();
        this.judge(now);
      }
    }
  };

  /**
   * Phones: whether this one keeps up with the planets drawn as finely as
   * they are there (PlanetScene planetDpr). Over each 40 of their frames
   * (two-thirds of a second), if more than one in five came late — a frame
   * missed — they're drawn a notch coarser from then on: a little softer,
   * never stuttering. (Only while they're falling or dragged, when every
   * frame is drawn: see tick.)
   */
  judge(now) {
    const last = this.drawnAt;
    this.drawnAt = now;
    if (this.flat || !this.scene?.fine || this.scene.blank || !this.awake || !last || now - last > 250) {
      this.judging = null;
      return;
    }
    const want = drawInterval();
    const j = this.judging || (this.judging = { n: 0, late: 0 });
    j.n++;
    if (now - last > want * 1.5) j.late++;
    if (j.n < 40) return;
    if (j.late > j.n * 0.2) {
      this.scene.coarsen();
      console.info(`[planets] a notch coarser from now on: ${j.late} of ${j.n} frames came late`);
    }
    this.judging = null;
  }

  draw() {
    /* (`awake`: a pile at rest needn't be redrawn in 2D. The 3D planets
       keep turning, so they ignore it.) */
    this.scene.render(this.bodies, this.time, this.awake);
  }

  destroy() {
    this.gone = true;
    this.stop();
    clearTimeout(this.refit);
    clearTimeout(this.prepareAt);
    this.prepared = true;
    this.loadIo?.disconnect();
    this.io?.disconnect();
    this.armIo?.disconnect();
    this.fireIo?.disconnect();
    this.visIo?.disconnect();
    this.ro?.disconnect();
    this.section.removeEventListener('pointerdown', this.onDown);
    this.section.removeEventListener('pointermove', this.onMove);
    this.section.removeEventListener('pointerup', this.onUp);
    this.section.removeEventListener('pointercancel', this.onUp);
    this.section.removeEventListener('pointerleave', this.onLeave);
    if (this.held) {
      this.held.scene.dispose();
      this.held = null;
    }
    if (!this.scene) return;
    if (this.dead || this.flat || this.scene.renderer.getContext().isContextLost()) {
      this.untrack?.();
      this.scene.dispose();
      return;
    }
    /* Kept, emptied, for the next page that has the shower — out of this
       page, so it doesn't hold the rest of the old page in memory. (On a
       phone, let go if the next page has none: gpu.js.) */
    this.scene.render([], 0);
    this.canvas.remove();
    const parts = { scene: this.scene, canvas: this.canvas, small: this.small, untrack: this.untrack };
    parts.claim = gpu.keep(() => {
      if (kept !== parts) return;
      kept = null;
      parts.untrack();
      parts.scene.dispose();
    });
    kept = parts;
  }
}
