import gsap from 'gsap';
import store from './Store.js';
import assets from './Assets.js';
import LogoRocket from '../fx/LogoRocket.js';

/**
 * Preloader with a real progress counter, and the logo: its letters jump in
 * one by one, then the rocket rides the trail as loading runs and docks in
 * the R at 100%.
 * Guarded by a hard timeout so a stalled asset can never trap the visitor
 * behind the curtain.
 */
export default class Loader {
  constructor() {
    this.el = document.querySelector('.loader');
    this.percentage = this.el?.querySelector('.loader-progress');
    const mark = this.el?.querySelector('.loader-logo-mark');
    this.logo = mark ? new LogoRocket(mark) : null;

    this.total = 0;
    this.loaded = 0;
    this.displayed = 0;
    this.real = 0;

    this.minDuration = 1600;
    this.hardTimeout = 9000;
    this.startTime = performance.now();

    this.startLogo();
  }

  /** The letters rise in one after another; the rocket waits at the start of its trail. */
  startLogo() {
    if (!this.logo || store.reducedMotion) return;
    this.logo.setFlight(0);
    this.introTl = gsap.timeline().fromTo(this.logo.letters,
      { y: 24, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out', stagger: 0.06 });
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
    /* Never quite docked until finish() says so. */
    if (!store.reducedMotion) this.logo?.setFlight(Math.min(this.displayed, 0.999));

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
          if (!store.reducedMotion) this.logo?.setFlight(Math.min(counter.v, 0.999));
        },
        onComplete: resolve
      });
    });

    /* Docked: a little hop along the letters to celebrate. */
    if (this.logo && !store.reducedMotion) {
      this.logo.setFlight(1);
      this.introTl?.progress(1);
      this.logo.domino(gsap.timeline(), 0);
      /* (The curtain starts lifting while the last letters still bounce.) */
      await new Promise((r) => setTimeout(r, 450));
    }
  }

  async out() {
    this.introTl?.kill();
    await gsap
      .timeline()
      .to(this.el.querySelectorAll('.loader-logo, .loader-progress-wrapper'), {
        y: -20, opacity: 0, duration: 0.6, ease: 'power3.in', stagger: 0.06
      })
      .to(this.el, { opacity: 0, duration: 0.8, ease: 'power2.inOut' }, 0.25)
      .then(() => {});
    this.destroy();
  }

  destroy() {
    cancelAnimationFrame(this.rafId);
    this.introTl?.kill();
    this.logo?.destroy();
    this.el?.remove();
  }
}
