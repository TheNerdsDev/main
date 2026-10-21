import gsap from 'gsap';

/* What counts as something to click. */
const INTERACTIVE = 'a, button, [role="button"], label, summary, [data-cursor]';

/**
 * The pointer as a tiny star system: a bright dot right on the pointer,
 * and an orbit ring that trails it with a satellite circling the ring.
 *
 *  - over anything clickable the ring opens up and the satellite speeds up
 *  - over a space rock it tightens into a target
 *  - pressing squeezes it
 *  - over text fields it steps aside for the normal caret
 *
 * Only for mice and trackpads; touch keeps the native behaviour.
 */
export default class Cursor {
  static supported() {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  constructor() {
    this.el = document.createElement('div');
    this.el.className = 'cursor';
    this.el.setAttribute('aria-hidden', 'true');
    this.el.innerHTML = '<span class="cursor-ring"><span class="cursor-sat"></span></span><span class="cursor-dot"></span><span class="cursor-label"></span>';
    document.body.appendChild(this.el);
    this.ring = this.el.querySelector('.cursor-ring');
    this.dot = this.el.querySelector('.cursor-dot');
    this.label = this.el.querySelector('.cursor-label');
    this.sat = this.el.querySelector('.cursor-sat');
    this.angle = 0;
    this.speed = 1;

    this.x = this.y = this.rx = this.ry = -100;
    this.shown = false;
    document.documentElement.classList.add('has-cursor');

    /* Any movement over the page shows it — the first, and every one after
       the pointer has been off the window and come back. (Not left to an
       "enter" event: not every browser sends one to the document, and with
       the system arrow hidden the visitor was left with no pointer at all.)
       Coming back, the ring starts where the pointer is, not where it left. */
    this.onMove = (e) => {
      this.x = e.clientX;
      this.y = e.clientY;
      if (!this.shown) {
        this.shown = true;
        this.rx = this.x;
        this.ry = this.y;
        this.el.classList.add('is-visible');
      }
    };
    this.onOver = (e) => this.target(e.target);
    this.onDown = () => this.el.classList.add('is-down');
    this.onUp = () => this.el.classList.remove('is-down');
    /* Off the window (out to nothing, or the window losing focus): hidden. */
    this.hide = () => {
      if (!this.shown) return;
      this.shown = false;
      this.el.classList.remove('is-visible', 'is-down');
    };
    this.onLeave = (e) => { if (!e.relatedTarget) this.hide(); };

    window.addEventListener('pointermove', this.onMove, { passive: true });
    document.addEventListener('pointerover', this.onOver, { passive: true });
    window.addEventListener('pointerdown', this.onDown, { passive: true });
    window.addEventListener('pointerup', this.onUp, { passive: true });
    document.addEventListener('pointerout', this.onLeave, { passive: true });
    window.addEventListener('blur', this.hide);

    gsap.ticker.add(this.tick);
  }

  target(node) {
    const el = node instanceof Element ? node : null;
    const text = el?.closest('input, textarea, select, [contenteditable="true"]');
    const hit = el?.closest(INTERACTIVE);
    const rock = el?.closest('.duo-action');
    this.el.classList.toggle('is-text', !!text);
    this.el.classList.toggle('is-hover', !!hit && !rock);
    this.el.classList.toggle('is-rock', !!rock);
    const label = hit?.getAttribute('data-cursor') || (rock ? 'Throw' : '');
    if (label !== this.label.textContent) this.label.textContent = label;
    this.el.classList.toggle('has-label', !!label);
  }

  tick = (time, deltaMs) => {
    /* The ring lags behind a little, like something in orbit being towed. */
    const k = 1 - Math.pow(1 - 0.2, gsap.ticker.deltaRatio(60));
    /* The satellite circles clockwise, like the rocks; faster when there's something to click. */
    const busy = this.el.classList.contains('is-hover') || this.el.classList.contains('is-rock');
    this.speed += ((busy ? 4.2 : 1) - this.speed) * k * 0.5;
    this.angle += Math.min(deltaMs, 50) * 0.0022 * this.speed;
    this.sat.style.transform = `rotate(${this.angle.toFixed(3)}rad)`;
    this.rx += (this.x - this.rx) * k;
    this.ry += (this.y - this.ry) * k;
    this.dot.style.transform = `translate3d(${this.x}px, ${this.y}px, 0)`;
    this.ring.style.transform = `translate3d(${this.rx}px, ${this.ry}px, 0)`;
    this.label.style.transform = `translate3d(${this.rx}px, ${this.ry}px, 0)`;
  };

  destroy() {
    gsap.ticker.remove(this.tick);
    window.removeEventListener('pointermove', this.onMove);
    document.removeEventListener('pointerover', this.onOver);
    window.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    document.removeEventListener('pointerout', this.onLeave);
    window.removeEventListener('blur', this.hide);
    document.documentElement.classList.remove('has-cursor');
    this.el.remove();
  }
}
