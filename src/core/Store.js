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

/* Weak hardware, known before anything is drawn: little memory (Chrome
   tells), or a phone with a 720p-class screen — a budget phone, whose GPU
   is a fraction of a laptop's. Starts a step lighter (see setDpr). */
const weak = (touch) => {
  const memory = navigator.deviceMemory;
  const short = Math.min(window.screen?.width || 0, window.screen?.height || 0) * (window.devicePixelRatio || 1);
  return (memory > 0 && memory <= 4) || (touch && short > 0 && short <= 760);
};

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
    /* How lightly everything draws: 0 full, 1 lighter, 2 lightest. Weak
       hardware starts at 1; a device that turns out slow in use steps down
       from there (App.watch). */
    this.quality = weak(this.isTouch) ? 1 : 0;
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
   * How finely the canvases draw, by `quality` (full, lighter, lightest).
   * Phone and tablet GPUs choke on fill long before anything else, so a
   * touch screen draws fewer device pixels to the CSS pixel than its own:
   * there the world is only the sky (the pictures are the browser's own,
   * sharp at the screen's resolution — gl/Media.js), soft enough not to
   * show it. `dpr` is the world's; `fxDpr` the layers that come and go
   * over it (the rocks, the planets).
   */
  setDpr() {
    const device = window.devicePixelRatio || 1;
    const q = Math.min(this.quality, 2);
    /* (A phone either way up: turned sideways it's wider than a tablet's
       portrait, but no bigger.) */
    const phone = this.isTouch && Math.min(this.width, this.height) < 600;
    const [world, fx] = phone
      ? [[1.25, 1, 0.8], [1.25, 1, 0.8]]
      : this.isTouch
        ? [[1.5, 1.15, 0.9], [1.5, 1.15, 0.9]]
        : [[1.75, 1.25, 1], [2, 1.5, 1]];
    this.dpr = Math.min(device, world[q]);
    this.fxDpr = Math.min(device, fx[q]);
  }
}

export default new Store();
