import Lenis from 'lenis';
import gsap from 'gsap';
import store from './Store.js';

/** Lenis smooth scroll, driven off the GSAP ticker so everything shares one clock. */
export default class Scroll {
  constructor() {
    this.lenis = new Lenis({
      duration: 1.15,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      smoothWheel: true,
      syncTouch: false,
      touchMultiplier: 1.6,
      wheelMultiplier: 1,
      autoResize: true
    });

    this.prev = 0;
    /* Start from wherever the page actually is (a reload can restore a scroll position). */
    store.scroll = window.scrollY;

    this.lenis.on('scroll', ({ scroll, velocity }) => {
      store.scroll = scroll;
      store.velocity = velocity;
      store.emitter.emit('scroll', scroll, velocity);
    });

    this.raf = (time) => this.lenis.raf(time * 1000);
    gsap.ticker.add(this.raf);
    gsap.ticker.lagSmoothing(0);
  }

  /** Endless wrap-around scroll — used by the work carousel. */
  setInfinite(on) {
    this.lenis.options.infinite = !!on;
  }

  stop()  { this.lenis.stop(); }
  start() { this.lenis.start(); }

  /**
   * To the top, for certain (a new page always starts there): the window
   * itself first, then Lenis. Lenis alone skips a jump to where it believes
   * it already is — and it can be wrong, as when the browser has moved the
   * page without it — or a jump while it's stopped.
   */
  toTop() {
    window.scrollTo(0, 0);
    this.lenis.scrollTo(0, { immediate: true, force: true });
    store.scroll = 0;
    store.velocity = 0;
  }

  resize() { this.lenis.resize(); }

  destroy() {
    gsap.ticker.remove(this.raf);
    this.lenis.destroy();
  }
}
