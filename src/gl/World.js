import {
  WebGLRenderer, Scene, PerspectiveCamera, OrthographicCamera,
  WebGLRenderTarget, PlaneGeometry, Mesh, ShaderMaterial,
  Vector2, Color, HalfFloatType, RGBAFormat,
  LinearFilter, NoColorSpace, SRGBColorSpace, LinearSRGBColorSpace
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
      /* 1 = the galaxy is out; 0 = hidden (light theme). */
      uSpace:      { value: 1 },
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
   * Light theme: fade the galaxy out and clear to paper; dark: bring the
   * night back. The paper colour is given as raw output values so the
   * canvas matches the page's CSS background exactly.
   */
  setTheme(light, immediate = false) {
    const d = immediate ? 0 : 1.1;
    const target = light ? new Color().setRGB(0xef / 255, 0xed / 255, 0xe6 / 255, LinearSRGBColorSpace) : PALETTE.bg;
    this.clear ||= PALETTE.bg.clone();
    const apply = () => {
      this.renderer.setClearColor(this.clear, 1);
      this.compositeMaterial.uniforms.uBg.value.copy(this.clear);
    };
    gsap.to(this.uniforms.uSpace, { value: light ? 0 : 1, duration: d, ease: 'power2.inOut', overwrite: 'auto' });
    gsap.to(this.compositeMaterial.uniforms.uVignette, { value: light ? 0.12 : 0.65, duration: d, ease: 'power2.inOut', overwrite: 'auto' });
    gsap.to(this.clear, { r: target.r, g: target.g, b: target.b, duration: d, ease: 'power2.inOut', overwrite: 'auto', onUpdate: apply, onComplete: apply });
    if (immediate) { this.clear.copy(target); apply(); }
  }

  reveal() {
    gsap.to(this.canvas, { opacity: 1, duration: 1.2, ease: 'power2.out' });
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
