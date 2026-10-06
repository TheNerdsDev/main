import { rand, clamp, drawDust } from './particles.js';

/**
 * A space rock thrown from one point to another along a shallow arc.
 * The rock itself is a 3D asteroid on the RockStage; this effect moves
 * it, sheds a little grit behind it, and bursts it on arrival.
 *
 * `from` and `to` return viewport points. The launch point is frozen in
 * document space; the target is tracked live so the rock always lands on
 * the face even if the page scrolls mid-flight.
 */
export class RockThrow {
  constructor({ stage, from, to, tint = [200, 200, 200], radius = 18, duration = 0.95, onImpact }) {
    const p = from();
    this.start = { x: p.x, y: p.y + window.scrollY };
    this.to = to;
    this.duration = duration;
    this.radius = radius;
    this.onImpact = onImpact;
    this.rock = stage.rock(radius, tint);
    this.t = 0;
    this.grit = [];
    this.landed = false;
  }

  path(k) {
    const sy = window.scrollY;
    const a = { x: this.start.x, y: this.start.y - sy };
    const b = this.to();
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const dist = Math.hypot(dx, dy) || 1;
    /* Bow the arc towards the top of the screen. */
    let nx = -dy / dist;
    let ny = dx / dist;
    if (ny > 0) { nx = -nx; ny = -ny; }
    const lift = dist * 0.22;
    const c = { x: (a.x + b.x) / 2 + nx * lift, y: (a.y + b.y) / 2 + ny * lift };

    const u = 1 - k;
    const x = u * u * a.x + 2 * u * k * c.x + k * k * b.x;
    const y = u * u * a.y + 2 * u * k * c.y + k * k * b.y;
    const tx = 2 * u * (c.x - a.x) + 2 * k * (b.x - c.x);
    const ty = 2 * u * (c.y - a.y) + 2 * k * (b.y - c.y);
    const tl = Math.hypot(tx, ty) || 1;
    return { x, y, dx: tx / tl, dy: ty / tl };
  }

  update(dt, ctx) {
    this.t += dt;
    const sy = window.scrollY;

    if (!this.landed) {
      const k = clamp(this.t / this.duration, 0, 1);
      /* It is falling as much as flying: ease in slightly. */
      const head = this.path(k * 0.8 + k * k * 0.2);
      /* Leaves the hand at full size almost at once. */
      const grow = Math.min(1, 0.55 + this.t / 0.12);
      this.rock.place(head.x, head.y, dt, grow);

      /* A few grains of loose regolith shaken off as it tumbles. */
      const n = Math.round(rand(10, 18) * dt + (Math.random() < 0.3 ? 1 : 0));
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2);
        this.grit.push({
          x: head.x + Math.cos(a) * this.radius * 0.8, y: head.y + sy + Math.sin(a) * this.radius * 0.8,
          vx: -head.dx * rand(20, 70) + rand(-15, 15), vy: -head.dy * rand(20, 70) + rand(-10, 25),
          r: rand(0.6, 1.5), life: 0, max: rand(0.5, 1.1)
        });
      }

      if (k >= 1) {
        this.landed = true;
        const dir = { x: head.dx, y: head.dy };
        this.rock.burst(head.x, head.y, dir);
        this.onImpact?.({ x: head.x, y: head.y }, dir);
      }
    }

    this.grit = this.grit.filter((p) => (p.life += dt) < p.max);
    ctx.fillStyle = '#9a8e80';
    for (const p of this.grit) {
      const k = p.life / p.max;
      p.vy += 220 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = 0.55 * (1 - k);
      ctx.beginPath();
      ctx.arc(p.x, p.y - sy, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    return !this.landed || this.grit.length > 0;
  }
}

/**
 * What the burst leaves in the air: a cloud of pulverised rock dust that
 * billows back towards the thrower, fast grit, and a fine mist of blood.
 * The big fragments are 3D, on the RockStage.
 */
