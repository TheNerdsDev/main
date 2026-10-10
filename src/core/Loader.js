import gsap from 'gsap';
import store from './Store.js';
import assets from './Assets.js';
import LoaderLogo from '../fx/LoaderLogo.js';

/**
 * Preloader with a real progress counter, and the logo: its letters rise in
 * one by one, the rocket flies along its trail leaving tricolour clouds, and
 * docks in the R once everything's loaded (fx/LoaderLogo.js — all of it on
 * the compositor, so it stays smooth while the page is being built).
 * Guarded by a hard timeout so a stalled asset can never trap the visitor
 * behind the curtain.
 */
export default class Loader {
  constructor() {
    this.el = document.querySelector('.loader');
    this.percentage = this.el?.querySelector('.loader-progress');
    const host = this.el?.querySelector('.loader-logo');
    this.logo = host ? new LoaderLogo(host, { still: store.reducedMotion }) : null;

    this.total = 0;
    this.loaded = 0;
    this.displayed = 0;
    this.real = 0;

    this.minDuration = 1600;
    this.hardTimeout = 9000;
    this.startTime = performance.now();

    this.logo?.intro();
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

    /* The counter runs up to 100 as the rocket comes in and docks. */
    const counter = { v: this.displayed };
    await Promise.all([
      this.logo?.land(),
      gsap.to(counter, {
        v: 1,
        duration: 0.6,
        ease: 'power2.out',
        onUpdate: () => {
          if (this.percentage) this.percentage.textContent = Math.round(counter.v * 100);
        }
      }).then(() => {})
    ]);

    /* Docked: a little hop along the letters to celebrate — the curtain
       starts lifting while the last letters still bounce. */
    if (this.logo && !store.reducedMotion) {
      this.logo.celebrate();
      await new Promise((r) => setTimeout(r, 450));
    }
  }

  /** Lift the curtain — on the compositor too, whatever the page is busy with. */
  async out() {
    const parts = this.el.querySelectorAll('.loader-logo, .loader-progress-wrapper');
    parts.forEach((el, i) => el.animate(
      [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-20px)', opacity: 0 }],
      { duration: 600, delay: i * 60, easing: 'cubic-bezier(0.55, 0, 1, 0.45)', fill: 'forwards' }
    ));
    await this.el.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 800, delay: 250, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'forwards' }
    ).finished;
    this.destroy();
  }

  destroy() {
    cancelAnimationFrame(this.rafId);
    this.logo?.destroy();
    this.el?.remove();
  }
}
