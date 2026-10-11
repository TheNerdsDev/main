import { LOGO, SMOKE } from '../content/logo.js';
import { along, DOCK, TRAIL_LAG, PUFF } from './LogoRocket.js';

/*
 * The logo on the loading screen, animated entirely on the compositor.
 *
 * While it shows, the page underneath is being built — decoding photos,
 * compiling shaders — and the main thread is blocked for 100–200 ms at a
 * time. Anything animated from script freezes through that. So here every
 * moving part is its own layer, moved only by transform and opacity through
 * the Web Animations API, which the browser runs off the main thread:
 *
 *   letters   one layer each: they rise in one after another, and hop like
 *             dominoes when the rocket lands
 *   rocket    its whole flight sampled into keyframes up front (position,
 *             heading); white with a difference blend, like the header's
 *   trail     drawn in behind it by a window sliding right while its
 *             contents slide back left (a wipe made of two transforms)
 *   clouds    every puff of tricolour smoke scheduled in advance, timed to
 *             when the rocket's tail passes that spot
 *
 * The flight runs on its own clock rather than the load percentage (which
 * arrives in jumps): it cruises most of the way, and the last stretch —
 * the approach and docking — plays once loading is done.
 */

const W = LOGO.width;
const H = LOGO.height;
const NS = 'http://www.w3.org/2000/svg';

/* Most of the way on its own clock, the rest once loading is done. */
const CRUISE = 0.82;
const CRUISE_MS = 1450;
const CRUISE_DELAY = 320;
const LAND_MS = 620;
/* The cruise ends still moving gently; the landing picks up at that speed. */
const END_SPEED = 0.35;

const pct = (v, of) => `${((v / of) * 100).toFixed(3)}%`;

/** Cruise: from rest at the start to CRUISE, arriving still moving. */
function cruise(t) {
  const h = -2 * t * t * t + 3 * t * t;
  return CRUISE * h + (t * t * t - t * t) * CRUISE * END_SPEED;
}
/** Landing: from CRUISE to the dock, starting at the cruise's speed, ending at rest. */
const LAND_START = (CRUISE * END_SPEED * (LAND_MS / CRUISE_MS)) / (1 - CRUISE);
function land(t) {
  const h = -2 * t * t * t + 3 * t * t + (t * t * t - 2 * t * t + t) * LAND_START;
  return CRUISE + (1 - CRUISE) * h;
}

function svg(className, inner) {
  const el = document.createElementNS(NS, 'svg');
  el.setAttribute('viewBox', `0 0 ${W} ${H}`);
  el.setAttribute('class', className);
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = inner;
  return el;
}

export default class LoaderLogo {
  constructor(host, { still = false } = {}) {
    this.host = host;
    this.still = still;
    this.anims = [];
    host.style.aspectRatio = `${W} / ${H}`;

    /* The trail, inside its wipe. */
    this.wipe = document.createElement('div');
    this.wipe.className = 'll-wipe';
    this.wipeInner = document.createElement('div');
    this.wipeInner.className = 'll-wipe-inner';
    this.wipeInner.appendChild(svg('ll-layer', `<path d="${LOGO.trail}"/>`));
    this.wipe.appendChild(this.wipeInner);

    this.smoke = document.createElement('div');
    this.smoke.className = 'll-smoke';

    /* One layer per letter; the R carries the plug that fills its
       rocket-shaped counter while the rocket is away, and the porthole. */
    this.letters = LOGO.letters.map((l, i) => svg('ll-layer ll-letter', i === 5
      ? `<path d="${l.d}" fill-rule="evenodd"/><path class="ll-plug" d="${LOGO.plug}" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="${LOGO.porthole}"/>`
      : `<path d="${l.d}" fill-rule="evenodd"/>`));
    this.plug = this.letters[5].querySelector('.ll-plug');

    this.rocket = svg('ll-layer ll-rocket', `<path d="${LOGO.rocket}" fill-rule="evenodd"/>`);
    this.rocket.style.transformOrigin = `${pct(DOCK.x, W)} ${pct(DOCK.y, H)}`;

    host.append(this.wipe, this.smoke, ...this.letters, this.rocket);
    if (still) this.docked();
  }

  play(el, keyframes, options) {
    const a = el.animate(keyframes, { fill: 'both', ...options });
    this.anims.push(a);
    return a;
  }

  /** The rocket and the trail's wipe at progress p of the flight. */
  frame(p, opacity = 1) {
    const { x, y, angle } = along(p);
    const clip = Math.max(0, x - TRAIL_LAG);
    const shift = (clip / W - 1) * 100;
    return {
      rocket: {
        transform: `translate(${pct(x - DOCK.x, W)}, ${pct(y - DOCK.y, H)}) rotate(${(angle - DOCK.angle).toFixed(2)}deg)`,
        opacity
      },
      wipe: { transform: `translateX(${shift.toFixed(3)}%)` },
      inner: { transform: `translateX(${(-shift).toFixed(3)}%)` }
    };
  }