export class RockImpact {
  constructor({ at, dir, scale = 1 }) {
    this.x = at.x;
    this.y = at.y + window.scrollY;
    this.t = 0;
    const back = Math.atan2(-dir.y, -dir.x);
    const fwd = Math.atan2(dir.y, dir.x);

    this.dust = Array.from({ length: 26 }, (_, i) => {
      const a = (i < 18 ? back : rand(0, Math.PI * 2)) + rand(-1.4, 1.4);
      const v = rand(40, 260) * scale;
      return {
        x: this.x + rand(-5, 5), y: this.y + rand(-5, 5), vx: Math.cos(a) * v, vy: Math.sin(a) * v - rand(10, 50),
        r0: rand(4, 9) * scale, r1: rand(22, 48) * scale, life: 0, max: rand(0.9, 1.8),
        rot: rand(0, 6.28), spin: rand(-1, 1), tone: [rand(118, 150) | 0, rand(108, 136) | 0, rand(96, 120) | 0]
      };
    });

    this.grit = Array.from({ length: 54 }, () => {
      const a = (Math.random() < 0.75 ? back : fwd) + rand(-1.3, 1.3);
      const v = rand(180, 720) * scale;
      return {
        x: this.x, y: this.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - rand(40, 200),
        r: rand(0.6, 2.2) * scale, life: 0, max: rand(0.45, 1.1), light: Math.random() < 0.3
      };
    });

    this.mist = Array.from({ length: 46 }, () => {
      const a = fwd + rand(-0.9, 0.9);
      const v = rand(120, 520) * scale;
      return {
        x: this.x, y: this.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - rand(30, 140),
        r: rand(0.5, 1.7) * scale, life: 0, max: rand(0.5, 1.1)
      };
    });
  }

  update(dt, ctx) {
    this.t += dt;
    const sy = window.scrollY;

    /* Dust: an instant dense puff that billows out and thins. */
    this.dust = this.dust.filter((p) => (p.life += dt) < p.max);
    for (const p of this.dust) {
      const k = p.life / p.max;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 1 - 2.4 * dt; p.vy *= 1 - 2.4 * dt; p.vy -= 10 * dt;
      p.rot += p.spin * dt;
      const r = p.r0 + (p.r1 - p.r0) * (1 - Math.pow(1 - k, 2.4));
      drawDust(ctx, p.x, p.y - sy, r, p.rot, 0.62 * Math.pow(1 - k, 1.5) * Math.min(1, k * 14), p.tone);
    }

    /* Grit: short streaks along their motion, falling. */
    this.grit = this.grit.filter((p) => (p.life += dt) < p.max);
    ctx.lineCap = 'round';
    for (const p of this.grit) {
      const k = p.life / p.max;
      p.vx *= 1 - 1.6 * dt; p.vy *= 1 - 1.6 * dt; p.vy += 1300 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      ctx.globalAlpha = 1 - k * k;
      ctx.strokeStyle = p.light ? '#b9ad9e' : '#5a5048';
      ctx.lineWidth = p.r;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - sy);
      ctx.lineTo(p.x - p.vx * 0.012, p.y - sy - p.vy * 0.012);
      ctx.stroke();
    }

    /* Blood mist along the line of travel. */
    this.mist = this.mist.filter((p) => (p.life += dt) < p.max);
    ctx.fillStyle = '#7a0410';
    for (const p of this.mist) {
      const k = p.life / p.max;
      p.vx *= 1 - 1.4 * dt; p.vy *= 1 - 1.4 * dt; p.vy += 1100 * dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      const sp = Math.hypot(p.vx, p.vy);
      ctx.globalAlpha = 0.85 * (1 - k * k);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y - sy, p.r * (1 + sp / 600), p.r, Math.atan2(p.vy, p.vx), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    return this.dust.length || this.grit.length || this.mist.length;
  }
}
