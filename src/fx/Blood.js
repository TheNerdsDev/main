import gsap from 'gsap';
import { rand } from './particles.js';

const GRAVITY = 1350;
/* Seconds before the blood starts to fade, and how long the fade takes. */
const HOLD = 3.6;
const FADE = 1.6;

/**
 * Blood on one sketch. Everything is drawn as flat red circles; the
 * canvas carries the `#blood-goo` SVG filter, which melts neighbouring
 * circles into one liquid surface and lights it with a specular
 * highlight — that is what makes it read as wet rather than dotted.
 *
 *   drops  — flung droplets, stretched along their velocity
 *   stains — the splat that stays on the face
 *   drips  — runs that crawl down from the splat, swell at the tip and
 *            let go as a falling drop
 */
export default class Blood {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.drops = [];
    this.stains = [];
    this.spines = [];
    this.drips = [];
    this.age = 0;
    this.alpha = 1;
    this.fadeRate = 1 / FADE;
    this.running = false;
    this.resize();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = this.canvas.offsetWidth;
    this.h = this.canvas.offsetHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  /** (x, y) in canvas CSS px; `dir` is the incoming meteor's direction. */
  splash(x, y, dir, scale = 1) {
    this.age = 0;
    this.alpha = 1;
    this.fadeRate = 1 / FADE;

    const fwd = Math.atan2(dir.y, dir.x);
    const back = fwd + Math.PI;

    /* The splat: a ragged cluster, densest at the centre. */
    const n = Math.round(rand(14, 20));
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const d = Math.pow(Math.random(), 1.6) * 18 * scale;
      this.stains.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, r: 0, to: rand(2.6, 7) * scale * (1 - d / (26 * scale)), grow: rand(18, 34) });
    }
    /* Spines: the splat throws out tapering streaks, mostly in the
       direction the meteor was travelling. */
    for (let i = 0; i < 11; i++) {
      const a = (i < 8 ? fwd : back) + rand(-1.3, 1.3);
      this.spines.push({ x, y, a, len: rand(14, 38) * scale, r: rand(1.6, 3.2) * scale, k: 0, rate: rand(5, 9) });
    }
    /* Satellite spatter, flicked out along the line of impact. */
    for (let i = 0; i < 12; i++) {
      const a = fwd + rand(-0.7, 0.7);
      const d = rand(22, 60) * scale;
      this.stains.push({ x: x + Math.cos(a) * d, y: y + Math.sin(a) * d, r: 0, to: rand(1.4, 3.4) * scale, grow: rand(30, 60) });
    }

    /* Flung droplets: most exit forward, some kick back towards the thrower. */
    for (let i = 0; i < 34; i++) {
      const a = (Math.random() < 0.72 ? fwd : back) + rand(-1.0, 1.0);
      const v = rand(140, 560) * scale;
      this.drops.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - rand(60, 220), r: rand(1.6, 4.6) * scale });
    }

    /* Runs that crawl down the face. */
    const runs = Math.round(rand(3, 5));
    for (let i = 0; i < runs; i++) {
      this.drips.push({
        x: x + rand(-14, 14) * scale, y: y + rand(-4, 8) * scale,
        v: rand(55, 120) * scale, w: rand(1.5, 2.6) * scale, bulb: rand(2.6, 3.6) * scale,
        len: 0, max: rand(55, 150) * scale, trail: [], wob: rand(0, 6.28), done: false
      });
    }

    this.start();
  }

  start() {
    if (this.running) return;
    this.running = true;
    gsap.ticker.add(this.tick);
  }

  stop() {
    this.running = false;
    gsap.ticker.remove(this.tick);
    this.drops = [];
    this.stains = [];
    this.spines = [];
    this.drips = [];
    this.ctx.clearRect(0, 0, this.w, this.h);
  }

  tick = (time, deltaMs) => {
    const dt = Math.min(deltaMs / 1000, 1 / 30);
    this.age += dt;
    if (this.age > HOLD) this.alpha -= dt * this.fadeRate;
    if (this.alpha <= 0) { this.stop(); return; }

    const { ctx } = this;
    ctx.clearRect(0, 0, this.w, this.h);
    ctx.globalAlpha = Math.max(0, this.alpha);
    ctx.fillStyle = '#a3061b';

    /* Stains swell to size on impact. */
    for (const s of this.stains) {
      s.r = Math.min(s.to, s.r + s.grow * dt * 6);
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    /* Spines shoot out from the splat and taper to a point. */
    for (const sp of this.spines) {
      sp.k = Math.min(1, sp.k + sp.rate * dt);
      const len = sp.len * (1 - Math.pow(1 - sp.k, 3));
      const ca = Math.cos(sp.a);
      const sa = Math.sin(sp.a);
      for (let d = 0; d <= len; d += 1.5) {
        const f = d / sp.len;
        ctx.beginPath();
        ctx.arc(sp.x + ca * d, sp.y + sa * d, sp.r * (1 - f * 0.8), 0, Math.PI * 2);
        ctx.fill();
      }
      /* A bead where the streak ends. */
      if (sp.k >= 1) {
        ctx.beginPath();
        ctx.arc(sp.x + ca * len, sp.y + sa * len, sp.r * 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    /* Drips: fast at first, slowing as the run thins out; the tip
       swells until its weight pulls it free. */
    for (const d of this.drips) {
      if (!d.done) {
        const slow = 1 - d.len / d.max;
        const step = d.v * (0.25 + 0.75 * slow) * dt;
        d.len += step;
        d.y += step;
        d.x += Math.sin(d.wob + d.len * 0.09) * 0.25;
        d.trail.push([d.x, d.y]);
        d.bulb += dt * 1.6;
        if (d.len >= d.max) {
          d.done = true;
          this.drops.push({ x: d.x, y: d.y + d.bulb, vx: rand(-6, 6), vy: rand(40, 90), r: d.bulb * 0.9 });
          d.bulb = d.w * 0.8;
        }
      }
      const n = d.trail.length;
      for (let i = 0; i < n; i += 2) {
        const k = i / Math.max(n - 1, 1);
        const [tx, ty] = d.trail[i];
        ctx.beginPath();
        ctx.arc(tx, ty, d.w * (0.55 + 0.45 * k), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.beginPath();
      ctx.arc(d.x, d.y + d.bulb * 0.4, d.bulb, 0, Math.PI * 2);
      ctx.fill();
    }

    /* Flying drops, stretched by their speed. */
    this.drops = this.drops.filter((p) => {
      p.vx *= 1 - 0.5 * dt;
      p.vy += GRAVITY * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.y - p.r > this.h || p.x < -20 || p.x > this.w + 20) return false;
      const sp = Math.hypot(p.vx, p.vy);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, p.r * (1 + sp / 900), p.r * (1 - Math.min(0.3, sp / 3000)), Math.atan2(p.vy, p.vx), 0, Math.PI * 2);
      ctx.fill();
      return true;
    });
  };

  destroy() {
    this.stop();
  }
}
