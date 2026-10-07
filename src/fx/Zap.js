import { rand, clamp, lerp, drawGlow, drawDust } from './particles.js';

const isLight = () => document.documentElement.dataset.theme === 'light';

/** A jagged bolt from (x, y) heading `ang`, as a list of points. */
const bolt = (x, y, ang, len, kinks) => {
  const pts = [[x, y]];
  const step = len / kinks;
  for (let i = 1; i <= kinks; i++) {
    ang += rand(-0.75, 0.75);
    x += Math.cos(ang) * step * rand(0.6, 1.3);
    y += Math.sin(ang) * step * rand(0.6, 1.3);
    pts.push([x, y]);
  }
  return pts;
};

const stroke = (ctx, pts) => {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.stroke();
};

/** A four-pointed cartoon star, centred on 0, 0. */
const starPath = (ctx, r) => {
  const w = r * 0.34;
  ctx.beginPath();
  ctx.moveTo(0, -r);
  ctx.quadraticCurveTo(w * 0.35, -w * 0.35, r, 0);
  ctx.quadraticCurveTo(w * 0.35, w * 0.35, 0, r);
  ctx.quadraticCurveTo(-w * 0.35, w * 0.35, -r, 0);
  ctx.quadraticCurveTo(-w * 0.35, -w * 0.35, 0, -r);
  ctx.closePath();
};

/**
 * A rock just hit a neon sketch, so the tube shorts out: jagged arcs
 * crackle across the drawing from the point of impact, re-striking every
 * few frames, and hot sparks spit out and fall. Then the classic — a
 * little ring of stars circling the head while they see stars.
 *
 *   at    () => impact point, viewport px (follows the recoil)
 *   head  () => crown of the head, viewport px
 */
export class Zap {
  constructor({ at, head, colour, scale = 1, dir = { x: 0, y: 0 } }) {
    this.at = at;
    this.head = head;
    this.rgb = colour;
    this.scale = scale;
    this.t = 0;
    this.restrike = 0;
    this.arcs = [];

    const p = at();
    const away = Math.atan2(dir.y, dir.x);
    this.sparks = Array.from({ length: 34 }, () => {
      const a = (Math.random() < 0.7 ? away : rand(0, Math.PI * 2)) + rand(-1.1, 1.1);
      const v = rand(220, 760) * scale;
      return {
        x: p.x, y: p.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - rand(60, 220),
        life: 0, max: rand(0.28, 0.75), w: rand(0.8, 1.9) * scale
      };
    });

    /* Dizzy stars: a tilted ring above the head, each star its own size. */
    this.stars = Array.from({ length: 4 }, (_, i) => ({ off: (i / 4) * Math.PI * 2 + rand(-0.3, 0.3), r: rand(5.5, 8.5) * scale, spin: rand(2, 4) }));
    this.spin = 0;
  }

  strike() {
    const p = this.at();
    const s = this.scale;
    const n = Math.round(rand(3, 5));
    this.arcs = Array.from({ length: n }, () => {
      const main = bolt(p.x, p.y, rand(0, Math.PI * 2), rand(40, 105) * s, Math.round(rand(6, 10)));
      /* A forked tip on some. */
      const fork = Math.random() < 0.55
        ? bolt(...main[Math.floor(main.length / 2)], rand(0, Math.PI * 2), rand(14, 38) * s, 4)
        : null;
      return { main, fork, a: rand(0.65, 1) };
    });
  }

