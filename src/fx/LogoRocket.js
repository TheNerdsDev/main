import gsap from 'gsap';
import { LOGO, SMOKE } from '../content/logo.js';

/*
 * The logo's rocket, and its letters.
 *
 * Docked, the rocket is the R's counter — a rocket-shaped hole in the
 * letter. To fly, a plug fills that hole (so the R is whole while it's
 * away) and a white rocket takes off from it; drawn with a difference
 * blend, it's white against the sky and dark wherever it crosses a letter,
 * exactly like the cut-out it came from. Back in the dock, both go and the
 * hole is the rocket again.
 *
 *   play()          hover: the letters jump one after another, first to
 *                   last; the rocket blasts off, comes round from the left
 *                   along its trail (drawing it as it goes) and settles in
 *                   the R
 *   setFlight(p)    the loader: the rocket rides the trail as loading runs,
 *                   0 → 1, docking at 1
 *
 * Wherever it flies it leaves clouds in the tricolour behind it — saffron,
 * white and green side by side, like an aerobatic team's smoke — puffed out
 * by distance travelled, so a slow loader and a fast lap both get a steady
 * stream.
 */

export const DOCK = LOGO.dock;

/* The flight path, measured once so progress along it is even. */
const PATH = LOGO.flight;
const LENS = [0];
for (let i = 1; i < PATH.length; i++) {
  LENS.push(LENS[i - 1] + Math.hypot(PATH[i][0] - PATH[i - 1][0], PATH[i][1] - PATH[i - 1][1]));
}
const TOTAL = LENS[LENS.length - 1];

function pointAt(s) {
  s = Math.min(Math.max(s, 0), TOTAL);
  let i = 1;
  while (i < LENS.length - 1 && LENS[i] < s) i++;
  const k = (s - LENS[i - 1]) / (LENS[i] - LENS[i - 1] || 1);
  return [PATH[i - 1][0] + (PATH[i][0] - PATH[i - 1][0]) * k, PATH[i - 1][1] + (PATH[i][1] - PATH[i - 1][1]) * k];
}

