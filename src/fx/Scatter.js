import { Mesh, Vector3 } from 'three';
import { prng } from './asteroid.js';

/* Fragments per rock. */
const PER_ROCK = 11;
/* Share of the fragments that come to rest on screen; the rest fly off. */
const KEEP = 0.65;

/** How far from (x, y) along (dx, dy) before leaving the screen. */
const toEdge = (x, y, dx, dy, w, h) => {
  const tx = dx > 1e-6 ? (w - x) / dx : dx < -1e-6 ? -x / dx : Infinity;
  const ty = dy > 1e-6 ? (h - y) / dy : dy < -1e-6 ? -y / dy : Infinity;
  return Math.max(0, Math.min(tx, ty));
};

/**
 * The four rocks, broken apart.
 *
 * Every fragment starts inside the rock it came from, so at the instant of
 * contact the pieces still sit where the rocks were. Then each rock
 * crumbles — grit first, the big chunks a beat later — and the pieces fly
 * off in straight lines, fast at first and slowing as if in drag.
 *
 * About two thirds come to rest on screen, spread evenly over it: the
 * screen is divided into a loose grid and each of those pieces is given a
 * cell of its own, the one that lies the way it was already heading. Once
 * there it never quite stops — it floats lazily about its spot. The rest
 * leave the screen.
 *
 * The debris is drawn behind the page (see Main), so it passes behind
 * the text and photos instead of over them.
 *
 * The burst is a pure function of progress (and a fixed seed), so the
 * scroll plays it forwards and backwards exactly; only the floating and
 * the tumble run on the clock.
 */