  update(dt, ctx) {
    this.t += dt;
    const light = isLight();
    const [r, g, b] = this.rgb;
    const t = this.t;

    /* ---- the short: dense for an instant, then a few last stutters. */
    const ARC = 0.55;
    if (t < ARC) {
      this.restrike -= dt;
      if (this.restrike <= 0) {
        this.strike();
        this.restrike = rand(0.03, 0.065);
      }
      /* Gaps between strikes make it flicker rather than glow. */
      const on = t < 0.16 || Math.sin(t * 90) > -0.2;
      if (on) {
        const fade = 1 - Math.pow(t / ARC, 2);
        const p = this.at();
        ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
        drawGlow(ctx, this.rgb, p.x, p.y, 70 * this.scale * fade, light ? 0.35 : 0.8 * fade);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        for (const arc of this.arcs) {
          /* Halo in the tube's colour, then the white-hot core. */
          ctx.globalAlpha = arc.a * fade * (light ? 0.5 : 0.4);
          ctx.strokeStyle = `rgb(${r},${g},${b})`;
          ctx.lineWidth = 5 * this.scale;
          stroke(ctx, arc.main);
          if (arc.fork) stroke(ctx, arc.fork);
          ctx.globalAlpha = arc.a * fade;
          ctx.strokeStyle = light ? `rgb(${r * 0.55 | 0},${g * 0.55 | 0},${b * 0.55 | 0})` : '#fff';
          ctx.lineWidth = 1.3 * this.scale;
          stroke(ctx, arc.main);
          if (arc.fork) stroke(ctx, arc.fork);
        }
      }
    }

    /* ---- sparks: white-hot streaks cooling to the neon colour as they fall. */
    this.sparks = this.sparks.filter((p) => (p.life += dt) < p.max);
    ctx.globalCompositeOperation = light ? 'source-over' : 'lighter';
    ctx.lineCap = 'round';
    for (const p of this.sparks) {
      const k = p.life / p.max;
      p.vx *= 1 - 2.2 * dt;
      p.vy = p.vy * (1 - 2.2 * dt) + 1400 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      const c = lerp(1, 0, clamp(k * 1.6, 0, 1));
      const cr = lerp(r, 255, c) | 0, cg = lerp(g, 255, c) | 0, cb = lerp(b, 255, c) | 0;
      ctx.globalAlpha = 1 - k * k;
      ctx.strokeStyle = light ? `rgb(${r * 0.6 | 0},${g * 0.6 | 0},${b * 0.6 | 0})` : `rgb(${cr},${cg},${cb})`;
      ctx.lineWidth = p.w;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
      ctx.stroke();
    }

    /* ---- seeing stars: in after the jolt, circle the head, slow and fade. */
    const S0 = 0.32;
    const S1 = 2.9;
    if (t > S0 && t < S1) {
      const k = (t - S0) / (S1 - S0);
      const alpha = Math.min(1, (t - S0) / 0.18) * (k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1);
      this.spin += dt * lerp(6.5, 2.2, k);
      const h = this.head();
      const rx = 46 * this.scale;
      const ry = rx * 0.32;
      ctx.globalCompositeOperation = 'source-over';
      /* Far side first, so near stars overlap them. */
      const order = this.stars
        .map((s) => ({ s, a: this.spin + s.off }))
        .sort((p, q) => Math.sin(p.a) - Math.sin(q.a));
      for (const { s, a } of order) {
        const depth = Math.sin(a); // -1 far … 1 near
        const x = h.x + Math.cos(a) * rx;
        const y = h.y - 10 * this.scale + depth * ry;
        const size = s.r * (0.78 + 0.3 * (depth + 1) / 2);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(t * s.spin);
        ctx.globalAlpha = alpha * (0.55 + 0.45 * (depth + 1) / 2);
        if (!light) {
          ctx.shadowColor = 'rgba(255, 214, 90, 0.9)';
          ctx.shadowBlur = 10;
        }
        starPath(ctx, size);
        ctx.fillStyle = light ? '#D99A00' : '#FFE27A';
        ctx.fill();
        ctx.shadowBlur = 0;
        starPath(ctx, size * 0.42);
        ctx.fillStyle = light ? '#FFE9A8' : '#FFFBEA';
        ctx.fill();
        ctx.restore();
      }
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    return t < S1 || this.sparks.length > 0;
  }
}

/**
 * The four rocks meet: a burst of pulverised dust that is dragged round
 * the way they were circling (clockwise), plus fine grit. The large
 * fragments are 3D, on the RockStage (see Scatter).
 *
 *   rocks  [{ x, y }] — where each rock was when they met, viewport px
 */
export class Crumble {
  constructor({ at, rocks, scale = 1 }) {
    this.t = 0;
    this.dust = [];
    this.grit = [];
    for (const rock of rocks) {
      const out = Math.atan2(rock.y - at.y, rock.x - at.x);
      for (let i = 0; i < 9; i++) {
        /* Outward plus the orbit's own clockwise drift (+90° on screen). */
        const a = out + rand(0.3, 1.2) + rand(-0.6, 0.6);
        const v = rand(50, 230) * scale;
        this.dust.push({
          x: rock.x + rand(-8, 8), y: rock.y + rand(-8, 8), vx: Math.cos(a) * v, vy: Math.sin(a) * v,
          r0: rand(6, 12) * scale, r1: rand(34, 70) * scale, life: 0, max: rand(1.1, 2.1),
          rot: rand(0, 6.28), spin: rand(0.2, 0.8), tone: [rand(120, 150) | 0, rand(112, 136) | 0, rand(100, 122) | 0]
        });
      }
      for (let i = 0; i < 22; i++) {
        const a = out + rand(0.2, 1) + rand(-0.9, 0.9);
        const v = rand(220, 820) * scale;
        this.grit.push({ x: rock.x, y: rock.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, r: rand(0.7, 2.2) * scale, life: 0, max: rand(0.4, 1), light: Math.random() < 0.3 });
      }
    }
  }

  update(dt, ctx) {
    this.t += dt;
    this.dust = this.dust.filter((p) => (p.life += dt) < p.max);
    for (const p of this.dust) {
      const k = p.life / p.max;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - 2.2 * dt; p.vy *= 1 - 2.2 * dt;
      p.rot += p.spin * dt;
      const r = p.r0 + (p.r1 - p.r0) * (1 - Math.pow(1 - k, 2.2));
      drawDust(ctx, p.x, p.y, r, p.rot, 0.5 * Math.pow(1 - k, 1.6) * Math.min(1, k * 12), p.tone);
    }

    this.grit = this.grit.filter((p) => (p.life += dt) < p.max);
    ctx.lineCap = 'round';
    for (const p of this.grit) {
      const k = p.life / p.max;
      p.vx *= 1 - 2 * dt; p.vy *= 1 - 2 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = 1 - k * k;
      ctx.strokeStyle = p.light ? '#b9ad9e' : '#5a5048';
      ctx.lineWidth = p.r;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.014, p.y - p.vy * 0.014);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return this.dust.length || this.grit.length;
  }
}
