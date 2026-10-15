import {
  Points, Mesh, PlaneGeometry, BufferGeometry, BufferAttribute,
  ShaderMaterial, AdditiveBlending, Color, Vector2,
  WebGLRenderTarget, HalfFloatType, RGBAFormat, LinearFilter, NoColorSpace,
  Scene, OrthographicCamera
} from 'three';
import store from '../core/Store.js';

import vertexShader from './shaders/stars.vert';
import fragmentShader from './shaders/stars.frag';
import skyVertex from './shaders/quad.vert';
import skyFragment from './shaders/sky.frag';
import nebulaFragment from './shaders/nebula.frag';

/* The band's clouds are drawn into their own small image (nebula.frag):
   at this share of the screen's CSS size, redrawn every NEBULA_EVERY
   frames. Drawn into every pixel of every frame instead, they were most
   of the frame on a laptop's GPU (≈17 ms of it on an Iris Xe, measured —
   the whole of a 60 fps frame). The image covers NEBULA_SPAN of the
   screen, so the pointer's parallax only shifts it. */
const NEBULA_SCALE = 0.5;
const NEBULA_EVERY = 4;
const NEBULA_SPAN = 1.05;

/* The galaxy's band runs up and to the right across the screen. Stars are
   placed in the same height-normalised screen space the sky shader uses,
   so the dense star lane and the nebula glow line up. */
const BAND_DIR = new Vector2(1, 0.45).normalize();
const BAND_WIDTH = 0.2;
/* Share of stars packed into the band rather than spread evenly. */
const BAND_SHARE = 0.55;

/* Star tints — mostly white, with a faint cool or warm cast on a few. */
const TINTS = [
  { c: new Color('#F2F2F0'), w: 0.70 },
  { c: new Color('#DCE3F2'), w: 0.18 },
  { c: new Color('#F2E8D8'), w: 0.12 }
];

