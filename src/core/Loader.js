import gsap from 'gsap';
import store from './Store.js';
import assets from './Assets.js';

/**
 * Preloader with a real progress counter.
 * Guarded by a hard timeout so a stalled asset can never trap the visitor
 * behind the curtain.
 */
export default class Loader {
  constructor() {
    this.el = document.querySelector('.loader');
    this.percentage = this.el?.querySelector('.loader-progress');
    this.icon = this.el?.querySelector('.loader-icon-inner');
    this.dotA = this.el?.querySelector('.loader-dot-a');
    this.dotB = this.el?.querySelector('.loader-dot-b');

    this.total = 0;
    this.loaded = 0;
    this.displayed = 0;
    this.real = 0;

    this.minDuration = 1600;
    this.hardTimeout = 9000;
    this.startTime = performance.now();

    this.startIcon();
  }

  startIcon() {
    if (!this.dotA || store.reducedMotion) return;
    this.iconTl = gsap
      .timeline({ repeat: -1, defaults: { duration: 0.9, ease: 'power3.inOut' } })
      .to(this.dotA, { attr: { cx: 30 } }, 0)
      .to(this.dotB, { attr: { cx: 18 }, fillOpacity: 1 }, 0)
      .to(this.dotA, { attr: { cx: 18 } }, 0.9)
      .to(this.dotB, { attr: { cx: 30 }, fillOpacity: 0.5 }, 0.9);
  }

  track(promise) {
    return promise
      .catch(() => {})
      .then(() => {
        this.loaded += 1;
        this.real = this.total === 0 ? 1 : this.loaded / this.total;
      });
  }

  async preload(urls) {
    const jobs = urls.map((u) =>
      this.track(assets.load(u, { srgb: true }))
    );
    jobs.push(this.track(assets.load('/textures/noise.png', { srgb: false, wrap: true })));
    jobs.push(this.track(assets.load('/textures/surface.jpg', { srgb: true, wrap: true })));

    this.total = jobs.length;
    this.tick();

    /* Whichever finishes first — all assets, or the safety net. */
    await Promise.race([
      Promise.all(jobs),
      new Promise((r) => setTimeout(r, this.hardTimeout))
    ]);

    this.real = 1;
  }

  tick = () => {
    if (this.finished) return;

    /* Progress is the lesser of real load and elapsed-time pacing, so the
       counter always moves even while a big texture is in flight. */
    const paced = Math.min((performance.now() - this.startTime) / this.minDuration, 1);
    const target = Math.min(this.real, paced);

    this.displayed += (target - this.displayed) * 0.08;
    if (this.percentage) this.percentage.textContent = Math.round(this.displayed * 100);

    this.rafId = requestAnimationFrame(this.tick);
  };

  async finish() {
    const elapsed = performance.now() - this.startTime;
    if (elapsed < this.minDuration) {
      await new Promise((r) => setTimeout(r, this.minDuration - elapsed));
    }

    this.finished = true;
    cancelAnimationFrame(this.rafId);

    await new Promise((resolve) => {
      const counter = { v: this.displayed };
      gsap.to(counter, {
        v: 1,
        duration: 0.5,
        ease: 'power2.out',
        onUpdate: () => {
          if (this.percentage) this.percentage.textContent = Math.round(counter.v * 100);
        },
        onComplete: resolve
      });
    });
  }

  async out() {
    this.iconTl?.kill();
    await gsap
      .timeline()
      .to(this.el.querySelectorAll('.loader-icon, .loader-progress-wrapper'), {
        y: -20, opacity: 0, duration: 0.6, ease: 'power3.in', stagger: 0.06
      })
      .to(this.el, { opacity: 0, duration: 0.8, ease: 'power2.inOut' }, 0.25)
      .then(() => {});
    this.destroy();
  }

  destroy() {
    cancelAnimationFrame(this.rafId);
    this.iconTl?.kill();
    this.el?.remove();
  }
}
