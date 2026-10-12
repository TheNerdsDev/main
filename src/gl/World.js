import {
  WebGLRenderer, Scene, PerspectiveCamera, OrthographicCamera,
  WebGLRenderTarget, PlaneGeometry, Mesh, ShaderMaterial,
  Vector2, Color, HalfFloatType, RGBAFormat,
  LinearFilter, NoColorSpace, SRGBColorSpace
} from 'three';
import gsap from 'gsap';
import store from '../core/Store.js';
import assets from '../core/Assets.js';
import Stars from './Stars.js';
import InkTrail from './InkTrail.js';
import Media from './Media.js';

import quadVert from './shaders/quad.vert';
import compositeFrag from './shaders/composite.frag';

export const PALETTE = {
  bg:     new Color('#05060F'),
  dark:   new Color('#0B1430'),
  light:  new Color('#8FA8E0'),
  accent: new Color('#6E8FD6'),
  ink:    new Color('#F4F3EE')
};

export default class World {
  constructor(canvas) {
    this.canvas = canvas;
    this.perspective = 1000;

    this.initRenderer();
    this.initCamera();
    this.initTargets();
    this.initUniforms();
    this.initComposite();

    this.scene = new Scene();

    this.ink    = new InkTrail(this);
    this.stars  = new Stars(this);
    this.media  = new Media(this);

    this.uniforms.tInk.value = this.ink.texture;

    this.bindEvents();
    this.resize();
  }

  /* ------------------------------------------------------------ setup */

  initRenderer() {
    this.renderer = new WebGLRenderer({
      canvas: this.canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true
    });
    this.renderer.setPixelRatio(store.dpr);
    this.renderer.setSize(store.width, store.height, false);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.setClearColor(PALETTE.bg, 1);
    assets.setRenderer(this.renderer);
  }

