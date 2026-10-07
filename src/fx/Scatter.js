import { Mesh, Vector3 } from 'three';
import { prng } from './asteroid.js';

/* Fragments per rock. */
const PER_ROCK = 11;

/**
 * The four rocks, broken apart. Every fragment starts inside the rock it
 * came from, so at the instant of contact the pieces still sit where the
 * rocks were; then each rock crumbles — grit first, the big chunks a beat
 * later — and the debris carries on the way the rocks were circling,
 * spiralling out clockwise across the page, fast at first and slowing
 * as if in drag.
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
        const big = j < 2;
        const ang = rand() * Math.PI * 2;
        const rad = Math.sqrt(rand()) * (big ? 0.3 : 0.6);
        this.pieces.push({
          mesh,
          rock,
          /* Where in the rock it was (× rock radius). */
          ox: Math.cos(ang) * rad,
          oy: Math.sin(ang) * rad,
          /* Grit breaks loose first; the big chunks hold on a moment longer. */
          delay: big ? 0.05 + rand() * 0.08 : rand() * 0.2,
          /* How far it sweeps round (clockwise) on the way out, and a
             little sideways scatter of its own. */
          turn: 0.45 + rand() * 0.9,
          wobble: (rand() - 0.5) * 0.8,
          lift: (rand() - 0.5) * 0.9,
          /* How far across the page this piece ends up (× half the diagonal). */
          reach: 0.28 + Math.pow(rand(), 0.7) * 0.85,
          size: big ? 0.46 + rand() * 0.14 : 0.13 + rand() * 0.24,
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
   * meet     { at, rocks: [{ x, y, size }] } — the centre and each rock at contact, viewport px
   * radius   a rock's radius at contact, px
   * offsetY  shift the whole field (it scrolls away with the page)
   */
  update(p, meet, radius, offsetY = 0) {
    const live = p > 0;
    this.stage.keep('scatter', live);
    if (!live) {
      this.pieces.forEach((f) => { f.mesh.visible = false; });
      return;
    }

    const { w, h } = this.stage;
    const half = Math.hypot(w, h) / 2;
    const { at, rocks } = meet;
    const t = performance.now() / 1000;

    for (const f of this.pieces) {
      const rock = rocks[f.rock];
      const rr = radius * rock.size;
      const q = Math.min(1, Math.max(0, (p - f.delay) / (1 - f.delay)));
      /* A hard start that bleeds off its speed. */
      const travel = 1 - Math.pow(1 - q, 2.8);

      /* Polar about the meeting point: outwards, sweeping clockwise
         (the angle rises on a y-down screen). */
      const sx = rock.x + f.ox * rr - at.x;
      const sy = rock.y + f.oy * rr - at.y;
      const dist = Math.hypot(sx, sy) + half * f.reach * travel;
      const ang = Math.atan2(sy, sx) + (f.turn + f.wobble) * travel;
      const x = at.x + Math.cos(ang) * dist;
      const y = at.y + Math.sin(ang) * dist + offsetY;

      f.mesh.visible = true;
      f.mesh.position.copy(this.stage.at(x, y, 40 + f.z * travel + f.lift * 60 * travel));
      f.mesh.rotation.set(
        f.rot.x + f.spin.x * travel + f.drift.x * t,
        f.rot.y + f.spin.y * travel + f.drift.y * t,
        /* Tumbling clockwise on screen (negative z, as the stage is y-up). */
        f.rot.z - Math.abs(f.spin.z) * travel + f.drift.z * t
      );
      f.mesh.scale.setScalar(rr * f.size);
    }
  }

  destroy() {
    this.stage.keep('scatter', false);
    this.pieces.forEach((f) => this.stage.scene.remove(f.mesh));
  }
}