export default class Scatter {
  constructor(stage) {
    this.stage = stage;
    const rand = prng(1987);

    /* Exactly KEEP of them stay, spread over the four rocks. */
    const total = 4 * PER_ROCK;
    const stays = Array.from({ length: total }, (_, i) => i < Math.round(total * KEEP));
    for (let i = total - 1; i > 0; i--) {
      const k = Math.floor(rand() * (i + 1));
      [stays[i], stays[k]] = [stays[k], stays[i]];
    }

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
          stays: stays[rock * PER_ROCK + j],
          /* Where in the rock it was (× rock radius). */
          ox: Math.cos(ang) * rad,
          oy: Math.sin(ang) * rad,
          /* Grit breaks loose first; the big chunks hold on a moment longer. */
          delay: big ? 0.06 + rand() * 0.08 : rand() * 0.18,
          /* Its natural heading: outwards, plus a share of the rocks' spin. */
          spin: 0.3 + rand() * 0.7,
          spread: (rand() - 0.5) * 0.9,
          beyond: 160 + rand() * 360,
          /* Where in its cell it settles, and how it floats there — never
             far enough to stray out of its cell (or off the screen). */
          jx: rand() - 0.5,
          jy: rand() - 0.5,
          sway: [0, 1, 2, 3].map(() => ({ f: 0.1 + rand() * 0.16, ph: rand() * Math.PI * 2 })),
          lift: (rand() - 0.5) * 0.9,
          size: big ? 0.46 + rand() * 0.14 : 0.13 + rand() * 0.24,
          z: (rand() - 0.5) * 120,
          rot: new Vector3(rand() * 6.28, rand() * 6.28, rand() * 6.28),
          tumble: new Vector3(rand() * 10 - 5, rand() * 10 - 5, rand() * 10 - 5),
          drift: new Vector3(rand() - 0.5, rand() - 0.5, rand() - 0.5).multiplyScalar(0.6)
        });
      }
    }
    /* Which cells are left empty, decided once so the spread is stable. */
    this.skipSeed = rand();
  }

  /** Natural heading of a piece, from where it starts relative to the centre. */
  heading(f, sx, sy, at) {
    let ux = sx - at.x;
    let uy = sy - at.y;
    const l = Math.hypot(ux, uy) || 1;
    ux /= l;
    uy /= l;
    /* Clockwise share of the spin: the tangent (−y, x) on a y-down screen. */
    return Math.atan2(uy + ux * f.spin, ux - uy * f.spin) + f.spread;
  }

  /**
   * Give every staying piece its own cell in an even grid over the screen,
   * matching pieces to cells around the centre in angle order, so each
   * flies roughly the way it was heading anyway.
   */
  layout(meet, radius) {
    const { w, h } = this.stage;
    const key = `${w}x${h}`;
    if (this.key === key) return;
    this.key = key;
    const { at, rocks } = meet;
    const staying = this.pieces.filter((f) => f.stays);
    const n = staying.length;
    const cols = Math.max(1, Math.round(Math.sqrt((n * w) / h)));
    const rows = Math.ceil(n / cols);
    const cw = w / cols;
    const ch = h / rows;
    let cells = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) cells.push({ x: (c + 0.5) * cw, y: (r + 0.5) * ch });
    }
    /* Too many cells: leave a few out, scattered (seeded, so it's stable). */
    const pr = prng(Math.floor(this.skipSeed * 1e6));
    while (cells.length > n) cells.splice(Math.floor(pr() * cells.length), 1);
    const angle = (x, y) => Math.atan2(y - at.y, x - at.x);
    cells = cells.map((c) => ({ ...c, a: angle(c.x, c.y) })).sort((p, q) => p.a - q.a);
    const order = staying
      .map((f) => {
        const rock = rocks[f.rock];
        const rr = radius * rock.size;
        return { f, a: this.heading(f, rock.x + f.ox * rr, rock.y + f.oy * rr, at) };
      })
      .map((o) => ({ ...o, a: Math.atan2(Math.sin(o.a), Math.cos(o.a)) }))
      .sort((p, q) => p.a - q.a);
    /* Best rotation of the pairing — the one that bends headings least. */
    let best = 0;
    let bestCost = Infinity;
    for (let k = 0; k < n; k++) {
      let cost = 0;
      for (let i = 0; i < n; i++) {
        const d = order[i].a - cells[(i + k) % n].a;
        cost += 1 - Math.cos(d);
      }
      if (cost < bestCost) { bestCost = cost; best = k; }
    }
    order.forEach((o, i) => {
      const c = cells[(i + best) % n];
      o.f.cell = { x: c.x, y: c.y, w: cw, h: ch };
    });
  }

  /**
   * p        0 → 1: from the instant of contact to fully scattered
   * meet     { at, rocks: [{ x, y, size }] } — the centre and each rock at contact, viewport px
   * radius   a rock's radius at contact, px
   * offsetY  shift the whole field (it scrolls away with the page)
   */
  update(p, meet, radius, offsetY = 0) {
    const { w, h } = this.stage;
    /* Nothing to draw before contact, or once the field has scrolled away. */
    const live = p > 0 && offsetY > -h - radius * 2;
    this.stage.keep('scatter', live);
    /* Back before contact: the next collision gets a fresh pairing. */
    if (p <= 0) this.key = null;
    if (!live) {
      this.pieces.forEach((f) => { f.mesh.visible = false; });
      return;
    }
    this.layout(meet, radius);

    const { at, rocks } = meet;
    const t = performance.now() / 1000;

    for (const f of this.pieces) {
      const rock = rocks[f.rock];
      const rr = radius * rock.size;
      const piece = rr * f.size;
      const q = Math.min(1, Math.max(0, (p - f.delay) / (1 - f.delay)));
      /* Fast off the mark, bleeding speed like debris in drag. */
      const travel = 1 - Math.pow(1 - q, 2.6);

      const sx = rock.x + f.ox * rr;
      const sy = rock.y + f.oy * rr;
      let tx;
      let ty;
      if (f.stays) {
        /* Its spot in its cell, kept clear of the cell's edges. */
        const c = f.cell;
        tx = c.x + f.jx * c.w * 0.4;
        ty = c.y + f.jy * c.h * 0.4;
      } else {
        const a = this.heading(f, sx, sy, at);
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const D = toEdge(sx, sy, dx, dy, w, h) + piece + f.beyond;
        tx = sx + dx * D;
        ty = sy + dy * D;
      }
      let x = sx + (tx - sx) * travel;
      let y = sy + (ty - sy) * travel;
      let z = 40 + f.z * travel + f.lift * 60 * travel;

      if (f.stays) {
        /* Floating about its spot — eased in as it slows, never still. */
        const settle = travel * travel;
        const [a1, a2, b1, b2] = f.sway;
        const fx = 0.6 * Math.sin(t * a1.f + a1.ph) + 0.4 * Math.sin(t * a2.f + a2.ph);
        const fy = 0.6 * Math.sin(t * b1.f + b1.ph) + 0.4 * Math.sin(t * b2.f + b2.ph);
        x += fx * f.cell.w * 0.28 * settle;
        y += fy * f.cell.h * 0.28 * settle;
        z += Math.sin(t * 0.21 + a1.ph) * 40 * settle;
      }
      y += offsetY;

      /* Skip anything that's off screen. */
      const shown = x > -piece && x < w + piece && y > -piece && y < h + piece;
      f.mesh.visible = shown;
      if (!shown) continue;
      f.mesh.position.copy(this.stage.at(x, y, z));
      f.mesh.rotation.set(
        f.rot.x + f.tumble.x * travel + f.drift.x * t,
        f.rot.y + f.tumble.y * travel + f.drift.y * t,
        /* Tumbling clockwise on screen (negative z, as the stage is y-up). */
        f.rot.z - Math.abs(f.tumble.z) * travel + f.drift.z * t
      );
      f.mesh.scale.setScalar(piece);
    }
  }

  destroy() {
    this.stage.keep('scatter', false);
    this.pieces.forEach((f) => this.stage.scene.remove(f.mesh));
  }
}