const gauss = () => {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

const pickTint = () => {
  let r = Math.random();
  for (const t of TINTS) { if ((r -= t.w) <= 0) return t.c; }
  return TINTS[0].c;
};

/** Space backdrop: nebula band, twinkling dust, glitter stars, shooting stars. */
export default class Stars {
  constructor(world) {
    this.world = world;
    this.pointer = new Vector2();

    this.createSky();
    this.createPoints();
    this.resize();
  }

  /* ------------------------------------------------------------- sky */

  createSky() {
    /* The clouds, into their own small image (see NEBULA_SCALE). */
    this.nebulaRT = new WebGLRenderTarget(1, 1, {
      type: HalfFloatType,
      format: RGBAFormat,
      minFilter: LinearFilter,
      magFilter: LinearFilter,
      depthBuffer: false,
      stencilBuffer: false
    });
    this.nebulaRT.texture.colorSpace = NoColorSpace;
    this.nebulaMaterial = new ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: nebulaFragment,
      depthTest: false,
      depthWrite: false,
      defines: { OCTAVES: store.isMobile ? 3 : 5 },
      uniforms: {
        uTime:     this.world.uniforms.uTime,
        uRes:      this.world.uniforms.uRes,
        uSpan:     { value: NEBULA_SPAN },
        uBandDir:  { value: BAND_DIR },
        uBandWidth:{ value: BAND_WIDTH },
        /* Neutral greys — a black sky with a faint milky band, no tint. */
        uBand:     { value: new Color('#9A9CA3') },
        uHaze:     { value: new Color('#C9CACF') }
      }
    });
    const quad = new Mesh(new PlaneGeometry(2, 2), this.nebulaMaterial);
    quad.frustumCulled = false;
    this.nebulaScene = new Scene();
    this.nebulaScene.add(quad);
    this.nebulaCamera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.nebulaFrame = 0;
    this.nebulaDirty = true;

    /* The sky itself, every frame: the clouds looked up from their image,
       and the shooting stars, at full resolution. */
    this.skyMaterial = new ShaderMaterial({
      vertexShader: skyVertex,
      fragmentShader: skyFragment,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        tNebula:   { value: this.nebulaRT.texture },
        uSpan:     { value: NEBULA_SPAN },
        uTime:     this.world.uniforms.uTime,
        uIntro:    this.world.uniforms.uIntro,
        uRes:      this.world.uniforms.uRes,
        uDpr:      this.world.uniforms.uDpr,
        uPointer:  { value: this.pointer }
      }
    });
    this.sky = new Mesh(new PlaneGeometry(2, 2), this.skyMaterial);
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -10;
    this.world.scene.add(this.sky);
  }

  /* ----------------------------------------------------------- stars */

  createPoints() {
    const dust = store.isMobile ? 1100 : 3000;
    const bright = store.isMobile ? 45 : 110;
    const count = dust + bright;

    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const seeds = new Float32Array(count);
    const kinds = new Float32Array(count);
    const perp = new Vector2(-BAND_DIR.y, BAND_DIR.x);

    for (let i = 0; i < count; i++) {
      const isBright = i >= dust;

      /* Screen position, height-normalised, with room for parallax. */
      let x, y;
      if (Math.random() < BAND_SHARE) {
        const along = (Math.random() - 0.5) * 3.2;
        const across = gauss() * BAND_WIDTH * 0.55;
        x = BAND_DIR.x * along + perp.x * across;
        y = BAND_DIR.y * along + perp.y * across;
      } else {
        x = (Math.random() - 0.5) * 2.6;
        y = (Math.random() - 0.5) * 1.3;
      }

      /* Push back in depth, scaled so the star lands at (x, y) on screen. */
      const z = -1200 - Math.random() * 5200;
      const depthScale = (this.world.perspective - z) / this.world.perspective;

      positions[i * 3 + 0] = x * depthScale;
      positions[i * 3 + 1] = y * depthScale;
      positions[i * 3 + 2] = z;

      const tint = pickTint();
      colors[i * 3 + 0] = tint.r;
      colors[i * 3 + 1] = tint.g;
      colors[i * 3 + 2] = tint.b;

      /* Pixel size of the star's core. Most dust is tiny; a few stand out. */
      scales[i] = isBright
        ? 1.4 + Math.random() * 1.6
        : 0.7 + Math.pow(Math.random(), 3) * 1.8;
      seeds[i] = Math.random();
      kinds[i] = isBright ? 1 : 0;
    }

    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(positions, 3));
    this.geometry.setAttribute('aColor', new BufferAttribute(colors, 3));
    this.geometry.setAttribute('aScale', new BufferAttribute(scales, 1));
    this.geometry.setAttribute('aSeed', new BufferAttribute(seeds, 1));
    this.geometry.setAttribute('aKind', new BufferAttribute(kinds, 1));

    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uTime:  this.world.uniforms.uTime,
        uIntro: this.world.uniforms.uIntro,
        uDpr:   this.world.uniforms.uDpr
      }
    });

    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 0;
    this.world.scene.add(this.points);
  }

  /** Positions are in screen heights — scale them into world pixels. */
  resize() {
    this.points?.scale.set(store.height, store.height, 1);
    const k = NEBULA_SCALE * NEBULA_SPAN;
    this.nebulaRT.setSize(Math.max(1, Math.round(store.width * k)), Math.max(1, Math.round(store.height * k)));
    this.nebulaDirty = true;
  }

  /** The clouds, into their image (World.loop calls loop() before it draws the frame). */
  drawNebula() {
    const r = this.world.renderer;
    const target = r.getRenderTarget();
    r.setRenderTarget(this.nebulaRT);
    r.render(this.nebulaScene, this.nebulaCamera);
    r.setRenderTarget(target);
    this.nebulaDirty = false;
  }

  loop() {
    /* Gentle parallax against the pointer — the far stars move least. */
    const k = 0.02;
    this.points.position.x += (store.mouse.x * -60 - this.points.position.x) * k;
    this.points.position.y += (store.mouse.y * -40 - this.points.position.y) * k;
    this.pointer.x += (store.mouse.x - this.pointer.x) * k;
    this.pointer.y += (store.mouse.y - this.pointer.y) * k;
    /* The clouds drift too slowly for every frame to differ. */
    this.nebulaFrame = (this.nebulaFrame + 1) % NEBULA_EVERY;
    if (this.nebulaDirty || this.nebulaFrame === 0) this.drawNebula();
  }

  destroy() {
    this.world.scene.remove(this.points);
    this.world.scene.remove(this.sky);
    this.geometry.dispose();
    this.material.dispose();
    this.sky.geometry.dispose();
    this.skyMaterial.dispose();
    this.nebulaScene.children[0].geometry.dispose();
    this.nebulaMaterial.dispose();
    this.nebulaRT.dispose();
  }
}
