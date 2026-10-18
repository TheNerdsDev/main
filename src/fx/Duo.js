import gsap from 'gsap';
import store from '../core/Store.js';
import { team, main } from '../content/site.js';
import SpaceRocks from './SpaceRocks.js';
import { RockThrow, RockImpact } from './Rock.js';
import { Zap } from './Zap.js';
import { eyeMap } from './eyeMap.js';
import { faceMap } from './faceMap.js';
import NeonSketch from './NeonSketch.js';
import { hexToRgb, clamp } from './particles.js';

/* Sketch viewBox width — matches the markup in generate-pages.mjs. */
const VIEW_W = 400;
/* The flash of shock on impact: eyes widen by this fraction of their radius. */
const SHOCK = 0.55;
/* Orbit speed at rest, radians per second. Always clockwise. */
const SPEED = 0.17;
/* The part of each sketch the rocks steer round: the figure itself, from
   the top of the hair down past the name under it (fractions of the drawing). */
const FIGURE = { y: 0.6, rx: 0.25, ry: 0.47 };
/*
 * Each rock's own orbit, deliberately uneven so the four never read as a
 * set piece: their own starting places, distances, sizes and rhythms.
 *   start  where it starts on its orbit (radians)
 *   r      orbit size relative to the others
 *   size   rock size
 *   phase  offsets its speed and distance wobbles
 */
const ORBITS = [
  { start: 0.35, r: 1.0, size: 1.0, phase: 0 },
  { start: 1.95, r: 0.93, size: 0.8, phase: 2.1 },
  { start: 3.3, r: 1.12, size: 1.12, phase: 4.2 },
  { start: 4.75, r: 1.05, size: 0.9, phase: 1.3 }
];

/* The welcome copy, left of the sketches: the rocks keep to its right. */
const TEXT = '.hero .title .line-inner, .hero-intro, .scroll-cue';

/* The rock hint: comes up once the hero has been still this long (s), and
   the rock carrying it slows to this pace so it can be read and caught.
   After the first throw it never comes back (remembered in the browser). */
const HINT_AFTER = 2.5;
const HINT_PACE = 0.35;
const HINT_KEY = 'nerds:threw';

/* The rocks keep their places round the loop (see loop()): each wobbles
   ahead and behind its place by up to `wobble` of a loop, on its own
   rhythm, and one that fell behind (paused under the pointer, slowed for
   the hint) catches up at most `catchUp` faster than the rest. */
const SPREAD = { wobble: 0.02, catchUp: 0.45 };
const TAU = Math.PI * 2;
/* Points along a loop when measuring it (angleAt). */
const LOOP_STEPS = 36;

/** Keep `v` within lo..hi, rounding off as it nears either end instead of stopping dead. */
const soften = (v, lo, hi, band) => {
  if (v > hi - band) return hi - band + band * Math.tanh((v - hi + band) / band);
  if (v < lo + band) return lo + band - band * Math.tanh((lo + band - v) / band);
  return v;
};

const XLINK = 'http://www.w3.org/1999/xlink';
const setHref = (node, url) => {
  node.setAttribute('href', url);
  node.setAttributeNS(XLINK, 'xlink:href', url);
};

/**
 * The two neon sketches and the space rocks drifting around them.
 *
 *  - Click a sketch: it winds up and throws a space rock at the other.
 *  - Click a floating rock: whoever it is drifting nearest grabs that very
 *    rock and flings it at the other one; it drifts back in afterwards.
 *
 * A hit bursts the rock, knocks the sketch back and shorts its neon —
 * arcs crackle and spark, the tube stutters, and it sees stars. A finished
 * portrait switches to its angry picture for a few seconds; a line sketch's
 * face reacts in three beats instead: a flash of shock (eyes wide), a wince
 * of pain, then anger — or sadness, if they started it and this is the
 * payback — before it relaxes.
 */
export default class Duo {
  constructor(el, fx, stage) {
    this.el = el;
    this.fx = fx;
    this.stage = stage;

    this.members = team.map((m) => {
      const root = el.querySelector(`[data-sketch="${m.id}"]`);
      const h = VIEW_W / m.aspect;
      /* A finished portrait swaps to its angry picture when hit; only a
         line sketch has eyes and a face for the expression warps. */
      const eyeUrl = m.eyes ? eyeMap(VIEW_W, h, m.eyes, m.eyeR) : null;
      if (eyeUrl) setHref(root.querySelector('.eye-map'), eyeUrl);

      const faces = {};
      if (m.face) {
        ['hurt', 'angry', 'sad'].forEach((name) => {
          faces[name] = faceMap(VIEW_W, h, m.face, m.eyes, m.eyeR, name);
        });
      }
      const [mapA, mapB] = root.querySelectorAll('.face-map');
      const [warpA, warpB] = root.querySelectorAll('.face-warp');
      if (faces.hurt) {
        setHref(mapA, faces.hurt.url);
        setHref(mapB, faces.angry.url);
      }

      const gasp = document.createElement('span');
      gasp.className = 'sketch-gasp';
      gasp.setAttribute('aria-hidden', 'true');
      gasp.textContent = '!';
      root.querySelector('.sketch-body').appendChild(gasp);

      /* Drawn on the GPU, so a reacting face costs next to nothing; the SVG
         filter stays as the fallback. */
      const host = root.querySelector('.sketch-svg');
      const neon = faces.hurt
        ? new NeonSketch(host, {
          src: m.sketch,
          view: [VIEW_W, h],
          colour: m.colour,
          ink: m.ink,
          maps: { eye: eyeUrl, hurt: faces.hurt.url, angry: faces.angry.url, sad: faces.sad.url }
        })
        : null;

      return {
        ...m,
        root,
        neon,
        body: root.querySelector('.sketch-body'),
        svg: host,
        hitBtn: root.querySelector('.sketch-hit'),
        calm: root.querySelector('.sketch-face:not(.sketch-face-angry)'),
        angry: root.querySelector('.sketch-face-angry'),
        gasp,
        faces,
        mapB,
        rgb: hexToRgb(m.colour),
        rad: m.eyeR * VIEW_W,
        /* Animated filter strengths, pushed into the SVG in loop(). */
        warps: [
          { node: root.querySelector('.eye-warp'), v: 0, shown: -1 },
          { node: warpA, v: 0, shown: -1 },
          { node: warpB, v: 0, shown: -1 }
        ]
      };
    });

    this.actions = [...el.querySelectorAll('.duo-action')].map((btn, i) => {
      const orbit = ORBITS[i % ORBITS.length];
      return { btn, i, orbit, hovered: false, pace: 1, lag: 0, angle: orbit.start, x: 0, y: 0 };
    });
    this.rocks = new SpaceRocks(this.actions.map((a) => a.btn));
    this.actionsEl = el.querySelector('.duo-actions');
    this.f = 0;
    /* How far round the loop the group is, in loops (loop()). */
    this.clock = 0;
    this.loopLens = new Float64Array(LOOP_STEPS + 1);
    this.k = 0;
    this.gone = false;

    this.makeHint();
    this.bind();
    this.idle();
    this.measure();

    this.last = performance.now();
    gsap.ticker.add(this.loop);
  }