/** Position and heading (degrees) at progress t along the flight. */
export function along(t) {
  const s = Math.min(Math.max(t, 0), 1) * TOTAL;
  const [x, y] = pointAt(s);
  /* Heading from a short chord, so the nose turns smoothly. */
  const a = pointAt(s - 7);
  const b = pointAt(s + 7);
  return { x, y, angle: (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI };
}

/* The trail is drawn up to just behind the rocket — all of it once docked. */
export const TRAIL_LAG = DOCK.x - LOGO.trailEnd;

/* Exhaust clouds, in logo units (the logo is ~110 tall). */
export const PUFF = {
  every: 3,       // a puff per this much travel
  spread: 3.6,    // between the three streams
  r0: 2.6,        // radius as it leaves the tail…
  r1: 9,          // …and as it fades
  life: 0.9       // seconds
};
const SVG_NS = 'http://www.w3.org/2000/svg';

export default class LogoRocket {
  static reduced() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  constructor(svg) {
    this.svg = svg;
    this.letters = [...svg.querySelectorAll('.logo-letter')];
    this.rocket = svg.querySelector('.logo-rocket');
    this.plug = svg.querySelector('.logo-plug');
    this.trail = svg.querySelector('.logo-trail');
    this.clip = svg.querySelector('.logo-trail-clip');
    this.smoke = svg.querySelector('.logo-smoke');
    this.puffs = [];
    this.pool = [];
    this.state = { x: DOCK.x, y: DOCK.y, angle: DOCK.angle, scale: 1, opacity: 1 };
    this.dock();
  }

  /* ------------------------------------------------------------ smoke */

  /** Lay clouds from the tail back to where the last ones were. */
  exhaust() {
    if (!this.smoke || !this.emitting) return;
    const { x, y, angle, scale, opacity } = this.state;
    if (opacity < 0.4) {
      this.lastPuff = null;
      return;
    }
    const a = (angle * Math.PI) / 180;
    const ux = Math.cos(a);
    const uy = Math.sin(a);
    const tx = x - ux * DOCK.tail * 0.8 * scale;
    const ty = y - uy * DOCK.tail * 0.8 * scale;
    const last = this.lastPuff;
    const gap = last ? Math.hypot(tx - last.x, ty - last.y) : 0;
    /* A fresh stream: first puff, or it's reappeared somewhere else (it
       fades out before it jumps, which already clears lastPuff; this is
       only a safety net — a slow frame can cover a fair distance). */
    if (!last || gap > 120) {
      this.lastPuff = { x: tx, y: ty };
      this.puff(tx, ty, ux, uy);
      return;
    }
    /* (Thinned out on a very slow frame rather than flooding it.) */
    const step = Math.max(PUFF.every, gap / 24);
    const n = Math.floor(gap / step);
    for (let i = 1; i <= n; i++) {
      const k = (i * step) / gap;
      this.puff(last.x + (tx - last.x) * k, last.y + (ty - last.y) * k, ux, uy);
    }
    if (n) {
      const k = (n * step) / gap;
      this.lastPuff = { x: last.x + (tx - last.x) * k, y: last.y + (ty - last.y) * k };
    }
  }

  /** One puff of each colour, side by side across the line of flight:
      saffron on the upper side, white in the middle, green below. */
  puff(x, y, ux, uy) {
    const nx = uy;     // the side "above" the direction of travel (y is down)
    const ny = -ux;
    for (let k = 0; k < 3; k++) {
      const side = 1 - k;
      const el = this.pool.pop() || document.createElementNS(SVG_NS, 'circle');
      el.setAttribute('fill', `url(#${this.smoke.dataset.fill}-${k})`);
      if (!el.parentNode) this.smoke.appendChild(el);
      el.style.display = '';
      const jitter = () => (Math.random() - 0.5) * 0.8;
      this.puffs.push({
        el,
        x: x + nx * side * PUFF.spread + jitter(),
        y: y + ny * side * PUFF.spread + jitter(),
        /* drifting back along the path and gently apart */
        vx: -ux * 7 + nx * side * 2.5 + jitter() * 3,
        vy: -uy * 7 + ny * side * 2.5 + jitter() * 3,
        age: 0,
        life: PUFF.life * (0.85 + Math.random() * 0.3),
        r1: PUFF.r1 * (0.85 + Math.random() * 0.3)
      });
    }
    if (!this.smoking) {
      this.smoking = true;
      gsap.ticker.add(this.billow);
    }
  }

  /** Every frame while there's smoke: clouds swell, drift and fade. */
  billow = (time, deltaMs) => {
    const dt = Math.min(deltaMs / 1000, 1 / 20);
    this.puffs = this.puffs.filter((p) => {
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.el.style.display = 'none';
        this.pool.push(p.el);
        return false;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const grow = 1 - (1 - t) * (1 - t);
      p.el.setAttribute('cx', p.x.toFixed(2));
      p.el.setAttribute('cy', p.y.toFixed(2));
      p.el.setAttribute('r', (PUFF.r0 + (p.r1 - PUFF.r0) * grow).toFixed(2));
      p.el.setAttribute('opacity', (0.9 * Math.pow(1 - t, 1.4)).toFixed(3));
      return true;
    });
    if (!this.puffs.length) {
      this.smoking = false;
      gsap.ticker.remove(this.billow);
    }
  };

  /** Back in the R: the hole is the rocket again. */
  dock() {
    this.away = false;
    this.emitting = false;
    this.lastPuff = null;
    this.rocket.style.visibility = 'hidden';
    this.plug.style.visibility = 'hidden';
    this.clip.setAttribute('width', LOGO.width);
    this.trail.style.opacity = '';
  }

  /** Out of the R: fill the hole, show the travelling rocket. */
  leave() {
    this.emitting = true;
    if (this.away) return;
    this.away = true;
    this.plug.style.visibility = 'visible';
    this.rocket.style.visibility = 'visible';
  }

  /** Draw the rocket where its state says. */
  draw() {
    const { x, y, angle, scale, opacity } = this.state;
    this.rocket.setAttribute('transform',
      `translate(${x.toFixed(2)} ${y.toFixed(2)}) rotate(${(angle - DOCK.angle).toFixed(2)}) scale(${scale.toFixed(3)}) translate(${-DOCK.x} ${-DOCK.y})`);
    this.rocket.style.opacity = opacity < 1 ? opacity.toFixed(3) : '';
    this.exhaust();
  }

  /** On the flight path at progress t; the trail drawn in behind it. */
  ride(t) {
    const p = along(t);
    Object.assign(this.state, p);
    this.clip.setAttribute('width', Math.max(0, p.x - TRAIL_LAG).toFixed(2));
    this.draw();
  }

  /** The loader: 0 at the start of the trail, docked at 1. */
  setFlight(p) {
    if (LogoRocket.reduced()) return;
    if (p >= 1) {
      this.dock();
      return;
    }
    this.leave();
    this.state.scale = 1;
    this.state.opacity = 1;
    this.ride(p);
  }

  /** The letters jump one after another, first to last, like dominoes. */
  domino(tl, at = 0) {
    this.letters.forEach((el, i) => {
      /* "THE" is small: a smaller hop. */
      const h = i < 3 ? 6 : 13;
      tl.to(el, { y: -h, duration: 0.18, ease: 'power2.out' }, at + i * 0.06)
        .to(el, { y: 0, duration: 0.5, ease: 'bounce.out' }, at + i * 0.06 + 0.18);
    });
    return tl;
  }

  /** Hover: blast off, round, and back in along the trail. */
  play() {
    if (this.tl?.isActive() || LogoRocket.reduced()) return;
    const s = this.state;
    const launch = { k: 0 };
    const back = { t: 0 };
    const rad = (DOCK.angle * Math.PI) / 180;
    const FAR = 150;    // how far it shoots off, in logo units (the logo is ~110 tall)

    this.leave();
    Object.assign(s, { x: DOCK.x, y: DOCK.y, angle: DOCK.angle, scale: 1, opacity: 1 });
    this.draw();

    const tl = gsap.timeline({ onComplete: () => this.dock() });
    /* Blast off along its own axis, gone into the sky; the exhaust trail fades. */
    tl.to(launch, {
      k: 1,
      duration: 0.5,
      ease: 'power2.in',
      onUpdate: () => {
        s.x = DOCK.x + Math.cos(rad) * FAR * launch.k;
        s.y = DOCK.y + Math.sin(rad) * FAR * launch.k;
        s.scale = 1 - 0.3 * launch.k;
        s.opacity = launch.k < 0.6 ? 1 : 1 - (launch.k - 0.6) / 0.4;
        this.draw();
      }
    }, 0)
      .to(this.trail, { opacity: 0, duration: 0.3, ease: 'power1.out' }, 0.05);

    /* The letters, one after another. */
    this.domino(tl, 0.1);

    /* Back round from the left, along the trail, drawing it again. */
    tl.add(() => {
      this.clip.setAttribute('width', 0);
      this.trail.style.opacity = '';
    }, 0.55)
      .to(back, {
        t: 1,
        duration: 0.95,
        ease: 'power2.inOut',
        onUpdate: () => {
          s.scale = 0.75 + 0.25 * Math.min(1, back.t * 1.4);
          s.opacity = Math.min(1, back.t * 6);
          this.ride(back.t);
        }
      }, 0.55)
      /* …and settles in with a little give. */
      .to(s, { scale: 1.08, duration: 0.09, ease: 'power1.out', onUpdate: () => this.draw() }, 1.5)
      .to(s, { scale: 1, duration: 0.3, ease: 'back.out(3)', onUpdate: () => this.draw() }, 1.59);
    this.tl = tl;
  }

  destroy() {
    this.tl?.kill();
    gsap.killTweensOf(this.letters);
    gsap.ticker.remove(this.billow);
  }
}
