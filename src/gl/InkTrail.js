import {
  WebGLRenderTarget, ShaderMaterial, Mesh, PlaneGeometry, Scene,
  OrthographicCamera, Vector2, HalfFloatType, RGBAFormat, LinearFilter,
  NoColorSpace, ClampToEdgeWrapping
} from 'three';
import store from '../core/Store.js';

import quadVert from './shaders/quad.vert';
import inkFrag from './shaders/ink.frag';

/**
 * Ping-pong ink trail. Half resolution — the effect is low frequency,
 * so full res buys nothing but fill cost.
 */
export default class InkTrail {
  constructor(world) {
    this.world = world;
    this.renderer = world.renderer;

    this.mouse = new Vector2(0.5, 0.5);
    this.target = new Vector2(0.5, 0.5);
    this.prev = new Vector2(0.5, 0.5);
    this.active = 0;
    this.seeded = false;

    this.createTargets();

    this.material = new ShaderMaterial({
      vertexShader: quadVert,
      fragmentShader: inkFrag,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        tPrev:      { value: null },
        uRes:       { value: new Vector2(this.width, this.height) },
        uMouse:     { value: new Vector2(0.5, 0.5) },
        uPrevMouse: { value: new Vector2(0.5, 0.5) },
        uAspect:    { value: store.aspect },
        uRadius:    { value: 0.115 },
        uStrength:  { value: 0.62 },
        uDecay:     { value: 0.974 },
        uDiffuse:   { value: 0.20 },
        uActive:    { value: 0 }
      }
    });

    this.quad = new Mesh(new PlaneGeometry(2, 2), this.material);
    this.quad.frustumCulled = false;
    this.scene = new Scene();
    this.scene.add(this.quad);
    this.camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }

  get texture() { return this.read.texture; }

  createTargets() {
    const cap = store.isMobile ? 512 : 1024;
    const scale = 0.5;
    this.width = Math.min(Math.floor(store.width * store.dpr * scale), cap);
    this.height = Math.max(
      1,
      Math.floor(this.width * (store.height / store.width))
    );

    const opts = {
      type: HalfFloatType,
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      wrapS: ClampToEdgeWrapping,
      wrapT: ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false
    };

    this.read  = new WebGLRenderTarget(this.width, this.height, opts);
    this.write = new WebGLRenderTarget(this.width, this.height, opts);
    this.read.texture.colorSpace = NoColorSpace;
    this.write.texture.colorSpace = NoColorSpace;
  }

  setPointer(x, y) {
    this.target.set(x, y);
    if (!this.seeded) {
      this.mouse.copy(this.target);
      this.prev.copy(this.target);
      this.seeded = true;
    }
    this.active = 1;
  }

  release() { this.active = 0; }

  resize() {
    this.read.dispose();
    this.write.dispose();
    this.createTargets();
    this.material.uniforms.uRes.value.set(this.width, this.height);
    this.material.uniforms.uAspect.value = store.aspect;
  }

  loop() {
    this.prev.copy(this.mouse);
    /* Lag the pointer slightly so the stroke has weight. */
    this.mouse.lerp(this.target, 0.22);

    const travelled = this.mouse.distanceTo(this.prev);
    /* Fade the splat out when the pointer stops moving. */
    const moving = Math.min(travelled * 90, 1);
    this.active += ((this.active > 0 ? moving : 0) - this.active) * 0.25;

    const u = this.material.uniforms;
    u.tPrev.value = this.read.texture;
    u.uMouse.value.copy(this.mouse);
    u.uPrevMouse.value.copy(this.prev);
    u.uActive.value = this.active * (store.isTouch ? 0.6 : 1);

    this.renderer.setRenderTarget(this.write);
    this.renderer.render(this.scene, this.camera);
    this.renderer.setRenderTarget(null);

    const t = this.read;
    this.read = this.write;
    this.write = t;
  }

  destroy() {
    this.read.dispose();
    this.write.dispose();
    this.material.dispose();
    this.quad.geometry.dispose();
  }
}
