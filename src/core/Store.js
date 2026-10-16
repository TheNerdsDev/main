import Emitter from './Emitter.js';

/** Detects a usable WebGL2 context without leaking it. */
const detectWebGL = () => {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return false;
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return true;
  } catch { return false; }
};

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* The tallest the viewport gets — on a phone, with the browser's address
   bar slid away (100lvh; 100vh where lvh isn't known, which in Chrome and
   Safari on phones is the same thing). Read off a hidden fixed box. */
let probe = null;
const tallest = () => {
  if (!probe) {
    probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:fixed;top:0;left:0;width:0;height:100vh;height:100lvh;visibility:hidden;pointer-events:none;';
    document.documentElement.appendChild(probe);
  }
  return probe.offsetHeight || window.innerHeight;
};

class Store {
  constructor() {
    this.emitter = new Emitter();
    this.html = document.documentElement;

    this.reducedMotion = reduced();
    this.hasWebGL = detectWebGL() && !this.reducedMotion;

    this.isTouch = window.matchMedia('(pointer: coarse)').matches;
    /* A phone, held either way up (its short side under 600px). Photos
       are shown as plain images there, not WebGL planes (Media.create):
       a plane is placed from the scroll once a frame, while the page
       around it is scrolled by the browser, so on a busy phone the two
       slip apart — and every card there is flat, sharp and in colour
       anyway, which an image is too. */
    this.isPhone = this.isTouch && Math.min(window.screen.width, window.screen.height) < 600;
    this.width = window.innerWidth;
    this.height = this.viewHeight();
    this.aspect = this.width / this.height;
    this.isMobile = this.width < 768;
    this.isTablet = this.width < 1100 || (this.width < 1366 && this.isTouch);
    this.isDesktop = !this.isTablet;
    this.setDpr();

    /* live values written by Scroll / pointer */
    this.scroll = 0;
    this.scrollTarget = 0;
    this.velocity = 0;
    this.mouse = { x: 0, y: 0 };          // normalised -1..1
    this.mouseScreen = { x: 0, y: 0 };    // 0..1, y flipped for GL
    this.pointerDown = false;

    /* flags */
    this.isTransitioning = false;
    /* The phone menu's opaque panel fills the screen: nothing under it is
       seen, so nothing under it is drawn (App.bindMenu). */
    this.covered = false;
    this.pageId = document.querySelector('.page')?.dataset.page || 'main';

    this.time = 0;
  }

  /**
   * The viewport height everything is drawn and measured against. On a
   * touch screen it's the tallest the viewport gets, and stays put while
   * the address bar slides in and out (that changes innerHeight by ~56px
   * on every change of scroll direction): the full-screen canvases are
   * that tall (100lvh, base.css), so nothing has to be re-measured,
   * re-laid-out or redrawn for it — the same scroll position always
   * shows the same thing.
   */
  viewHeight() {
    return this.isTouch ? Math.max(tallest(), window.innerHeight) : window.innerHeight;
  }

  /** Re-read the viewport; false if nothing that's drawn or measured changed. */
  resize() {
    const width = window.innerWidth;
    const height = this.viewHeight();
    const changed = width !== this.width || height !== this.height;
    this.width = width;
    this.height = height;
    this.aspect = this.width / this.height;
    this.isMobile = this.width < 768;
    this.isTablet = this.width < 1100 || (this.width < 1366 && this.isTouch);
    this.isDesktop = !this.isTablet;
    this.setDpr();
    return changed;
  }

  /**
   * How finely the canvases draw. A touch screen (a phone, a tablet) gets
   * 1.5 device pixels to the CSS pixel: on its small, dense screen that
   * still reads as sharp, and it's half the pixels of 2× (over a third
   * fewer than 1.75×) to fill every frame — phone GPUs choke on fill
   * long before anything else. `dpr` is the world's; `fxDpr` the layers
   * that come and go over it (the thrown rock, the planets).
   */
  setDpr() {
    const device = window.devicePixelRatio || 1;
    this.dpr = Math.min(device, this.isTouch ? 1.5 : 1.75);
    this.fxDpr = Math.min(device, this.isTouch ? 1.5 : 2);
  }
}

export default new Store();
