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

class Store {
  constructor() {
    this.emitter = new Emitter();
    this.html = document.documentElement;

    this.reducedMotion = reduced();
    this.hasWebGL = detectWebGL() && !this.reducedMotion;

    this.isTouch = window.matchMedia('(pointer: coarse)').matches;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
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
    this.pageId = document.querySelector('.page')?.dataset.page || 'main';

    this.time = 0;
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.aspect = this.width / this.height;
    this.isMobile = this.width < 768;
    this.isTablet = this.width < 1100 || (this.width < 1366 && this.isTouch);
    this.isDesktop = !this.isTablet;
    this.setDpr();
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
