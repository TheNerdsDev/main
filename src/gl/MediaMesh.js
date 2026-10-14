import { Mesh, ShaderMaterial, Vector2, DoubleSide } from 'three';
import gsap from 'gsap';
import store from '../core/Store.js';
import assets from '../core/Assets.js';
import Component from '../core/Component.js';

import vertexShader from './shaders/media.vert';
import fragmentShader from './shaders/media.frag';

/* A work page card under the pointer grows by this much (and comes forward,
   over its neighbours) — on top of the picture's own hover zoom. */
const HOVER_GROW = 0.06;

/** One WebGL plane locked to one DOM element. */
export default class MediaMesh extends Component {
  constructor({
    el, world, geometry,
    colour = 0, index = -1,
    floats = false,
    fixed = false, isPreview = false,
    depth = 0, stack = null,
    parent = null
  }) {
    super({ el });

    this.world = world;
    this.index = index;
    this.img = el.querySelector('.media');
    this.src = this.img?.getAttribute('src');

    this.floats = floats && !store.reducedMotion;
    this.fixed = fixed;
    this.isPreview = isPreview;
    this.depth = depth;
    /* A photo of us (`data-still`) doesn't react to the pointer: no hover
       zoom or colour change, and the cursor's trail passes it by (the
       composite keeps it off too — Media.loop). */
    this.still = el.hasAttribute('data-still');
    /* Index into `store.stack` — the work page drives this card's
       position, scale, tilt, fade and blur directly, so its DOM box is
       never re-read while scrolling. */
    this.stack = stack;
    /* Its hover growth, 0..1 (stack cards only). */
    this.grow = { value: 0 };

    /* Offset each card's drift so the group never moves in lockstep. */
    this.phase = index * 1.7;
    this.floatX = 0; this.floatY = 0;
    this.floatRotX = 0; this.floatRotY = 0; this.floatRotZ = 0;

    /* Re-measure now that `fixed` is known — the base class ran before it was set. */
    this.getBounds();

    this.uniforms = {
      tMap:        { value: null },
      tInk:        world.uniforms.tInk,
      uSizes:      { value: new Vector2(1, 1) },
      uPlaneSizes: { value: new Vector2(this.bounds.width, this.bounds.height) },
      uRes:        world.uniforms.uRes,
      uDpr:        world.uniforms.uDpr,
      uTime:       world.uniforms.uTime,
      uInkAmount:  this.still ? { value: 0 } : world.uniforms.uInkAmount,

      uHover:      { value: 0 },
      uLoad:       { value: 0 },
      uEnter:      { value: 0 },
      uColour:     { value: colour },
      uGrain:      { value: 0.045 },
      uOpacity:    { value: 1 },
      uBlur:       { value: 0 },
      /* The work page's stack: a brighter black and white, so the cards
         read clearly against the dark (the rest keep the deeper grade). */
      uLift:       { value: stack === null ? 0 : 0.55 }
    };

    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      side: DoubleSide
    });

    this.mesh = new Mesh(geometry, this.material);
    this.mesh.frustumCulled = false;
    /* Previews sit above the cards; cards stack back-to-front by index. */
    this.mesh.renderOrder = isPreview ? 60 : 10 + Math.max(index, 0);
    (parent || world.scene).add(this.mesh);
    this.parent = parent || world.scene;

    this.updateTransform();
    this.loadTexture();
  }

  /* ---------------------------------------------------------- bounds */

  /** A fixed element's box is already viewport-relative, so scroll is not added. */
  getBounds() {
    if (!this.el) return;
    const r = this.el.getBoundingClientRect();
    this.bounds = {
      top: this.fixed ? r.top : r.top + store.scroll,
      left: r.left,
      width: r.width,
      height: r.height
    };
    return this.bounds;
  }

  checkVisible(margin = 300) {
    if (this.fixed) { this.isVisible = true; return true; }
    return super.checkVisible(margin);
  }

  /* --------------------------------------------------------- texture */

  async loadTexture() {
    if (!this.src) return;
    const entry = await assets.load(this.src, { srgb: true });
    if (this.destroyed || !entry) return;

    this.uniforms.tMap.value = entry.texture;
    this.uniforms.uSizes.value.set(entry.width, entry.height);

    gsap.to(this.uniforms.uLoad, {
      value: 1, duration: 1.3, ease: 'power2.out', overwrite: 'auto'
    });
  }

  /* ----------------------------------------------------------- hover */

  setHover(on) {
    if (this.still) return;
    const tween = {
      value: on ? 1 : 0,
      duration: on ? 1.4 : 0.9,
      ease: on ? 'expo.out' : 'power3.out',
      overwrite: 'auto'
    };
    gsap.to(this.uniforms.uHover, tween);
    if (this.stack !== null) gsap.to(this.grow, tween);
  }

  /* ------------------------------------------------------- transform */

  /** The live stack state for this card, or null when it lays out from the DOM. */
  get stackState() {
    return this.stack === null ? null : store.stack?.[this.stack] || null;
  }

  updateTransform() {
    const s = this.stackState;
    if (s) return this.updateStackTransform(s);

    const { width, height, left, top } = this.bounds;
    const screenTop = this.fixed ? top : top - store.scroll;

    this.mesh.scale.set(width, height, 1);
    this.uniforms.uPlaneSizes.value.set(width, height);

    const x = left - store.width / 2 + width / 2 + this.floatX;
    const y = -screenTop + store.height / 2 - height / 2 + this.floatY;

    this.mesh.position.set(x, y, this.depth);
    this.mesh.rotation.set(this.floatRotX, this.floatRotY, this.floatRotZ);
  }

  /**
   * Where this plane is on screen, as the composite pass sees it (0..1,
   * from the bottom left): x0, y0, x1, y1 into `out`.
   */
  screenRect(out) {
    const { width, height, left, top } = this.bounds;
    const screenTop = this.fixed ? top : top - store.scroll;
    return out.set(
      left / store.width,
      1 - (screenTop + height) / store.height,
      (left + width) / store.width,
      1 - screenTop / store.height
    );
  }

  /** Stack cards: centre, size and colour come straight from the shared state. */
  updateStackTransform(s) {
    const grow = this.grow.value;
    const k = s.scale * (1 + HOVER_GROW * grow);
    const width = s.w * k;
    const height = s.h * k;

    this.mesh.scale.set(width, height, 1);
    this.uniforms.uPlaneSizes.value.set(width, height);

    this.mesh.position.set(s.cx - store.width / 2, store.height / 2 - s.cy, this.depth);
    this.mesh.rotation.set(s.rotX, s.rotY, s.rotZ);
    /* Grown, it draws over its neighbours (still under the previews, 60). */
    this.mesh.renderOrder = s.order + (grow > 0.001 ? 9 : 0);

    this.uniforms.uOpacity.value = s.opacity;
    this.uniforms.uBlur.value = s.blur;
    this.uniforms.uColour.value = s.colour;
  }

  /* ------------------------------------------------------ transitions */

  enter(delay = 0) {
    gsap.to(this.uniforms.uEnter, {
      value: 1, duration: 1.4, delay, ease: 'power3.out', overwrite: 'auto'
    });
  }

  leave() {
    /* Its entrance first, the not-yet-started (staggered, delayed) part
       included: starting later, that would override this, and an
       overridden tween never completes — the page change awaiting it
       would wait forever. */
    gsap.killTweensOf(this.uniforms.uEnter);
    return gsap.to(this.uniforms.uEnter, {
      value: 0, duration: 0.5, ease: 'power2.in'
    });
  }

  /** Previews fade independently of the page-enter stagger. */
  toggle(show) {
    gsap.to(this.uniforms.uEnter, {
      value: show ? 1 : 0,
      duration: show ? 0.7 : 0.4,
      ease: show ? 'power3.out' : 'power2.in',
      overwrite: 'auto'
    });
  }

  /* ------------------------------------------------------------ loop */

  resize() {
    this.getBounds();
    this.updateTransform();
  }

  loop() {
    const s = this.stackState;
    if (s) {
      /* Faded out or off screen — skip the draw entirely. */
      const half = (s.h * s.scale) / 2 + 120;
      this.isVisible = s.opacity > 0.004 && s.cy + half > 0 && s.cy - half < store.height;
    } else {
      /* Drifting planes reach past their DOM box — cull generously. */
      this.checkVisible(700);
    }
    this.mesh.visible = this.isVisible;
    if (!this.isVisible) return;

    if (this.floats) {
      const t = store.time + this.phase;
      this.floatY     = Math.sin(t * 0.55) * 15;
      this.floatX     = Math.cos(t * 0.41) * 8;
      this.floatRotX  = Math.sin(t * 0.37) * 0.020;
      this.floatRotY  = Math.cos(t * 0.33) * 0.030;
      this.floatRotZ  = Math.sin(t * 0.26) * 0.013;
    }

    this.updateTransform();
  }

  destroy() {
    super.destroy();
    this.parent.remove(this.mesh);
    this.material.dispose();
    gsap.killTweensOf(this.uniforms.uHover);
    gsap.killTweensOf(this.grow);
    gsap.killTweensOf(this.uniforms.uLoad);
    gsap.killTweensOf(this.uniforms.uEnter);
  }
}
