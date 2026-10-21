import {
  WebGLRenderer, Scene, PerspectiveCamera, AmbientLight, DirectionalLight, Mesh, Vector3
} from 'three';
import gsap from 'gsap';
import { makeAsteroid, prebuildAsteroids, rockMaterial } from './asteroid.js';
import { rand } from './particles.js';
import store from '../core/Store.js';
import gpu from '../core/gpu.js';
import { pacer } from '../core/pace.js';

/* The last page's offscreen renderer and material, kept when it goes (as
   RockStage keeps its own), so coming back doesn't build them again. */
let kept = null;

/* Each floating rock's shape, by its place in the row. */
const shape = (i) => ({ seed: 31 + i * 17, detail: 5, craters: 12 + i * 2 });

/**
 * The four free-floating space rocks around the sketches. Each is a real
 * 3D asteroid, slowly tumbling, drawn into its button's own canvas by one
 * shared offscreen renderer. Hovering spins a rock up. Only runs while
 * the rocks are on screen.
 */
export default class SpaceRocks {
  /** Build the shapes of the first `n` rocks while nothing else is going on. */
  static prepare(n) { prebuildAsteroids(Array.from({ length: n }, (_, i) => shape(i))); }

  constructor(buttons) {
    this.items = buttons.map((btn, i) => ({
      btn,
      i,
      canvas: btn.querySelector('.duo-action-rock'),
      geo: makeAsteroid(shape(i)),
      rot: new Vector3(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28)),
      spin: new Vector3(rand(0.15, 0.35), rand(0.3, 0.6), rand(-0.15, 0.15)),
      boost: 0,
      hovered: false
    })).filter((it) => it.canvas);
    /* (Each one's place in the strip they're drawn in: tick.) */
    this.items.forEach((it, k) => { it.slot = k; });
    /* 0 → 1 as the rocks rush into each other: they spin up hard. */
    this.frenzy = 0;
    this.pace = pacer();

