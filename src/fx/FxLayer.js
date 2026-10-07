import gsap from 'gsap';

/**
 * A full-screen 2D canvas above the page for short-lived effects —
 * the dust and grit of thrown rocks, impacts, sparks and arcs. It only ticks while
 * at least one effect is alive, so it costs nothing when idle.
 *
 * An effect is any object with `update(dt, ctx, layer)` returning false
 * once it has finished.
 */
export default class FxLayer {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'fx-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d');

    this.effects = [];
    this.running = false;

    this.resize();
  }

  resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  add(effect) {
    this.effects.push(effect);
    if (!this.running) {
      this.running = true;
      gsap.ticker.add(this.tick);
    }
    return effect;
  }

  tick = (time, deltaMs) => {
    /* An effect's callback can start a GSAP tween, and waking GSAP's ticker
       runs a frame synchronously — never let that re-enter this tick. */
    if (this.ticking) return;
    this.ticking = true;
    try {
      this.step(deltaMs);
    } finally {
      this.ticking = false;
    }
  };

  step(deltaMs) {
    /* Clamp so a backgrounded tab doesn't fling particles across the screen. */
    const dt = Math.min(deltaMs / 1000, 1 / 30);
    const { ctx } = this;

    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    ctx.clearRect(0, 0, this.w, this.h);

    /* Effects may spawn others mid-update (a meteor spawns its impact),
       so collect new ones separately rather than mutating the live list. */
    const current = this.effects;
    this.effects = [];
    const alive = current.filter((e) => {
      ctx.save();
      const keep = e.update(dt, ctx, this) !== false;
      ctx.restore();
      return keep;
    });
    this.effects = alive.concat(this.effects);

    if (!this.effects.length) {
      ctx.clearRect(0, 0, this.w, this.h);
      gsap.ticker.remove(this.tick);
      this.running = false;
    }
  }

  destroy() {
    gsap.ticker.remove(this.tick);
    this.effects = [];
    this.canvas.remove();
  }
}