  initCamera() {
    const fov = (180 * (2 * Math.atan(store.height / 2 / this.perspective))) / Math.PI;
    this.camera = new PerspectiveCamera(fov, store.aspect, 10, 14000);
    this.camera.position.z = this.perspective;

    /* Fullscreen pass camera. */
    this.quadCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  initTargets() {
    const w = Math.floor(store.width * store.dpr);
    const h = Math.floor(store.height * store.dpr);
    this.sceneRT = new WebGLRenderTarget(w, h, {
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      format: RGBAFormat,
      depthBuffer: true,
      samples: 0
    });
    this.sceneRT.texture.colorSpace = NoColorSpace;
  }

  initUniforms() {
    /* Shared by every material in the world. */
    this.uniforms = {
      uTime:       { value: 0 },
      uRes:        { value: new Vector2(store.width * store.dpr, store.height * store.dpr) },
      uDpr:        { value: store.dpr },
      uInkAmount:  { value: store.isTouch ? 0.35 : 1 },
      uFade:       { value: 1 },
      uIntro:      { value: 0 },
      tInk:        { value: null },
      uAccent:     { value: PALETTE.accent.clone() },
      uDark:       { value: PALETTE.dark.clone() },
      uLight:      { value: PALETTE.light.clone() },
      uBg:         { value: PALETTE.bg.clone() }
    };
  }

  initComposite() {
    this.compositeMaterial = new ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: compositeFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tScene:     { value: null },
        tInk:       { value: null },
        uRes:       { value: new Vector2() },
        uTime:      { value: 0 },
        uDpr:       { value: store.dpr },
        uGrain:     { value: 0.055 },
        uVignette:  { value: 0.65 },
        uInkAmount: { value: store.isTouch ? 0.35 : 1 },
        uFade:      { value: 1 },
        uAccent:    { value: PALETTE.accent.clone() },
        uBg:        { value: PALETTE.bg.clone() }
      }
    });
    this.quad = new Mesh(new PlaneGeometry(2, 2), this.compositeMaterial);
    this.quad.frustumCulled = false;
    this.quadScene = new Scene();
    this.quadScene.add(this.quad);
  }

  /* ----------------------------------------------------------- events */

  bindEvents() {
    this.onPointerMove = (e) => {
      const x = e.clientX / store.width;
      const y = e.clientY / store.height;
      store.mouseScreen.x = x;
      store.mouseScreen.y = 1 - y;
      store.mouse.x = x * 2 - 1;
      store.mouse.y = -(y * 2 - 1);
      this.ink.setPointer(x, 1 - y);
    };
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });

    this.onLeave = () => this.ink.release();
    window.addEventListener('pointerleave', this.onLeave, { passive: true });
  }

  /* --------------------------------------------------------- lifecycle */

  setAccent(hex) {
    const target = new Color(hex || PALETTE.accent.getHexString());
    const tween = (u) => gsap.to(u.value, {
      r: target.r, g: target.g, b: target.b,
      duration: 1.1, ease: 'power2.inOut', overwrite: 'auto'
    });
    tween(this.uniforms.uAccent);
    tween(this.compositeMaterial.uniforms.uAccent);
  }

  /**
   * Build every shader the first frames will need while the loader is still
   * up — in parallel, on the graphics driver's own threads where the browser
   * offers that (compileAsync) — each set for the target it's drawn into
   * (the world into its offscreen target, the ink into its own, the
   * composite onto the canvas) — then draw one frame, unseen (the canvas
   * is still transparent behind the loader), which sets up the offscreen
   * targets and puts the stars' geometry on the GPU. Left to the first
   * real frame, all of it landed just as the curtain lifted, and the
   * loading animation hitched there.
   */
  async warm() {
    const r = this.renderer;
    if (r.compileAsync) {
      const jobs = [];
      try {
        r.setRenderTarget(this.sceneRT);
        jobs.push(r.compileAsync(this.scene, this.camera));
        r.setRenderTarget(this.ink.write);
        jobs.push(r.compileAsync(this.ink.scene, this.ink.camera));
        r.setRenderTarget(null);
        jobs.push(r.compileAsync(this.quadScene, this.quadCamera));
      } catch {
        /* Compiled on first use instead. */
      }
      r.setRenderTarget(null);
      await Promise.all(jobs).catch(() => {});
    }
    try {
      this.loop(gsap.ticker.time);
    } catch {
      /* Set up on the first real frame instead. */
    }
  }

  reveal() {
    /* The canvas fades up on the compositor: the page's entrance has the
       main thread busy just then, and a fade driven from script stuttered. */
    this.canvas.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: 1200, easing: 'cubic-bezier(0.5, 1, 0.89, 1)', fill: 'forwards'
    });
    gsap.to(this.uniforms.uIntro, { value: 1, duration: 2.4, ease: 'power2.out' });
  }

  fadeTo(value, duration = 0.5) {
    return gsap.to(this.compositeMaterial.uniforms.uFade, {
      value, duration, ease: 'power2.inOut', overwrite: 'auto'
    });
  }

  /* ------------------------------------------------------------- loop */

  resize() {
    const fov = (180 * (2 * Math.atan(store.height / 2 / this.perspective))) / Math.PI;
    this.camera.fov = fov;
    this.camera.aspect = store.aspect;
    this.camera.updateProjectionMatrix();

    this.renderer.setPixelRatio(store.dpr);
    this.renderer.setSize(store.width, store.height, false);

    const w = Math.floor(store.width * store.dpr);
    const h = Math.floor(store.height * store.dpr);
    this.sceneRT.setSize(w, h);

    this.uniforms.uRes.value.set(w, h);
    this.uniforms.uDpr.value = store.dpr;
    this.compositeMaterial.uniforms.uRes.value.set(w, h);
    this.compositeMaterial.uniforms.uDpr.value = store.dpr;

    this.ink.resize();
    this.stars.resize();
    this.media.resize();
  }

  loop(time) {
    store.time = time;
    this.uniforms.uTime.value = time;
    this.compositeMaterial.uniforms.uTime.value = time;

    this.ink.loop();
    this.stars.loop();
    this.media.loop();

    /* 1 — world into an offscreen target. */
    this.renderer.setRenderTarget(this.sceneRT);
    this.renderer.clear();
    this.renderer.render(this.scene, this.camera);

    /* 2 — composite to the canvas with ink, grain and vignette. */
    this.renderer.setRenderTarget(null);
    this.compositeMaterial.uniforms.tScene.value = this.sceneRT.texture;
    this.compositeMaterial.uniforms.tInk.value = this.ink.texture;
    this.renderer.render(this.quadScene, this.quadCamera);
  }

  destroy() {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerleave', this.onLeave);
    this.media.destroy();
    this.stars.destroy();
    this.ink.destroy();
    this.sceneRT.dispose();
    this.renderer.dispose();
  }
}
