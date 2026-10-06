import {
  WebGLRenderer, Scene, PerspectiveCamera, AmbientLight, DirectionalLight, Mesh, Vector3
} from 'three';
import gsap from 'gsap';
import { makeAsteroid, rockMaterial } from './asteroid.js';
import { rand } from './particles.js';

/* Camera distance chosen so one world unit is one CSS pixel at z = 0. */
const PERSPECTIVE = 1000;
const GRAVITY = 1500;

/**
 * A transparent WebGL layer above the page for the thrown space rock and
 * the fragments it breaks into. The rock is a real lit 3D asteroid, so it
 * tumbles and catches the light like one. Renders only while something
 * is in the air.
 */
export default class RockStage {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'rock-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    document.body.appendChild(this.canvas);

    this.renderer = new WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);

    this.scene = new Scene();
    this.camera = new PerspectiveCamera(45, 1, 10, 4000);
    this.camera.position.z = PERSPECTIVE;

    /* Hard sunlight from the upper left, a faint cool bounce, and a rim
       light tinted with the thrower's neon from behind. */
    this.scene.add(new AmbientLight(0xffffff, 0.09));
    const key = new DirectionalLight(0xfff1e0, 4.2);
    key.position.set(-0.85, 0.6, 0.42);
    const fill = new DirectionalLight(0x9fb6ff, 0.22);
    fill.position.set(0.7, -0.4, 0.45);
    this.rim = new DirectionalLight(0xffffff, 1.4);
    this.rim.position.set(0.45, 0.15, -1);
    this.scene.add(key, fill, this.rim);

    /* Built once and shared: one detailed hero rock, a handful of chunk shapes. */
    this.rockGeo = makeAsteroid({ seed: 7, detail: 5, craters: 13 });
    this.rockMat = rockMaterial(false, { bump: 1.4, seed: 3.7 });
    this.chunkGeos = Array.from({ length: 8 }, (_, i) => makeAsteroid({ seed: 101 + i * 13, detail: 1, chunk: true, rough: 1.5 }));
    this.chunkMat = rockMaterial(true, { bump: 1.1, seed: 9.1 });

    this.chunks = [];
    this.flying = new Set();
    /* Anything else that needs frames drawn (e.g. the scattered fragments) holds the stage open. */
    this.holders = new Set();
    this.running = false;
    this.resize();
  }

  resize() {
    this.w = window.innerWidth;
    this.h = window.innerHeight;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(this.w, this.h, false);
    this.camera.fov = (2 * Math.atan(this.h / 2 / PERSPECTIVE) * 180) / Math.PI;
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
  }

  /** Viewport px → world. */
  at(x, y, z = 0) { return new Vector3(x - this.w / 2, this.h / 2 - y, z); }

  /**
   * A rock for a throw. The caller places it every frame; `burst` swaps it
   * for flying fragments. Pass `geo` / `rot` to throw a particular rock
   * (one of the floating ones) in the pose it was last seen in.
   */
  rock(radius, tint, { geo = this.rockGeo, rot = null, seed = 3.7 } = {}) {
    const mesh = new Mesh(geo, this.rockMat);
    this.rockMat.userData.rock.uSeed.value = seed;
    if (rot) mesh.rotation.set(rot.x, rot.y, rot.z);
    else mesh.rotation.set(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28));
    mesh.scale.setScalar(0.001);
    this.rim.color.setRGB(tint[0] / 255, tint[1] / 255, tint[2] / 255);
    this.scene.add(mesh);
    this.flying.add(mesh);
    this.start();

    const spin = new Vector3(rand(-4, 4), rand(-6, 6), rand(-3, 3));

    return {
      place: (x, y, dt, grow = 1) => {
        mesh.position.copy(this.at(x, y, 30));
        mesh.rotation.x += spin.x * dt;
        mesh.rotation.y += spin.y * dt;
        mesh.rotation.z += spin.z * dt;
        mesh.scale.setScalar(radius * grow);
      },
      burst: (x, y, dir) => {
        this.drop(mesh);
        this.burst(x, y, dir, radius);
      },
      remove: () => this.drop(mesh)
    };
  }

  drop(mesh) {
    this.scene.remove(mesh);
    this.flying.delete(mesh);
  }

  /**
   * Shatter: chunks of rock thrown out from the point of impact, mostly
   * back towards the thrower and up, tumbling under gravity.
   */
  burst(x, y, dir, radius) {
    const origin = this.at(x, y, 30);
    const back = new Vector3(-dir.x, dir.y, 0); // screen → world (y flips)
    const n = Math.round(rand(14, 19));
    for (let i = 0; i < n; i++) {
      const geo = this.chunkGeos[i % this.chunkGeos.length];
      const mesh = new Mesh(geo, this.chunkMat);
      const out = new Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      const size = radius * (i < 3 ? rand(0.4, 0.58) : rand(0.16, 0.38));
      mesh.position.copy(origin).addScaledVector(out, radius * rand(0.1, 0.6));
      mesh.rotation.set(rand(0, 6.28), rand(0, 6.28), rand(0, 6.28));
      mesh.scale.setScalar(size);
      this.scene.add(mesh);

      const speed = rand(140, 460) * (size < radius * 0.3 ? 1.35 : 1);
      const vel = out.clone().multiplyScalar(speed)
        .addScaledVector(back, rand(90, 280))
        .add(new Vector3(0, rand(80, 260), 0));
      vel.z = rand(-120, 160);

      this.chunks.push({
        mesh, vel, size,
        spin: new Vector3(rand(-12, 12), rand(-12, 12), rand(-12, 12)),
        life: 0, max: rand(1.1, 1.9)
      });
    }
    this.start();
  }

  /** Keep rendering while `on` — for effects that own their own meshes. */
  keep(id, on) {
    if (on) {
      this.holders.add(id);
      this.start();
    } else {
      this.holders.delete(id);
    }
  }

  start() {
    if (this.running) return;
    this.running = true;
    gsap.ticker.add(this.tick);
  }

  tick = (time, deltaMs) => {
    const dt = Math.min(deltaMs / 1000, 1 / 30);

    this.chunks = this.chunks.filter((c) => {
      c.life += dt;
      const k = c.life / c.max;
      c.vel.y -= GRAVITY * dt;
      c.vel.multiplyScalar(1 - 0.35 * dt);
      c.mesh.position.addScaledVector(c.vel, dt);
      c.mesh.rotation.x += c.spin.x * dt;
      c.mesh.rotation.y += c.spin.y * dt;
      c.mesh.rotation.z += c.spin.z * dt;
      /* Shrink away at the very end rather than popping out. */
      c.mesh.scale.setScalar(c.size * (k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1));
      const gone = k >= 1 || c.mesh.position.y < -this.h / 2 - 80;
      if (gone) this.scene.remove(c.mesh);
      return !gone;
    });

    this.renderer.render(this.scene, this.camera);

    if (!this.chunks.length && !this.flying.size && !this.holders.size) {
      this.renderer.clear();
      gsap.ticker.remove(this.tick);
      this.running = false;
    }
  };

  destroy() {
    gsap.ticker.remove(this.tick);
    this.rockGeo.dispose();
    this.chunkGeos.forEach((g) => g.dispose());
    this.rockMat.dispose();
    this.chunkMat.dispose();
    this.renderer.dispose();
    this.canvas.remove();
  }
}
