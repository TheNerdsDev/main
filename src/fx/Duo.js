import gsap from 'gsap';
import { team } from '../content/site.js';
import SpaceRocks from './SpaceRocks.js';
import { RockThrow, RockImpact } from './Rock.js';
import { Zap } from './Zap.js';
import { eyeMap } from './eyeMap.js';
import { faceMap } from './faceMap.js';
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
 * arcs crackle and spark, the tube stutters, and it sees stars. The face reacts in three beats: a flash of shock
 * (eyes wide), a wince of pain, then anger — or sadness, if they started
 * it and this is the payback — before it relaxes.
 */
export default class Duo {
  constructor(el, fx, stage) {
    this.el = el;
    this.fx = fx;
    this.stage = stage;

    this.members = team.map((m) => {
      const root = el.querySelector(`[data-sketch="${m.id}"]`);
      const h = VIEW_W / m.aspect;
      setHref(root.querySelector('.eye-map'), eyeMap(VIEW_W, h, m.eyes, m.eyeR));

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

      return {
        ...m,
        root,
        body: root.querySelector('.sketch-body'),
        svg: root.querySelector('.sketch-svg'),
        hitBtn: root.querySelector('.sketch-hit'),
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
      return { btn, i, orbit, hovered: false, pace: 1, angle: orbit.start, x: 0, y: 0 };
    });
    this.rocks = new SpaceRocks(this.actions.map((a) => a.btn));
    this.actionsEl = el.querySelector('.duo-actions');
    this.f = 0;
    this.k = 0;
    this.gone = false;

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

    this.members.forEach((m) => on(m.hitBtn, 'click', () => this.throw(m)));

    this.actions.forEach((a) => {
      on(a.btn, 'pointerenter', () => { a.hovered = true; });
      on(a.btn, 'pointerleave', () => { a.hovered = false; });
      on(a.btn, 'focus', () => { a.hovered = true; });
      on(a.btn, 'blur', () => { a.hovered = false; });
      on(a.btn, 'click', () => this.fling(a));
    });
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
      at: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
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
    const [eye, hurt, after] = m.warps;
    const faces = m.faces;
    gsap.killTweensOf([eye, hurt, after]);

    gsap.timeline()
      .to(eye, { v: m.rad * SHOCK, duration: 0.1, ease: 'power3.out' })
      .to(eye, { v: 0, duration: 0.35, ease: 'power2.inOut', delay: 0.12 });

    if (!faces.hurt) return;
    const next = faces[mood] || faces.angry;
    setHref(m.mapB, next.url);

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

  /* -------------------------------------------------------------- loop */

  measure() {
    this.W = this.el.offsetWidth;
    this.H = this.el.offsetHeight;
    const page = this.el.closest('.page') || document;
    this.texts = [...page.querySelectorAll(TEXT)];
    const nav = page.querySelector('.site-header');
    this.ceiling = nav ? nav.getBoundingClientRect().bottom + 10 : 0;
    this.members.forEach((m) => {
      m.cx = m.root.offsetLeft + m.root.offsetWidth / 2;
      m.cy = m.root.offsetTop + m.root.offsetHeight / 2;
      m.size = m.root.offsetWidth;
    });
    this.orb = this.actions[0]?.btn.offsetWidth || 56;
  }

  loop = () => {
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 1 / 30);
    this.last = now;
    const t = now / 1000;

    /* Push the eye / expression strengths into the filters only when they change. */
    for (const m of this.members) {
      for (const w of m.warps) {
        if (!w.node) continue;
        const v = Math.round(w.v * 10) / 10;
        if (v !== w.shown) {
          w.shown = v;
          w.node.setAttribute('scale', v);
        }
      }
    }

    const [a, b] = this.members;
    if (!a.size) return;
    const o = this.orb;
    const f = this.f;
    /* Ease the hand-over so the orbit bends rather than slides. */
    const fe = f * f * (3 - 2 * f);

    /* Home orbit: a tilted ellipse wrapped around both sketches. It lives in
       the sketches' box; the rocks' layer is the viewport. */
    const box = this.el.getBoundingClientRect();
    const hx = box.left + (a.cx + b.cx) / 2;
    const hy = box.top + (a.cy + b.cy) / 2;
    const hTilt = Math.atan2(b.cy - a.cy, b.cx - a.cx);
    const hRx = Math.hypot(b.cx - a.cx, b.cy - a.cy) / 2 + a.size * 0.56;
    const hRy = a.size * 0.74;

    /* Travelling orbit: the same loop, round the middle of the screen. */
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tRx = Math.min(vw * 0.3, 460);
    const tRy = Math.min(vh * 0.3, 250);

    const cx = hx + (vw / 2 - hx) * fe;
    const cy = hy + (vh / 2 - hy) * fe;
    const tilt = hTilt + (-0.14 - hTilt) * fe;
    const ct = Math.cos(tilt);
    const st = Math.sin(tilt);
    const rx = hRx + (tRx - hRx) * fe;
    const ry = hRy + (tRy - hRy) * fe;

    /* Meeting: the orbits tighten slowly, then all at once. */
    const e = Math.pow(this.k, 2.2);

    /* Both heads, so the rocks can swing round them instead of across. */
    const avoid = 1 - fe;
    const faces = avoid > 0
      ? this.members.map((m) => {
        const r = m.body.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height * FIGURE.y, rx: r.width * FIGURE.rx, ry: r.height * FIGURE.ry };
      })
      : [];
    /* The welcome copy's right edge — a wall the orbit keeps to the right of. */
    const wall = avoid > 0 ? this.texts.reduce((m, el) => Math.max(m, el.getBoundingClientRect().right), -Infinity) : -Infinity;

    for (const act of this.actions) {
      const { r, size, phase } = act.orbit;
      act.pace += ((act.hovered ? 0 : 1) - act.pace) * Math.min(1, dt * 6);

      /* Distance from the centre, as a fraction of the orbit: shrinks to
         touching as they meet, breathing a little all the while. */
      const contact = (o * 0.34 * size) / Math.max(1, Math.min(rx, ry) * r);
      const shrink = contact + (1 - contact) * (1 - e);
      const breathe = 1 + 0.07 * Math.sin(t * 0.9 + phase) * (1 - e);
      const rr = r * shrink * breathe;

      /* Clockwise, always (the angle rises on a y-down screen). Each one
         surges and lags on its own rhythm, and a tighter orbit runs faster —
         like anything caught spiralling in. */
      if (!this.gone) {
        const surge = 1 + 0.3 * Math.sin(t * 0.37 + phase);
        const pull = Math.min(Math.pow(shrink, -1.5), 9);
        act.angle += dt * SPEED * act.pace * surge * pull;
      }

      const ex = Math.cos(act.angle) * rx * rr;
      const ey = Math.sin(act.angle) * ry * rr;
      let x = cx + ex * ct - ey * st + Math.sin(t * 2.3 + phase * 1.7) * 6 * (1 - e);
      let y = cy + ex * st + ey * ct + Math.cos(t * 1.9 + phase * 1.1) * 6 * (1 - e);
      /* The rock's drawn radius at its largest on this orbit (the near side
         of the ring is drawn 10% bigger). */
      const rockR = o * 0.42 * size * 1.1;
      if (fe < 1) {
        /* At home, stay inside the sketches' box and below the header —
           easing away from the edges rather than sliding along them. */
        const band = o * 0.9;
        const top = Math.max(box.top + o * 0.6, this.ceiling + rockR * 1.15);
        const left = Math.max(box.left + o * 0.6, wall + 16 + rockR);
        const bx = soften(x, left, box.right - o * 0.6, band);
        const by = soften(y, top, box.bottom - o * 0.6, band);
        x = bx + (x - bx) * fe;
        y = by + (y - by) * fe;
      }

      if (avoid > 0) {
        /* Never across either figure or their names. Each pushes the path
           outwards inside a band around it, smoothly — so a rock arcs round
           a sketch the way something in orbit rounds a planet. The header
           is a ceiling; where the two disagree a few passes settle it, so
           a rock slides round instead of being shoved from one into the
           other. */
        for (let pass = 0; pass < 4; pass++) {
          for (const fc of faces) {
            const dx = x - fc.x;
            const dy = y - fc.y;
            const d = Math.hypot(dx / (fc.rx + rockR), dy / (fc.ry + rockR));
            if (d < 2) {
              const push = ((1 + (d * d) / 4) / Math.max(d, 0.05) - 1) * avoid;
              x += dx * push;
              y += dy * push;
            }
          }
          const lo = this.ceiling + rockR;
          if (y < lo) y += (lo - y) * avoid;
          x = Math.min(Math.max(x, rockR), vw - rockR);
        }
      }

      /* Tilted ring: the near side (lower) a touch larger than the far side;
         closing in, they also come up towards the viewer. */
      const depth = Math.sin(act.angle) * (1 - e);
      const s = size * (1 + 0.1 * depth) * (1 + 0.4 * e);
      act.x = x;
      act.y = y;
      act.btn.style.zIndex = String(Math.round(10 + depth * 5));
      act.btn.style.transform = `translate3d(${(x - o / 2).toFixed(1)}px, ${(y - o / 2).toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
    }
  };

  resize() {
    this.measure();
    this.rocks.resize();
  }

  destroy() {
    gsap.ticker.remove(this.loop);
    this.handlers.forEach((off) => off());
    this.actions.forEach((a) => a.back?.kill());
    this.rocks.destroy();
    this.members.forEach((m) => {
      m.humCall?.kill();
      gsap.killTweensOf([m.root, m.body, m.svg, m.gasp, ...m.warps]);
    });
  }
}
