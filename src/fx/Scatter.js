import { Mesh, Vector3 } from 'three';
import { prng } from './asteroid.js';

/* Fragments per rock. */
const PER_ROCK = 11;

/**
 * The four rocks, broken apart. Each rock bursts into fragments that fly
 * out mostly the way that rock was facing, fast at first and slowing as
 * they spread, until the pieces lie scattered across the whole page.
 *
 * Positions are a pure function of progress (and a fixed seed), so the
 * scroll plays the scatter forwards and backwards exactly. Only a slow
 * tumble runs on the clock, so the debris never looks frozen.
 */
export default class Scatter {
  constructor(stage) {
    this.stage = stage;
    const rand = prng(1987);

    this.pieces = [];
    for (let rock = 0; rock < 4; rock++) {
      for (let j = 0; j < PER_ROCK; j++) {
        const mesh = new Mesh(stage.chunkGeos[(rock * PER_ROCK + j) % stage.chunkGeos.length], stage.chunkMat);
        mesh.visible = false;
        stage.scene.add(mesh);
        this.pieces.push({
          mesh,
          rock,
          /* Spread around the rock's own heading, plus a little up/down in depth. */
          wobble: (rand() - 0.5) * 2.2,
          lift: (rand() - 0.5) * 0.9,
          /* How far across the page this piece ends up (× half the diagonal). */
          reach: 0.3 + Math.pow(rand(), 0.7) * 0.85,
          /* The first couple of pieces of each rock are big chunks, the rest grit. */
          size: j < 2 ? 0.48 + rand() * 0.14 : 0.14 + rand() * 0.24,
          z: (rand() - 0.5) * 120,
          rot: new Vector3(rand() * 6.28, rand() * 6.28, rand() * 6.28),
          spin: new Vector3(rand() * 10 - 5, rand() * 10 - 5, rand() * 10 - 5),
          drift: new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.5)
        });
      }
    }
  }

  /**
   * p        0 → 1: from the instant of contact to fully scattered
   * at       collision point, viewport px
   * dirs     the four rocks' directions from the centre at contact
   * radius   a rock's radius at contact, px
   * offsetY  shift the whole field (it scrolls away with the page)
   */
  update(p, at, dirs, radius, offsetY = 0) {
    const live = p > 0;
    this.stage.keep('scatter', live);
    if (!live) {
      this.pieces.forEach((f) => { f.mesh.visible = false; });
      return;
    }

    const { w, h } = this.stage;
    const half = Math.hypot(w, h) / 2;
    /* A hard burst that bleeds off its speed — like debris in drag. */
    const travel = 1 - Math.pow(1 - p, 3.2);
    const t = performance.now() / 1000;

    for (const f of this.pieces) {
      const d = dirs[f.rock];
      const base = Math.atan2(d.y, d.x) + f.wobble;
      const ox = at.x + d.x * radius * 0.9;
      const oy = at.y + d.y * radius * 0.9;
      const dist = half * f.reach * travel;
      const x = ox + Math.cos(base) * dist;
      const y = oy + Math.sin(base) * dist + offsetY;

      f.mesh.visible = true;
      f.mesh.position.copy(this.stage.at(x, y, 40 + f.z * travel + f.lift * 60 * travel));
      f.mesh.rotation.set(
        f.rot.x + f.spin.x * travel + f.drift.x * t,
        f.rot.y + f.spin.y * travel + f.drift.y * t,
        f.rot.z + f.spin.z * travel + f.drift.z * t
      );
      f.mesh.scale.setScalar(radius * f.size);
    }
  }

  destroy() {
    this.stage.keep('scatter', false);
    this.pieces.forEach((f) => this.stage.scene.remove(f.mesh));
  }
}
