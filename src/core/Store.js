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
    this.dpr = Math.min(window.devicePixelRatio || 1, this.isMobile ? 2 : 1.75);

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
    this.dpr = Math.min(window.devicePixelRatio || 1, this.isMobile ? 2 : 1.75);
  }
}

export default new Store();
