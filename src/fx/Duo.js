import gsap from 'gsap';
import { team } from '../content/site.js';
import Blood from './Blood.js';
import SpaceRocks from './SpaceRocks.js';
import { RockThrow, RockImpact } from './Rock.js';
import { eyeMap } from './eyeMap.js';
import { faceMap } from './faceMap.js';
import { hexToRgb, clamp } from './particles.js';

/* Sketch viewBox width — matches the markup in generate-pages.mjs. */
const VIEW_W = 400;
/* The flash of shock on impact: eyes widen by this fraction of their radius. */
const SHOCK = 0.55;
/* How far (radians) the rocks swirl round each other as they close in. */
const SWIRL = 1.1;

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
 * A hit bursts the rock, sprays blood, knocks the sketch back and makes
 * its neon stutter. The face reacts in three beats: a flash of shock
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
        blood: new Blood(root.querySelector('.sketch-blood')),
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

    this.actions = [...el.querySelectorAll('.duo-action')].map((btn, i, all) => ({
      btn, i, hovered: false, pace: 1, angle: (i / all.length) * Math.PI * 2 + 0.4
    }));
    this.rocks = new SpaceRocks(this.actions.map((a) => a.btn));
    this.actionsEl = el.querySelector('.duo-actions');
    this.f = 0;
    this.k = 0;

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
   *   f     0 = orbiting the sketches; 1 = travelling with the viewer, in a
   *         loose ring around the middle of the screen
   *   k     0 → 1: drawn together into the centre until their surfaces meet
   *   gone  broken apart — the fragments have taken over
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
      this.assignSlots();
    }
    this.f = f;
    this.k = k;
    this.rocks.frenzy = k * k;
    if (this.actionsEl) {
      this.actionsEl.style.pointerEvents = f > 0 ? 'none' : '';
      this.actionsEl.style.visibility = gone ? 'hidden' : '';
    }
  }

  /**
   * Give each rock the place in the travelling ring closest to where it is
   * now, so none of them cross paths on the way.
   */
  assignSlots() {
    const mx = window.innerWidth / 2;
    const my = window.innerHeight / 2;
    const slots = [-3, -1, 1, 3].map((n) => (n * Math.PI) / 4);
    const angles = this.actions.map((a) => {
      const c = this.rockCentre(a);
      return Math.atan2(c.y - my, c.x - mx);
    });
    const order = this.actions.map((_, i) => i).sort((p, q) => angles[p] - angles[q]);
    const gap = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    let best = 0;
    let bestCost = Infinity;
    for (let shift = 0; shift < slots.length; shift++) {
      const cost = order.reduce((sum, ai, j) => sum + gap(angles[ai], slots[(j + shift) % slots.length]), 0);
      if (cost < bestCost) { bestCost = cost; best = shift; }
    }
    order.forEach((ai, j) => { this.actions[ai].slot = slots[(j + best) % slots.length]; });
  }

  /** Where the rocks meet (viewport px), and each one's direction from there at contact. */
  meeting() {
    return {
      at: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      dirs: this.actions.map((a) => {
        const ang = (a.slot ?? 0) + SWIRL;
        return { x: Math.cos(ang), y: Math.sin(ang) };
      })
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

    /* Blood starts where the rock struck, in the blood canvas's space. */
    const c = m.blood.canvas;
    const lx = m.hit[0] * m.body.offsetWidth - c.offsetLeft;
    const ly = m.hit[1] * m.body.offsetHeight - c.offsetTop;
    m.blood.splash(lx, ly, dir, scale);

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

  /* -------------------------------------------------------------- loop */

  measure() {
    this.W = this.el.offsetWidth;
    this.H = this.el.offsetHeight;
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

    /* Orbit: the rocks wander an ellipse wrapped around both sketches,
       each with its own wobble; hovering one slows it so it can be clicked. */
    const [a, b] = this.members;
    if (!a.size) return;
    const cx = (a.cx + b.cx) / 2;
    const cy = (a.cy + b.cy) / 2;
    const ang = Math.atan2(b.cy - a.cy, b.cx - a.cx);
    const half = Math.hypot(b.cx - a.cx, b.cy - a.cy) / 2;
    const ra = half + a.size * 0.72;
    const rb = a.size * 0.82;
    const ca = Math.cos(ang);
    const sa = Math.sin(ang);
    const o = this.orb;
    /* The orbit lives in the sketches' box; the rocks' layer is the viewport. */
    const box = this.el.getBoundingClientRect();

    /* Journey: a loose ring round the middle of the screen, then the
       collision — a slow drift inwards that becomes a rush, swirling as
       they close, until their surfaces meet. */
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const mx = vw / 2;
    const my = vh / 2;
    const rx = Math.min(vw * 0.3, 460);
    const ry = Math.min(vh * 0.3, 250);
    const e = this.k * this.k * this.k;
    const cs = Math.cos(e * SWIRL);
    const sn = Math.sin(e * SWIRL);

    for (const act of this.actions) {
      act.pace += ((act.hovered ? 0 : 1) - act.pace) * Math.min(1, dt * 6);
      act.angle += dt * 0.17 * act.pace;
      const i = act.i;
      const wr = 1 + 0.07 * Math.sin(t * 1.3 + i * 2.1);
      const ex = Math.cos(act.angle) * ra * wr;
      const ey = Math.sin(act.angle) * rb * wr;
      let lx = cx + ex * ca - ey * sa + Math.sin(t * 2.3 + i * 1.7) * 7;
      let ly = cy + ex * sa + ey * ca + Math.cos(t * 1.9 + i * 1.1) * 7;
      lx = clamp(lx, o * 0.6, this.W - o * 0.6);
      ly = clamp(ly, o * 0.6, this.H - o * 0.6);
      let x = box.left + lx;
      let y = box.top + ly;
      let s = 1;

      if (this.f > 0) {
        const slot = act.slot ?? 0;
        let px = mx + Math.cos(slot) * rx + Math.sin(t * 0.9 + i * 1.7) * 6;
        let py = my + Math.sin(slot) * ry + Math.cos(t * 0.8 + i * 1.3) * 6;
        if (e > 0) {
          s = 1 + 0.4 * e;
          const dx = px - mx;
          const dy = py - my;
          const len = Math.hypot(dx, dy) || 1;
          const contact = o * 0.36 * s;
          const r = contact + (len - contact) * (1 - e);
          px = mx + (dx / len) * r * cs - (dy / len) * r * sn;
          py = my + (dx / len) * r * sn + (dy / len) * r * cs;
        }
        x += (px - x) * this.f;
        y += (py - y) * this.f;
      }

      act.btn.style.transform = `translate3d(${(x - o / 2).toFixed(1)}px, ${(y - o / 2).toFixed(1)}px, 0) scale(${s.toFixed(3)})`;
    }
  };

  resize() {
    this.measure();
    this.members.forEach((m) => m.blood.resize());
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
      m.blood.destroy();
    });
  }
}