  other(m) { return this.members.find((x) => x !== m); }

  /** A point on a sketch, in viewport px, from fractions of its drawing. */
  point(m, [fx, fy]) {
    const r = m.body.getBoundingClientRect();
    return { x: r.left + fx * r.width, y: r.top + fy * r.height };
  }

  /* ------------------------------------------------------------ events */

  bind() {
    this.handlers = [];
    const on = (node, type, fn) => {
      node.addEventListener(type, fn);
      this.handlers.push(() => node.removeEventListener(type, fn));
    };

    this.members.forEach((m) => on(m.hitBtn, 'click', () => {
      this.learned();
      this.throw(m);
    }));
    this.members.forEach((m) => this.bindTap(m, on));

    this.actions.forEach((a) => {
      on(a.btn, 'pointerenter', () => { a.hovered = true; });
      on(a.btn, 'pointerleave', () => { a.hovered = false; });
      on(a.btn, 'focus', () => { a.hovered = true; });
      on(a.btn, 'blur', () => { a.hovered = false; });
      on(a.btn, 'click', () => this.fling(a));
    });
  }

  /**
   * Hovering a portrait: "Tap" rides along its outline, at the point of the
   * edge nearest the pointer, just outside the glow — out on the dark,
   * where it can be read (under the pointer it vanished into the picture).
   * It glides round the edge as the pointer moves; the bottom edge is left
   * to the name. Mouse and trackpad only, like the cursor's own labels.
   */
  bindTap(m, on) {
    if (!m.calm || !window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    const tag = document.createElement('span');
    tag.className = 'sketch-tap';
    tag.setAttribute('aria-hidden', 'true');
    tag.textContent = 'Tap';
    m.root.appendChild(tag);
    const toX = gsap.quickTo(tag, 'x', { duration: 0.35, ease: 'power3.out' });
    const toY = gsap.quickTo(tag, 'y', { duration: 0.35, ease: 'power3.out' });

    /* The outline, traced once from the picture itself: for each direction
       out from the middle of the face, the outermost point that's part of
       the portrait (fractions of the box). */
    const N = 144;
    const CX = 0.5;
    const CY = 0.62;
    let edge = null;
    const trace = () => {
      const w = 200;
      const h = 250;
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(m.calm, 0, 0, w, h);
      const px = g.getImageData(0, 0, w, h).data;
      const out = [];
      for (let i = 0; i < N; i++) {
        const t = (i / N) * Math.PI * 2;
        const dx = Math.cos(t);
        const dy = Math.sin(t);
        let hit = null;
        for (let r = Math.hypot(w, h); r > 0; r -= 0.5) {
          const x = Math.round(CX * w + dx * r);
          const y = Math.round(CY * h + dy * r);
          if (x < 0 || y < 0 || x >= w || y >= h) continue;
          if (px[(y * w + x) * 4 + 3] > 60) {
            hit = [x / w, y / h];
            break;
          }
        }
        out.push(hit || [CX, CY]);
      }
      return out;
    };

    const place = (e, snap) => {
      const box = m.root.getBoundingClientRect();
      if (!box.width) return;
      const cx = CX * box.width;
      const cy = CY * box.height;
      const t = Math.atan2(e.clientY - box.top - cy, e.clientX - box.left - cx);
      let i = ((Math.round((t / (Math.PI * 2)) * N) % N) + N) % N;
      /* The flat bottom edge belongs to the name: slide to the nearest
         point that isn't on it (the corners of the shoulders). */
      if (edge[i][1] > 0.97) {
        for (let k = 1; k < N / 2; k++) {
          const a = (i + k) % N;
          const b = (i - k + N) % N;
          if (edge[a][1] <= 0.97) { i = a; break; }
          if (edge[b][1] <= 0.97) { i = b; break; }
        }
      }
      const bx = edge[i][0] * box.width;
      const by = edge[i][1] * box.height;
      const len = Math.hypot(bx - cx, by - cy) || 1;
      const gap = 18;   // px out from the edge, clear of the glow
      const x = bx + ((bx - cx) / len) * gap;
      const y = by + ((by - cy) / len) * gap;
      /* Arriving: start right there; moving: glide after the pointer. */
      if (snap) gsap.set(tag, { x, y });
      toX(x);
      toY(y);
    };

    on(m.hitBtn, 'pointerenter', (e) => {
      if (!edge) {
        if (!m.calm.complete || !m.calm.naturalWidth) return;
        edge = trace();
      }
      place(e, true);
      m.root.classList.add('is-tapping');
    });
    on(m.hitBtn, 'pointermove', (e) => { if (edge) place(e, false); });
    on(m.hitBtn, 'pointerleave', () => m.root.classList.remove('is-tapping'));
  }

  /* -------------------------------------------------------------- hint */

  /**
   * Nothing says the rocks can be thrown — so until a visitor has thrown
   * one, a rock carries a hint: the dashed target ring the cursor shows
   * over a rock, a slow ping, and "Click a rock / and throw it at the
   * other nerd" beside it. It comes up once the hero has been still a
   * moment, on the free rock nearest the middle of the two, and rides
   * along with it (that rock slows down, to be read and caught). It steps
   * aside while the pointer is on that rock — the cursor says "Throw"
   * itself — and goes for good after the first throw.
   */
  makeHint() {
    this.hintCalm = 0;
    let done = false;
    try { done = localStorage.getItem(HINT_KEY) === '1'; } catch { /* no storage: show it */ }
    if (done || !this.actionsEl || !this.actions.length) return;
    const touch = !window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const el = document.createElement('div');
    el.className = 'rock-hint';
    el.setAttribute('aria-hidden', 'true');
    el.innerHTML = '<span class="rock-hint-ring"><span class="rock-hint-ping"></span></span>'
      + '<span class="rock-hint-label"><span class="rock-hint-cta"></span><span class="rock-hint-line"></span></span>';
    el.querySelector('.rock-hint-cta').textContent = touch ? main.rockHint.tap : main.rockHint.click;
    el.querySelector('.rock-hint-line').textContent = main.rockHint.line;
    this.actionsEl.appendChild(el);
    this.hint = {
      el,
      ring: el.querySelector('.rock-hint-ring'),
      label: el.querySelector('.rock-hint-label'),
      act: null,
      stale: false,
      shown: false,
      side: null,
      spot: null
    };
  }

  /** Something was thrown: the hint has done its job, for good. */
  learned() {
    const h = this.hint;
    if (!h) return;
    this.hint = null;
    try { localStorage.setItem(HINT_KEY, '1'); } catch { /* it comes back next visit */ }
    h.el.classList.remove('is-on');
    this.hintGone = gsap.delayedCall(0.8, () => h.el.remove());
  }

  /**
   * Where the label could go round a rock at (x, y) — under, over, right,
   * left — each with how much of it would land on a sketch, another rock,
   * the welcome copy, the header or off the screen (px², lower is better).
   */
  hintSpots(x, y, room, self) {
    const h = this.hint;
    const { w, lh, r } = h;
    /* Clear of the ping too, which swells to 1.6 times the ring. */
    const gap = r * 0.3 + 6;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const spots = [
      [-w / 2, r + gap],
      [-w / 2, -(r + gap + lh)],
      [r + gap + 4, -lh / 2],
      [-(r + gap + 4 + w), -lh / 2]
    ];
    const over = (ax, ay, bx0, by0, bx1, by1) =>
      Math.max(0, Math.min(ax + w, bx1) - Math.max(ax, bx0)) * Math.max(0, Math.min(ay + lh, by1) - Math.max(ay, by0));
    return spots.map(([dx, dy]) => {
      const ax = x + dx;
      const ay = y + dy;
      let bad = w * lh - over(ax, ay, 12, Math.max(this.ceiling, room.roof + 8), vw - 12, vh - 12);
      for (const f of room.faces) bad += over(ax, ay, f.left - 6, f.top - 6, f.right + 6, f.bottom + 6);
      if (room.wall > -Infinity) bad += over(ax, ay, -Infinity, -Infinity, room.wall + 12, Infinity);
      for (const o of this.actions) {
        if (o === self || o.away) continue;
        const or = (this.orb || 60) * 0.42 * o.orbit.size * 1.1;
        bad += over(ax, ay, o.x - or, o.y - or, o.x + or, o.y + or);
      }
      return { dx, dy, bad };
    });
  }

  /** The free rock whose label has the most room, then the one nearest the middle. */
  hintRock(room) {
    const [p, q] = room.faces;
    const mx = p && q ? (p.left + p.right + q.left + q.right) / 4 : window.innerWidth / 2;
    const my = p && q ? (p.top + p.bottom + q.top + q.bottom) / 4 : window.innerHeight / 2;
    let best = null;
    let score = Infinity;
    for (const act of this.actions) {
      if (act.away) continue;
      this.hint.act = act;
      this.sizeHint();
      const clear = Math.min(...this.hintSpots(act.x, act.y, room, act).map((s) => s.bad));
      const s = clear + Math.hypot(act.x - mx, act.y - my);
      if (s < score) {
        score = s;
        best = act;
      }
    }
    return best;
  }

  /** The ring sized to its rock, and the label measured (on pick and resize). */
  sizeHint() {
    const h = this.hint;
    if (!h?.act) return;
    h.r = (this.orb || 60) * 0.42 * h.act.orbit.size * 1.1 + 12;
    h.ring.style.width = h.ring.style.height = `${(h.r * 2).toFixed(1)}px`;
    h.w = h.label.offsetWidth;
    h.lh = h.label.offsetHeight;
  }

  /**
   * Every frame (from loop): up or not, and where. `room` is what the label
   * keeps clear of — the sketches' boxes and the welcome copy's right edge,
   * as the loop has just measured them.
   */
  steerHint(dt, room) {
    const h = this.hint;
    if (!h) return;
    const html = document.documentElement;
    const still = this.f === 0 && html.classList.contains('loaded') && !html.classList.contains('is-transitioning');
    this.hintCalm = still ? this.hintCalm + dt : 0;
    /* Away and back again: pick afresh, wherever the rocks are by then. */
    if (!still) h.stale = true;
    const due = this.hintCalm > HINT_AFTER;
    if (due && (h.stale || !h.act)) {
      h.act = this.hintRock(room);
      h.stale = false;
      h.spot = null;
      this.sizeHint();
    }
    const a = h.act;
    const on = due && !!a && !a.away && !a.hovered;
    if (on !== h.shown) {
      h.shown = on;
      h.el.classList.toggle('is-on', on);
    }
    /* (Hidden — or fading out where it was — it isn't placed: that was
       the label's room worked out and two transforms written every frame,
       through the whole trip down the page.) */
    if (!a || !on) return;

    /* The label on whichever side of the rock is clear, moving round only
       when another side is clearly better, and gliding there. */
    const spots = this.hintSpots(a.x, a.y, room, a);
    let pick = h.side ?? 0;
    const best = spots.reduce((i, s, k) => (s.bad < spots[i].bad ? k : i), 0);
    if (h.spot === null || spots[best].bad < spots[pick].bad - h.w * h.lh * 0.15) pick = best;
    h.side = pick;
    const to = spots[pick];
    if (h.spot === null) h.spot = { x: to.dx, y: to.dy };
    const k = Math.min(1, dt * 7);
    h.spot.x += (to.dx - h.spot.x) * k;
    h.spot.y += (to.dy - h.spot.y) * k;
    /* Still on the screen sideways, whatever side it's on. */
    const lx = clamp(a.x + h.spot.x, 12, window.innerWidth - h.w - 12) - a.x;
    h.el.style.transform = `translate3d(${a.x.toFixed(1)}px, ${a.y.toFixed(1)}px, 0)`;
    h.label.style.transform = `translate3d(${lx.toFixed(1)}px, ${h.spot.y.toFixed(1)}px, 0)`;
  }

  /**
   * The rocks' trip alongside the viewer, set by the page every frame.
   *   f     0 = orbiting the sketches; 1 = travelling with the viewer,
   *         still circling, now round the middle of the screen
   *   k     0 → 1: their orbits tighten until they meet in the middle
   *   gone  broken apart — the fragments have taken over
   * They keep circling clockwise the whole way; nothing lines up.
   */
  setJourney(f, k, gone) {
    if (f > 0 && this.f === 0) {
      /* Anything mid-throw-and-respawn snaps back so all four come along. */
      this.actions.forEach((a) => {
        if (!a.away) return;
        a.back?.kill();
        const c = a.btn.querySelector('.duo-action-rock');
        gsap.killTweensOf(c);
        gsap.set(c, { opacity: 1, clearProps: 'transform' });
        a.away = false;
        a.btn.classList.remove('is-away');
      });
    }
    this.f = f;
    this.k = k;
    this.gone = gone;
    this.rocks.frenzy = k * k;
    if (this.actionsEl) {
      this.actionsEl.style.pointerEvents = f > 0 ? 'none' : '';
      this.actionsEl.style.visibility = gone ? 'hidden' : '';
    }
  }

  /** Where the rocks met (viewport px): the centre, and each rock as it was. */
  meeting() {
    return {
      at: { x: store.width / 2, y: store.height / 2 },
      rocks: this.actions.map((a) => ({ x: a.x, y: a.y, size: a.orbit.size }))
    };
  }

  /** Size of a floating rock at the moment of impact, px. */
  rockRadius() { return (this.orb || 60) * 0.42 * 1.4; }

  /** Centre of a floating rock, in viewport px. */
  rockCentre(a) {
    const r = a.btn.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  /**
   * A floating rock was clicked: the sketch it is closest to winds up and
   * flings that rock at the other one. The rock leaves its orbit for the
   * flight and drifts back in a moment after the hit.
   */
  fling(a) {
    if (a.away) return;
    this.learned();
    const c = this.rockCentre(a);
    const [p, q] = this.members;
    const near = (m) => {
      const o = this.point(m, [0.5, 0.5]);
      return Math.hypot(o.x - c.x, o.y - c.y);
    };
    const from = near(p) <= near(q) ? p : q;
    if (from.throwing) return;

    a.away = true;
    a.hovered = false;
    a.btn.classList.add('is-away');
    const canvas = a.btn.querySelector('.duo-action-rock');

    this.throw(from, {
      origin: () => this.rockCentre(a),
      /* Read at the moment of release, so it leaves exactly as it looks. */
      rock: () => this.rocks.pose(a.btn),
      radius: a.btn.offsetWidth * 0.42,
      onLaunch: () => gsap.to(canvas, { opacity: 0, duration: 0.06, overwrite: 'auto' }),
      then: () => {
        a.back = gsap.delayedCall(1.1, () => {
          gsap.fromTo(canvas, { opacity: 0, scale: 0.3 }, {
            opacity: 1, scale: 1, duration: 1.2, ease: 'expo.out', clearProps: 'transform',
            onComplete: () => {
              a.away = false;
              a.btn.classList.remove('is-away');
            }
          });
        });
      }
    });
  }

  /* -------------------------------------------------------------- idle */

  idle() {
    this.members.forEach((m, i) => {
      gsap.to(m.root, { y: -9, duration: 2.6 + i * 0.5, ease: 'sine.inOut', yoyo: true, repeat: -1, delay: i * 0.7 });
      gsap.fromTo(m.root, { rotation: -1.1 }, { rotation: 1.1, duration: 3.4 + i * 0.6, ease: 'sine.inOut', yoyo: true, repeat: -1 });
      this.hum(m);
    });
  }

  /** Every so often a neon tube stutters on its own. */
  hum(m) {
    m.humCall = gsap.delayedCall(gsap.utils.random(3, 8), () => {
      gsap.to(m.svg, {
        keyframes: [{ opacity: 0.55, duration: 0.04 }, { opacity: 1, duration: 0.05 }, { opacity: 0.75, duration: 0.03 }, { opacity: 1, duration: 0.08 }]
      });
      this.hum(m);
    });
  }

  /* ------------------------------------------------------------ throws */

  /**
   * `origin` / `rock` / `radius` let a floating rock be the one thrown;
   * by default a rock appears at the thrower's hand.
   */
  throw(from, { then, origin, rock, radius: size, onLaunch } = {}) {
    if (from.throwing) return;
    from.throwing = true;
    const to = this.other(from);
    /* Hit out of nowhere: angry. Hit back after throwing first: sad. */
    const mood = this.lastThrower === to ? 'sad' : 'angry';
    this.lastThrower = from;

    const a = this.point(from, [0.5, 0.5]);
    const b = this.point(to, [0.5, 0.5]);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const v = { x: (b.x - a.x) / len, y: (b.y - a.y) / len };
    const radius = size || clamp(from.body.offsetWidth * 0.1, 15, 34);

    const launch = () => {
      onLaunch?.();
      this.fx.add(new RockThrow({
        stage: this.stage,
        from: origin || (() => this.point(from, from.hand)),
        rock: typeof rock === 'function' ? rock() : rock,
        to: () => this.point(to, to.hit),
        tint: from.rgb,
        radius,
        duration: clamp(len / 620, 0.7, 1.15),
        onImpact: (at, dir) => {
          from.throwing = false;
          this.hit(to, at, dir, mood);
          then?.();
        }
      }));
    };

    /* Wind up away from the target, then snap forward and release. */
    gsap.timeline()
      .to(from.body, { x: -v.x * 14, y: -v.y * 10 + 4, rotation: -v.x * 7, duration: 0.34, ease: 'power2.out' })
      .to(from.body, { x: v.x * 22, y: v.y * 14, rotation: v.x * 5, duration: 0.13, ease: 'power3.in' })
      .add(launch)
      .to(from.body, { x: 0, y: 0, rotation: 0, duration: 0.95, ease: 'power3.out' });
  }

  hit(m, at, dir, mood) {
    const scale = clamp(m.body.offsetWidth / 300, 0.6, 1.3);
    this.fx.add(new RockImpact({ at, dir, scale }));
    /* The tube shorts where it was struck, then they see stars. */
    this.fx.add(new Zap({
      at: () => this.point(m, m.hit),
      head: () => this.point(m, m.crown || [0.5, 0.1]),
      colour: m.rgb,
      scale,
      dir
    }));

    /* Knocked back along the line of impact, then a decaying shudder. */
    gsap.killTweensOf(m.body);
    gsap.timeline()
      .to(m.body, { x: dir.x * 28, y: dir.y * 20, rotation: dir.x * 10, duration: 0.09, ease: 'power4.out' })
      .to(m.body, {
        keyframes: [
          { x: -dir.x * 9, rotation: -dir.x * 3, duration: 0.07 },
          { x: dir.x * 6, rotation: dir.x * 2, duration: 0.07 },
          { x: -dir.x * 3, rotation: -dir.x, duration: 0.06 },
          { x: dir.x * 1.5, rotation: dir.x * 0.5, duration: 0.06 }
        ],
        ease: 'sine.inOut'
      })
      .to(m.body, { x: 0, y: 0, rotation: 0, duration: 0.7, ease: 'power3.out' });

    /* The neon stutters as if the tube took the hit. */
    gsap.timeline()
      .set(m.svg, { opacity: 1 })
      .to(m.svg, {
        keyframes: [
          { opacity: 0.2, duration: 0.04 }, { opacity: 1, duration: 0.05 },
          { opacity: 0.45, duration: 0.05 }, { opacity: 1, duration: 0.04 },
          { opacity: 0.7, duration: 0.06 }, { opacity: 1, duration: 0.12 }
        ]
      });

    this.react(m, mood);

    gsap.killTweensOf(m.gasp);
    gsap.timeline()
      .fromTo(m.gasp, { opacity: 0, scale: 0.3, y: 10 }, { opacity: 1, scale: 1, y: 0, duration: 0.24, ease: 'back.out(3)' })
      .to(m.gasp, { opacity: 0, y: -12, duration: 0.45, ease: 'power2.in', delay: 0.55 });
  }

  /**
   * Shock → pain → `mood`. The eyes fly open for an instant, the face
   * screws up in a wince, then cross-fades into anger or sadness, holds,
   * and slowly relaxes.
   */
  react(m, mood) {
    if (m.angry) {
      this.scowl(m);
      return;
    }
    const [eye, hurt, after] = m.warps;
    const faces = m.faces;
    gsap.killTweensOf([eye, hurt, after]);

    gsap.timeline()
      .to(eye, { v: m.rad * SHOCK, duration: 0.1, ease: 'power3.out' })
      .to(eye, { v: 0, duration: 0.35, ease: 'power2.inOut', delay: 0.12 });

    if (!faces.hurt) return;
    const next = faces[mood] || faces.angry;
    setHref(m.mapB, next.url);
    m.neon?.setMood(mood);

    gsap.timeline()
      .set(after, { v: 0 })
      /* Wince — with a few small flinches while the pain lands. */
      .to(hurt, { v: faces.hurt.scale, duration: 0.24, ease: 'power3.out' }, 0.12)
      .to(hurt, { v: faces.hurt.scale * 0.82, duration: 0.07, repeat: 5, yoyo: true, ease: 'sine.inOut' })
      /* …which turns into the mood. */
      .to(hurt, { v: 0, duration: 0.55, ease: 'power2.inOut' }, 1.25)
      .to(after, { v: next.scale, duration: 0.6, ease: 'power2.inOut' }, 1.25)
      /* Hold, then let it go. */
      .to(after, { v: 0, duration: 1.1, ease: 'power2.inOut' }, 3.6);
  }

  /**
   * A portrait's reaction: the angry picture the moment the rock lands, held
   * as long as the drawn faces hold their mood, then straight back to calm.
   * Both are sudden cuts, one picture or the other — the portraits are
   * partly see-through, so the hidden one is hidden outright, never left
   * showing underneath.
   */
  scowl(m) {
    /* Not in yet (it loads once the page is up — loadLate): stay calm. */
    if (!m.angry.complete || !m.angry.naturalWidth) return;
    m.scowlTl?.kill();
    const show = (angry) => {
      m.angry.style.opacity = angry ? '1' : '0';
      m.calm.style.opacity = angry ? '0' : '1';
    };
    show(true);
    m.scowlTl = gsap.delayedCall(3.6, () => show(false));
  }

  /**
   * The angry portraits (~0.65 MB) are only seen when a rock lands, so they
   * load after the page is up, in an idle moment — not alongside everything
   * the loader is waiting for.
   */
  loadLate() {
    const go = () => this.members.forEach((m) => {
      if (m.angry && !m.angry.src && m.angry.dataset.src) m.angry.src = m.angry.dataset.src;
    });
    if ('requestIdleCallback' in window) requestIdleCallback(go, { timeout: 2000 });
    else setTimeout(go, 600);
  }

  /**
   * The angle at which a rock is `share` of the way round its loop,
   * measured along the path as it is this frame — so it moves at an even
   * pace on screen however the path bends round the figures.
   */
  angleAt(place, share) {
    const lens = this.loopLens;
    const step = TAU / LOOP_STEPS;
    let prev = place(0);
    lens[0] = 0;
    for (let k = 1; k <= LOOP_STEPS; k++) {
      const p = place(k * step);
      lens[k] = lens[k - 1] + Math.hypot(p.x - prev.x, p.y - prev.y);
      prev = p;
    }
    const want = share * lens[LOOP_STEPS];
    let k = 1;
    while (k < LOOP_STEPS && lens[k] < want) k++;
    const seg = lens[k] - lens[k - 1];
    return (k - 1 + (seg > 0 ? (want - lens[k - 1]) / seg : 0)) * step;
  }

  /* -------------------------------------------------------------- loop */

  measure() {
    this.W = this.el.offsetWidth;
    this.H = this.el.offsetHeight;
    /* The room the sketches have, for the stylesheet to size them by: on
       tablets and phones the heading takes what it needs first, and the
       sketches have to fit in what's left (main-page.css). */
    this.el.style.setProperty('--duo-w', `${this.W}px`);
    this.el.style.setProperty('--duo-h', `${this.H}px`);
    const page = this.el.closest('.page') || document;
    this.texts = [...page.querySelectorAll(TEXT)];
    const nav = document.querySelector('.site-header');
    this.ceiling = nav ? nav.getBoundingClientRect().bottom + 10 : 0;
    /* Where the sketches' box sits on the page (its top with nothing
       scrolled), for a ceiling that scrolls with the page (loop()). */
    this.homeTop = this.el.getBoundingClientRect().top + window.scrollY;
    this.members.forEach((m) => {
      m.cx = m.root.offsetLeft + m.root.offsetWidth / 2;
      m.cy = m.root.offsetTop + m.root.offsetHeight / 2;
      m.size = m.root.offsetWidth;
    });
    this.orb = this.actions[0]?.btn.offsetWidth || 56;
    this.sizeHint();
  }

  loop = () => {
    /* (Under the open phone menu: unseen.) */
    if (store.covered) return;
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 1 / 30);
    this.last = now;
    const t = now / 1000;

    /* Push the eye / expression strengths to the sketch — the GPU one if
       it's up, otherwise into the SVG filter (only when they change). */
    for (const m of this.members) {
      if (m.neon?.ready) {
        const [e, h, md] = m.warps;
        m.neon.set(e.v, h.v, md.v);
        m.neon.render();
        continue;
      }
      for (const w of m.warps) {
        if (!w.node) continue;
        const v = Math.round(w.v * 10) / 10;
        if (v !== w.shown) {
          w.shown = v;
          w.node.setAttribute('scale', v);
        }
      }
    }

    /* Broken up (About and everything below it): the rocks are hidden and
       stand still, so skip placing them — it read layout and wrote four
       transforms every frame while the work reel was scrolling. */
    if (this.gone) return;

    const [a, b] = this.members;
    if (!a.size) return;
    const o = this.orb;
    const f = this.f;
    /* Ease the hand-over so the orbit bends rather than slides. */
    const fe = f * f * (3 - 2 * f);

    /* Home orbit: a tilted ellipse wrapped around both sketches. It lives in
       the sketches' box; the rocks are placed on the screen. */
    const box = this.el.getBoundingClientRect();
    /* The header is the rocks' ceiling at home — but one that scrolls with
       the page, like the faces: scroll down and the rocks go up with the
       sketches (under the header, as the faces do) rather than being held
       below it, squeezed out of their corner and sent the long way round to
       the other side of a face. With nothing scrolled it's the header's
       edge, as before. */
    const ceil = this.ceiling + (box.top - this.homeTop);
    const hx = box.left + (a.cx + b.cx) / 2;
    const hy = box.top + (a.cy + b.cy) / 2;
    const hTilt = Math.atan2(b.cy - a.cy, b.cx - a.cx);
    const hRx = Math.hypot(b.cx - a.cx, b.cy - a.cy) / 2 + a.size * 0.56;
    const hRy = a.size * 0.74;

    /* Travelling orbit: the same loop, round the middle of the screen. */
    /* (The stable viewport — the address bar sliding doesn't move it.) */
    const vw = store.width;
    const vh = store.height;
    const tRx = Math.min(vw * 0.3, 460);
    const tRy = Math.min(vh * 0.3, 250);

    /* An orbit `fe` of the way from its home loop to the travelling one. */
    const blend = (h) => {
      const tilt = h.tilt + (-0.14 - h.tilt) * fe;
      return {
        cx: h.x + (vw / 2 - h.x) * fe,
        cy: h.y + (vh / 2 - h.y) * fe,
        ct: Math.cos(tilt),
        st: Math.sin(tilt),
        rx: h.rx + (tRx - h.rx) * fe,
        ry: h.ry + (tRy - h.ry) * fe
      };
    };
    const shared = { x: hx, y: hy, tilt: hTilt, rx: hRx, ry: hRy };

    /* Meeting: the orbits tighten slowly, then all at once. */
    const e = Math.pow(this.k, 2.2);

    /* Both heads, so the rocks can swing round them instead of across —
       at home. Setting off, the loop heads for the middle of the screen
       and sweeps across the faces on its way; still pushing round them
       then, a rock's spot flipped from one side of a face to the other.
       So the berth is given up over the first quarter of the trip. */
    const leave = Math.min(1, fe / 0.25);
    const avoid = 1 - leave * leave * (3 - 2 * leave);
    const faces = avoid > 0
      ? this.members.map((m) => {
        const r = m.body.getBoundingClientRect();
        return { box: r, x: r.left + r.width / 2, y: r.top + r.height * FIGURE.y, rx: r.width * FIGURE.rx, ry: r.height * FIGURE.ry };
      })
      : [];
    /* The welcome copy. Beside the sketches (wide screens) it's a wall the
       orbit keeps to the right of; above them (tablets and phones, where
       the heading sits on top) it's a ceiling instead — as a wall it would
       pin every rock to the right edge of the screen. */
    let wall = -Infinity;
    let roof = -Infinity;
    /* (Through the whole trip, not just while the faces are avoided: the
       home loops, and the limits the rocks keep to at home, are built on
       these, and a loop that changed shape halfway out would jump.) */
    if (fe < 1) {
      for (const el of this.texts) {
        const r = el.getBoundingClientRect();
        if (!r.width) continue;
        if (r.bottom <= box.top + 4) roof = Math.max(roof, r.bottom);
        else wall = Math.max(wall, r.right);
      }
    }

    /* Tablets and phones (heading on top, sketches below): the two sketches
       fill the width corner to corner, and one loop round both runs off the
       sides of the screen — the rocks ended up pinned to its edges. There,
       each pair of rocks gets a loop of its own instead, kept on screen. */
    const stacked = roof > -Infinity;
    let homes = null;
    if (stacked) {
      const pad = o * 0.42 * 1.12 * 1.1 + 4;   // the biggest rock's radius, and a little air
      const left = box.left + pad;
      const right = box.right - pad;
      const top = Math.max(box.top, ceil, roof) + pad;
      const bottom = box.bottom - pad;
      /* Here the sketches sit corner to corner (main-page.css), filling the
         width: a loop round either one squeezed through the gap where they
         meet — over the faces, and tangling with the other pair. So each
         pair circles in one of the two open corners instead: beside the
         upper sketch and over the lower one, and under the upper one beside
         the lower. Each loop is kept inside its corner, a rock's width from
         the faces, with room for the orbits' own swell (up to 1.12 × 1.07). */
      const rects = this.members.map((m) => m.body.getBoundingClientRect());
      const upper = rects[0].top <= rects[1].top ? rects[0] : rects[1];
      const lower = upper === rects[0] ? rects[1] : rects[0];
      const upperRight = upper.left + upper.width / 2 > lower.left + lower.width / 2;
      const corners = upperRight
        ? [{ l: left, r: upper.left - pad, t: top, b: lower.top - pad }, { l: lower.right + pad, r: right, t: upper.bottom + pad, b: bottom }]
        : [{ l: upper.right + pad, r: right, t: top, b: lower.top - pad }, { l: left, r: lower.left - pad, t: upper.bottom + pad, b: bottom }];
      homes = rects.map((r, i) => {
        const c = corners[i];
        const w = c.r - c.l;
        const h = c.b - c.t;
        /* Round the sketch: for a corner too small to circle in. */
        const lrx = Math.min(r.width * 0.5 + pad * 0.5, (right - left) / 2);
        const lry = Math.min(r.height * 0.5 + pad * 0.5, (bottom - top) / 2);
        const round = {
          x: clamp(r.left + r.width / 2, left + lrx, right - lrx),
          y: clamp(r.top + r.height * 0.56, top + lry, bottom - lry),
          tilt: 0,
          rx: lrx,
          ry: lry
        };
        /* The corner closes up as the page scrolls the sketches up under the
           header: the loop eases over from the corner to round the sketch,
           rather than jumping there the moment the corner gets too small. */
        const k = clamp((Math.min(w, h) - pad) / (pad * 2), 0, 1);
        const ease = k * k * (3 - 2 * k);
        if (ease <= 0) return round;
        const corner = { x: c.l + w / 2, y: c.t + h / 2, rx: (w / 2) * 0.83, ry: (h / 2) * 0.83 };
        return {
          x: round.x + (corner.x - round.x) * ease,
          y: round.y + (corner.y - round.y) * ease,
          tilt: 0,
          rx: round.rx + (corner.rx - round.rx) * ease,
          ry: round.ry + (corner.ry - round.ry) * ease
        };
      });
    }
    /* How far out a figure pushes a passing rock (in its own radii): a
       wide berth where there's room, a close shave on a phone. */
    const berth = stacked ? 1.3 : 2;

    /* Their layer rides with the page (main-page.css): shift it back to the
       screen's corner, so a scroll the browser makes before this runs again
       carries the rocks along with the faces instead of leaving them behind.
       (Written only now, after every measurement above: a style written
       before them made the browser work the page's styles out again for
       each one, several times a frame.) */
    /* Touch screens, once the rocks are more on their way round the
       screen than round the faces: their layer is pinned to the screen
       instead. There the browser scrolls the page itself, a step ahead of
       this — and a layer riding with the page was carried along by each
       step, then pulled back here: every frame of the trip down, the rocks
       jumped and snapped back. Pinned, they move only as they're placed. */
    const pinned = store.isTouch && fe >= 0.5;
    if (this.actionsEl && pinned !== this.layerPinned) {
      this.layerPinned = pinned;
      this.actionsEl.classList.toggle('is-pinned', pinned);
      this.layerX = this.layerY = null;
      if (pinned) this.actionsEl.style.transform = '';
    }
    if (this.actionsEl && !pinned && (box.left !== this.layerX || box.top !== this.layerY)) {
      this.layerX = box.left;
      this.layerY = box.top;
      this.actionsEl.style.transform = `translate3d(${(-box.left).toFixed(2)}px, ${(-box.top).toFixed(2)}px, 0)`;
    }

    /* The group's place round the loop, in loops. Every rock keeps its own
       place relative to it — their starting spread (ORBITS, uneven on
       purpose), give or take a little wobble of its own — so however long
       the page is open they never drift together or into a line. (Each used
       to pace itself; differences in their paths and rhythms added up.)
       Closing in on the journey, the loop runs faster, like anything
       caught spiralling in. */
    const lead = blend(homes ? homes[0] : shared);
    const leadContact = (o * 0.34) / Math.max(1, Math.min(lead.rx, lead.ry));
    const pull = Math.min(Math.pow(leadContact + (1 - leadContact) * (1 - e), -1.5), 9);
    const rate = (SPEED / TAU) * pull * dt;
    this.clock = (this.clock + rate) % 1;

    for (const act of this.actions) {
      const { r, size, phase } = act.orbit;
      const { cx, cy, ct, st, rx, ry } = blend(homes ? homes[act.i % 2] : shared);
      /* Stopped under the pointer, slowed for the hint: what it falls
         behind, it makes up afterwards, a little faster than the rest. */
      const pace = act.hovered ? 0 : act === this.hint?.act && this.hint.shown ? HINT_PACE : 1;
      act.pace += (pace - act.pace) * Math.min(1, dt * 6);
      act.lag += rate * (1 - act.pace);
      act.lag -= Math.round(act.lag);   // the short way round
      if (act.pace > 0.98) act.lag -= clamp(act.lag, -rate * SPREAD.catchUp, rate * SPREAD.catchUp);

      /* Distance from the centre, as a fraction of the orbit: shrinks to
         touching as they meet, breathing a little all the while. */
      const contact = (o * 0.34 * size) / Math.max(1, Math.min(rx, ry) * r);
      const shrink = contact + (1 - contact) * (1 - e);
      const breathe = 1 + 0.07 * Math.sin(t * 0.9 + phase) * (1 - e);
      const rr = r * shrink * breathe;

      /* The rock's drawn radius at its largest on this orbit (the near side
         of the ring is drawn 10% bigger). */
      const rockR = o * 0.42 * size * 1.1;
      /* Its little drift, off the line. */
      const wx = Math.sin(t * 2.3 + phase * 1.7) * 6 * (1 - e);
      const wy = Math.cos(t * 1.9 + phase * 1.1) * 6 * (1 - e);

      /* Where the orbit is at `angle`, on the screen. */
      const place = (angle) => {
        const ex = Math.cos(angle) * rx * rr;
        const ey = Math.sin(angle) * ry * rr;
        let x = cx + ex * ct - ey * st + wx;
        let y = cy + ex * st + ey * ct + wy;
        if (fe < 1) {
          /* At home, stay inside the sketches' box and below the header —
             easing away from the edges rather than sliding along them. */
          const band = o * 0.9;
          const top = Math.max(box.top + o * 0.6, ceil + rockR * 1.15, roof + 8 + rockR);
          const left = Math.max(box.left + o * 0.6, wall + 16 + rockR);
          const bx = soften(x, left, box.right - o * 0.6, band);
          const by = soften(y, top, box.bottom - o * 0.6, band);
          x = bx + (x - bx) * fe;
          y = by + (y - by) * fe;
        }
        if (!(avoid > 0)) return { x, y };

        /* Never across either figure or their names. Each pushes the path
           outwards inside a band around it, smoothly — so a rock arcs round
           a sketch the way something in orbit rounds a planet. The header
           (and the heading, where it sits on top) is a ceiling, the bottom
           of the screen a floor and the welcome copy beside them a wall.
           Where a figure is nearer one of those than its berth, the berth
           narrows towards it — most straight at it, less and less to the
           sides — so the rock arcs over the head (or under the feet), a
           closer shave, rather than being flattened against the edge and
           sliding along it. */
        const lo = Math.max(ceil + rockR, roof + 8 + rockR);
        const hi = vh - rockR;
        const wl = Math.max(wall + 16 + rockR, rockR);
        const wr = vw - rockR;
        for (let pass = 0; pass < 4; pass++) {
          for (const fc of faces) {
            const sx = fc.rx + rockR;
            const sy = fc.ry + rockR;
            const dx = x - fc.x;
            const dy = y - fc.y;
            const d = Math.hypot(dx / sx, dy / sy);
            if (d >= berth) continue;
            /* The room straight out from the figure to each edge, in its
               radii, and the berth this way round. */
            const ux = dx / sx / Math.max(d, 1e-4);
            const uy = dy / sy / Math.max(d, 1e-4);
            const narrow = (room, u) => berth - Math.max(0, berth - room) * u;
            let b = berth;
            if (uy < 0) b = Math.min(b, narrow((fc.y - lo) / sy, -uy));
            if (uy > 0) b = Math.min(b, narrow((hi - fc.y) / sy, uy));
            if (ux < 0) b = Math.min(b, narrow((fc.x - wl) / sx, -ux));
            if (ux > 0) b = Math.min(b, narrow((wr - fc.x) / sx, ux));
            b = Math.max(b, 1.02);
            if (d >= b) continue;
            /* Eased out to the edge of the berth: d -> 1 + c d^2, which
               is 1 at the figure and meets the berth at its edge. */
            const c = (b - 1) / (b * b);
            const push = ((1 + c * d * d) / Math.max(d, 0.05) - 1) * avoid;
            x += dx * push;
            y += dy * push;
          }
          if (y < lo) y += (lo - y) * avoid;
          if (y > hi) y += (hi - y) * avoid;
          if (x < wl) x += (wl - x) * avoid;
          x = Math.min(Math.max(x, rockR), vw - rockR);
        }
        return { x, y };
      };

      /* Clockwise, always (the loop runs that way on a y-down screen), at
         its place in the group — give or take its own wobble — and at an
         even pace on screen, all the way round. */
      if (!this.gone) {
        const wobble = SPREAD.wobble * Math.sin(t * 0.37 + phase);
        const share = this.clock + act.orbit.start / TAU + wobble - act.lag;
        const target = this.angleAt(place, share - Math.floor(share));
        /* Never a jump. When the loop changes shape enough that this rock's
           place on it lands somewhere else — the top corner closing up as a
           phone scrolls the sketches under the header — the rock travels
           there along the loop, a little faster than it orbits, instead of
           appearing there. (Its ordinary orbiting is well inside this.) */
        if (!act.placed) {
          act.angle = target;
          act.placed = true;
        } else {
          let d = target - act.angle;
          d -= TAU * Math.round(d / TAU);
          const most = rate * TAU * 3 + 0.03 * dt * 60;
          act.angle += clamp(d, -most, most);
        }
      }

      let { x, y } = place(act.angle);
      /* Never a jump on screen either. While the loop is still near the
         sketches it can fold as it slides over a face — the hand-over to the
         travelling loop on a phone, the sketches scrolling under the header
         — and a point on it flip to the face's other side. So each rock eases
         to where it's put, carried along meanwhile by the frame its loop
         moves in: the page at home, the screen once travelling, in between
         as far as the hand-over has got. That way the easing smooths a flip
         but never leaves the rock behind a scroll. Travelling, it goes
         exactly where it's put. */
      const ox = box.left * (1 - fe);
      const oy = box.top * (1 - fe);
      if (act.sx === undefined || fe >= 1) {
        act.sx = x;
        act.sy = y;
      } else {
        act.sx += ox - act.ox;
        act.sy += oy - act.oy;
        const k0 = 1 - Math.pow(0.7, dt * 60);
        const k = k0 + (1 - k0) * fe * fe * fe;
        act.sx += (x - act.sx) * k;
        act.sy += (y - act.sy) * k;
        x = act.sx;
        y = act.sy;
      }
      act.ox = ox;
      act.oy = oy;

      /* Tilted ring: the near side (lower) a touch larger than the far side;
         closing in, they also come up towards the viewer. */
      const depth = Math.sin(act.angle) * (1 - e);
      const s = size * (1 + 0.1 * depth) * (1 + 0.4 * e);
      act.x = x;
      act.y = y;
      act.btn.style.zIndex = String(Math.round(10 + depth * 5));
      act.btn.style.transform = `translate3d(${(x - o / 2).toFixed(1)}px, ${(y - o / 2).toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
    }

    this.steerHint(dt, { faces: faces.map((fc) => fc.box), wall, roof });
  };

  resize() {
    this.measure();
    this.rocks.resize();
    this.members.forEach((m) => m.neon?.resize());
  }

  destroy() {
    gsap.ticker.remove(this.loop);
    this.handlers.forEach((off) => off());
    this.actions.forEach((a) => a.back?.kill());
    this.hintGone?.kill();
    this.hint?.el.remove();
    this.rocks.destroy();
    this.members.forEach((m) => {
      m.humCall?.kill();
      m.scowlTl?.kill();
      gsap.killTweensOf([m.root, m.body, m.svg, m.gasp, ...m.warps]);
      m.neon?.destroy();
    });
  }
}