  /** Lay a flight segment as keyframes, plus the smoke along it. */
  fly(ease, duration, delay, fadeIn) {
    const N = Math.max(24, Math.round(duration / 30));
    const rocket = [];
    const wipe = [];
    const inner = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const f = this.frame(ease(t), fadeIn ? Math.min(1, t / 0.12) : 1);
      rocket.push(f.rocket);
      wipe.push(f.wipe);
      inner.push(f.inner);
    }
    const opts = { duration, delay, easing: 'linear' };
    const done = this.play(this.rocket, rocket, opts);
    this.play(this.wipe, wipe, opts);
    this.play(this.wipeInner, inner, opts);
    this.exhaust(ease, duration, delay, fadeIn);
    return done.finished;
  }

  /**
   * Schedule the smoke for a segment: walk its timeline finely, and each time
   * the rocket's tail has gone far enough, a puff of each colour — saffron on
   * the upper side of the line of flight, white in the middle, green below.
   */
  exhaust(ease, duration, delay, fadeIn) {
    const every = window.innerWidth < 768 ? PUFF.every * 1.8 : PUFF.every * 1.4;
    const steps = Math.round(duration / 4);
    let last = null;
    const frag = document.createDocumentFragment();
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      if (fadeIn && t < 0.06) continue;
      const { x, y, angle } = along(ease(t));
      const a = (angle * Math.PI) / 180;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const tx = x - ux * DOCK.tail * 0.8;
      const ty = y - uy * DOCK.tail * 0.8;
      if (last && Math.hypot(tx - last.x, ty - last.y) < every) continue;
      last = { x: tx, y: ty };
      const at = delay + t * duration;
      for (let k = 0; k < 3; k++) frag.appendChild(this.puff(tx, ty, ux, uy, 1 - k, SMOKE[k], at));
    }
    this.smoke.appendChild(frag);
  }

  puff(x, y, ux, uy, side, colour, at) {
    const el = document.createElement('i');
    el.className = 'll-puff';
    const jitter = () => (Math.random() - 0.5) * 0.8;
    const r1 = PUFF.r1 * (0.85 + Math.random() * 0.3);
    const life = PUFF.life * 1000 * (0.85 + Math.random() * 0.3);
    const nx = uy;
    const ny = -ux;
    const px = x + nx * side * PUFF.spread + jitter();
    const py = y + ny * side * PUFF.spread + jitter();
    /* Centred on its spot by negative margins (a margin's % is of the
       container's width either way, and a puff is as tall as it is wide), so
       its keyframes are plain translate + scale for the compositor. */
    el.style.cssText = `left:${pct(px, W)};top:${pct(py, H)};width:${pct(r1 * 2, W)};margin:-${pct(r1, W)} 0 0 -${pct(r1, W)};`
      + `background:radial-gradient(circle closest-side, ${colour}f2 0%, ${colour}8c 55%, ${colour}00 100%)`;
    /* Drift back along the path and a little apart, in % of the puff's own size. */
    const dx = ((-ux * 7 + nx * side * 2.5) * (life / 1000)) / (r1 * 2) * 100;
    const dy = ((-uy * 7 + ny * side * 2.5) * (life / 1000)) / (r1 * 2) * 100;
    const s0 = PUFF.r0 / r1;
    const at40 = { s: s0 + (1 - s0) * 0.64, o: 0.9 * Math.pow(0.6, 1.4) };
    this.play(el, [
      { transform: `translate(0, 0) scale(${s0.toFixed(3)})`, opacity: 0.9 },
      { transform: `translate(${(dx * 0.4).toFixed(2)}%, ${(dy * 0.4).toFixed(2)}%) scale(${at40.s.toFixed(3)})`, opacity: at40.o, offset: 0.4 },
      { transform: `translate(${dx.toFixed(2)}%, ${dy.toFixed(2)}%) scale(1)`, opacity: 0 }
    ], { duration: life, delay: at, easing: 'linear', fill: 'forwards' });
    return el;
  }

  /** The letters rise in one after another; the rocket sets off along the trail. */
  intro() {
    if (this.still) return;
    this.letters.forEach((el, i) => this.play(el,
      [{ transform: 'translateY(14%)', opacity: 0 }, { transform: 'none', opacity: 1 }],
      { duration: 700, delay: i * 60, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' }));
    this.cruising = this.fly(cruise, CRUISE_MS, CRUISE_DELAY, true);
  }

  /** Loading's done: finish the cruise if it's still going, then come in and dock. */
  async land() {
    if (this.still) return;
    await this.cruising;
    await this.fly(land, LAND_MS, 0, false);
    this.docked();
  }

  /** In the R: the hole is the rocket again. */
  docked() {
    this.plug.style.visibility = 'hidden';
    this.rocket.style.visibility = 'hidden';
  }

  /** The letters hop one after another, first to last, like dominoes. */
  celebrate() {
    if (this.still) return;
    this.letters.forEach((el, i) => {
      const h = ((i < 3 ? 6 : 13) / H) * 100;
      /* Up (slowing), down (speeding up), a small bounce, settle. Each
         keyframe's easing shapes the stretch that starts at it. */
      const up = 'cubic-bezier(0.33, 1, 0.68, 1)';
      const down = 'cubic-bezier(0.32, 0, 0.67, 0)';
      this.play(el, [
        { transform: 'none', easing: up },
        { transform: `translateY(-${h.toFixed(2)}%)`, offset: 0.26, easing: down },
        { transform: 'none', offset: 0.62, easing: up },
        { transform: `translateY(-${(h * 0.22).toFixed(2)}%)`, offset: 0.8, easing: down },
        { transform: 'none' }
      ], { duration: 680, delay: i * 60, easing: 'linear', fill: 'none' });
    });
  }

  destroy() {
    this.anims.forEach((a) => a.cancel());
    this.anims = [];
  }
}