    kept?.claim();
    const reuse = kept && !kept.renderer.getContext().isContextLost();
    if (reuse) {
      ({ renderer: this.renderer, material: this.material, untrack: this.untrack } = kept);
    } else {
      if (kept) SpaceRocks.release(kept);
      this.renderer = gpu.lean(new WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' }));
      this.renderer.setClearColor(0x000000, 0);
      this.material = rockMaterial(false, { bump: 1.2 });
      /* (three.js takes a lost context back by itself; meanwhile the rocks
         just hold their last frame.) */
      this.untrack = gpu.track('floating rocks (SpaceRocks)', this.renderer.domElement);
    }
    kept = null;
    this.gl = this.renderer.getContext();
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(28, 1, 0.1, 50);
    this.camera.position.z = 4.4;

    /* Low raking sunlight so the craters read, a cool rim from behind. */
    this.scene.add(new AmbientLight(0xffffff, 0.1));
    const key = new DirectionalLight(0xfff1e0, 4.2);
    key.position.set(-0.85, 0.6, 0.45);
    const rim = new DirectionalLight(0xa9c4ff, 1.5);
    rim.position.set(0.7, -0.2, -0.8);
    this.scene.add(key, rim);

    this.mesh = new Mesh(this.items[0]?.geo, this.material);
    this.scene.add(this.mesh);

    /* The rock shader, built before the first frame — in the background,
       where the browser can (compileAsync). Left to the first draw, it was
       built there and then, holding up the GPU for a third of a second
       (measured, on a laptop; longer on a phone) — while the loading
       screen was still animating, which froze for it. Until it's ready
       the rocks aren't drawn. (A renderer kept from the last visit has it
       built already.) */
    this.ready = !!reuse;
    if (!reuse) {
      const done = () => { this.ready = true; };
      try {
        const p = this.renderer.compileAsync?.(this.scene, this.camera);
        if (p) p.then(done, done);
        else done();
      } catch {
        done();
      }
    }

    this.handlers = this.items.map((it) => {
      const on = () => { it.hovered = true; };
      const off = () => { it.hovered = false; };
      it.btn.addEventListener('pointerenter', on);
      it.btn.addEventListener('pointerleave', off);
      it.btn.addEventListener('focus', on);
      it.btn.addEventListener('blur', off);
      return () => {
        it.btn.removeEventListener('pointerenter', on);
        it.btn.removeEventListener('pointerleave', off);
        it.btn.removeEventListener('focus', on);
        it.btn.removeEventListener('blur', off);
      };
    });

    this.resize();

    this.io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) gsap.ticker.add(this.tick);
      else gsap.ticker.remove(this.tick);
    });
    const host = this.items[0]?.btn.closest('[data-duo]');
    if (host) this.io.observe(host);
  }

  /** The shape, current pose and surface seed of a rock — so the same rock can be thrown. */
  pose(btn) {
    const it = this.items.find((x) => x.btn === btn);
    return it ? { geo: it.geo, rot: it.rot.clone(), seed: it.i * 4.3 } : {};
  }

  resize() {
    const c = this.items[0]?.canvas;
    if (!c) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.size = Math.max(1, Math.round(c.offsetWidth * dpr));
    /* All the rocks side by side in one strip (tick). (Only when it
       changes: resizing reallocates the drawing buffer.) */
    const el = this.renderer.domElement;
    const w = this.size * this.items.length;
    if (this.renderer.getPixelRatio() !== 1 || el.width !== w || el.height !== this.size) {
      this.renderer.setPixelRatio(1);
      this.renderer.setSize(w, this.size, false);
    }
    this.items.forEach((it) => {
      it.canvas.width = this.size;
      it.canvas.height = this.size;
      it.ctx = it.canvas.getContext('2d');
    });
  }

  tick = (time, deltaMs) => {
    /* (Under the open phone menu: unseen.) */
    if (store.covered) return;
    /* (Context lost: each rock holds its last frame until it's back. Its
       shader still being built: not drawn yet — see the constructor.) */
    if (this.gl.isContextLost() || !this.ready) return;
    const dt = Math.min(deltaMs / 1000, 1 / 30);
    for (const it of this.items) {
      it.boost += ((it.hovered ? 1 : 0) - it.boost) * Math.min(1, dt * 4);
      const speed = 1 + it.boost * 4 + this.frenzy * 16;
      it.rot.addScaledVector(it.spin, dt * speed);
    }
    /* (Drawn at a steady 60 fps on a phone with a faster screen: core/pace.js.) */
    if (!this.pace(deltaMs)) return;
    /* Every rock, every frame — a tumble redrawn every other frame
       juddered — all drawn side by side into one strip, then each copied
       out to its own button. Copying out of the renderer makes the CPU
       wait for the GPU to finish: once a frame like this, not once per
       rock as when each was drawn and copied in turn. */
    const r = this.renderer;
    const n = this.size;
    r.autoClear = false;
    r.setScissorTest(false);
    r.clear();
    r.setScissorTest(true);
    for (const it of this.items) {
      this.mesh.geometry = it.geo;
      this.material.userData.rock.uSeed.value = it.i * 4.3;
      this.mesh.rotation.set(it.rot.x, it.rot.y, it.rot.z);
      r.setViewport(it.slot * n, 0, n, n);
      r.setScissor(it.slot * n, 0, n, n);
      r.render(this.scene, this.camera);
    }
    r.setScissorTest(false);
    const strip = r.domElement;
    for (const it of this.items) {
      it.ctx.clearRect(0, 0, n, n);
      it.ctx.drawImage(strip, it.slot * n, 0, n, n, 0, 0, n, n);
    }
  };

  destroy() {
    gsap.ticker.remove(this.tick);
    this.io.disconnect();
    this.handlers.forEach((off) => off());
    const parts = { renderer: this.renderer, material: this.material, untrack: this.untrack };
    if (!kept && !this.renderer.getContext().isContextLost()) {
      kept = parts;
      /* (On a phone, let go if the next page doesn't take it up: gpu.js.) */
      parts.claim = gpu.keep(() => {
        if (kept !== parts) return;
        kept = null;
        SpaceRocks.release(parts);
      });
      return;
    }
    this.items.forEach((it) => it.geo.dispose());
    SpaceRocks.release(parts);
  }

  static release({ renderer, material, untrack }) {
    material.dispose();
    untrack?.();
    gpu.release(renderer);
  }
}
