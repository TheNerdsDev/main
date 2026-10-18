import { Quaternion, Vector3 } from 'three';
import store from '../core/Store.js';
import { warn } from '../core/gpu.js';
import {
  tiltFor, texturesFor, SUN, SATURN_RING, URANUS_RING,
  MERCURY, VENUS, EARTH, MOON, MARS, JUPITER, SATURN, URANUS, NEPTUNE
} from './PlanetScene.js';

/*
 * The planets without WebGL: the same shower, drawn on a plain 2D canvas.
 *
 * Stands in for PlanetScene (same load / warm / resize / render / dispose)
 * when there's no WebGL2, when the planets' context is lost, or when their
 * maps won't load — so the shower never just isn't there.
 *
 * Each kind of planet is worked out once, pixel by pixel, into a small
 * image: its map wrapped round a sphere, seen at its real tilt, with the
 * same light from the upper left, its haze at the limb and its rings in
 * front of and behind it. A frame is then one image per planet. The
 * shading is a separate image, so a rolling planet turns while its light
 * stays put. (They don't spin on their axes, and a map that won't load
 * leaves the planet in its plain colour.)
 */

/* Plain colours: for a planet whose map didn't come. */
const COLOUR = {
  [MERCURY]: [154, 149, 144], [VENUS]: [217, 181, 122], [EARTH]: [61, 111, 181],
  [MOON]: [168, 168, 168], [MARS]: [193, 100, 60], [JUPITER]: [201, 162, 124],
  [SATURN]: [216, 192, 142], [URANUS]: [159, 216, 224], [NEPTUNE]: [74, 111, 216]
};
const MAP = {
  [MERCURY]: 'mercury', [VENUS]: 'venus', [EARTH]: 'earthDay', [MOON]: 'moon', [MARS]: 'mars',
  [JUPITER]: 'jupiter', [SATURN]: 'saturn', [URANUS]: 'uranus', [NEPTUNE]: 'neptune'
};
/* Haze at the limb: colour, strength, and how far the glow reaches past the edge. */
const AIR = {
  [EARTH]: [[106, 168, 255], 0.55, 1.075], [VENUS]: [[255, 217, 160], 0.5, 1.06],
  [MARS]: [[224, 163, 122], 0.28, 1.03], [URANUS]: [[174, 240, 255], 0.45, 1.035],
  [NEPTUNE]: [[111, 151, 255], 0.5, 1.035], [JUPITER]: [[242, 214, 176], 0.3, 1],
  [SATURN]: [[246, 227, 184], 0.28, 1]
};
const RING = { [SATURN]: ['saturnRing', SATURN_RING, [205, 184, 143, 200]], [URANUS]: ['uranusRing', URANUS_RING, [159, 180, 192, 90]] };

const Y = new Vector3(0, 1, 0);
const v = new Vector3();
const inv = new Quaternion();

/** An image's pixels, at most `w` wide (null if it didn't come within 4s). */
const pixels = (url, w) => new Promise((resolve) => {
  const img = new Image();
  img.decoding = 'async';
  const late = setTimeout(() => {
    img.onload = img.onerror = null;
    warn(`planets (2D): ${url} is taking too long, using a plain colour`);
    resolve(null);
  }, 4000);
  img.onload = () => {
    clearTimeout(late);
    try {
      const W = Math.min(w, img.naturalWidth);
      const H = Math.max(1, Math.round((img.naturalHeight * W) / img.naturalWidth));
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0, W, H);
      resolve({ W, H, d: g.getImageData(0, 0, W, H).data });
    } catch { resolve(null); }
  };
  img.onerror = () => {
    clearTimeout(late);
    warn(`planets (2D): couldn't load ${url}, using a plain colour`);
    resolve(null);
  };
  img.src = url;
});

export default class PlanetSprites {
  /**
   * canvas   a fresh canvas (one that's had a WebGL context can't draw 2D)
   * radius   (type) => the largest a body of that type will be drawn, CSS px
   */
  constructor(canvas, { radius }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    if (!this.ctx) throw new Error('no 2D canvas');
    this.radius = radius;
    this.sprites = new Map();
    this.w = this.h = 0;
  }

  load() {
    if (this.loading) return this.loading;
    const urls = texturesFor('1k');
    const keys = [...Object.values(MAP), 'earthClouds', 'saturnRing', 'uranusRing'];
    this.maps = {};
    this.loading = Promise.all(keys.map((k) => pixels(urls[k], 512).then((p) => { this.maps[k] = p; })))
      .then(() => { this.ready = true; });
    return this.loading;
  }

  /** Every kind worked out ahead (each in its own idle moment), so the first frame is just drawing. */
  async warm() {
    if (!this.ready || this.warming) return this.warming;
    const idle = () => new Promise((r) => (this.hurry || !('requestIdleCallback' in window)
      ? requestAnimationFrame(() => r())
      : requestIdleCallback(() => r(), { timeout: 120 })));
    this.warming = (async () => {
      for (const type of Object.keys(MAP).map(Number)) {
        for (const side of [0, 1]) {
          await idle();
          if (this.disposed) return;
          this.sprite(type, side);
        }
      }
      this.warmed = true;
    })();
    return this.warming;
  }

  resize(w, h) {
    const dpr = store.fxDpr;
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.max(1, Math.round(w * dpr));
    this.canvas.height = Math.max(1, Math.round(h * dpr));
    this.drawn = false;
  }

  /**
   * One kind of planet, leaning one way or the other (`side`, as its seed
   * decides in PlanetScene). Ringed planets are one finished image (they
   * slide, never roll); the rest are a map (turned as they roll) and a
   * shading layer laid over it.
   */
  sprite(type, side) {
    const key = type * 2 + side;
    const need = Math.ceil(this.radius(type) * (this.dpr || 1));
    const have = this.sprites.get(key);
    if (have && have.R >= need * 0.9) return have;
    const R = Math.max(4, need);
    const ring = RING[type];
    const air = AIR[type];
    const reach = ring ? ring[1][1] : air ? Math.max(1, air[2]) : 1;
    const half = Math.ceil(R * reach) + 2;
    const size = half * 2;

    const tilt = tiltFor(type, side ? 0.75 : 0.25);
    /* (A fixed turn about its axis, so each side shows a different face.) */
    const q = tilt.clone().multiply(new Quaternion().setFromAxisAngle(Y, side ? 2.4 : 0.7));
    inv.copy(q).invert();
    const map = this.maps[MAP[type]];
    const clouds = type === EARTH ? this.maps.earthClouds : null;
    const base = COLOUR[type];
    const ringMap = ring && this.maps[ring[0]];
    const pole = ring && new Vector3(0, 1, 0).applyQuaternion(tilt);

    const body = new ImageData(size, size);
    const shade = new ImageData(size, size);
    const B = body.data;
    const S = shade.data;
    const sample = (m, u, t, out) => {
      const x = Math.min(m.W - 1, Math.max(0, Math.floor(u * m.W)));
      const y = Math.min(m.H - 1, Math.max(0, Math.floor(t * m.H)));
      const i = (y * m.W + x) * 4;
      out[0] = m.d[i]; out[1] = m.d[i + 1]; out[2] = m.d[i + 2]; out[3] = m.d[i + 3];
      return out;
    };
    const px = [0, 0, 0, 0];
    const rp = [0, 0, 0, 0];

    for (let j = 0; j < size; j++) {
      const y = -(j + 0.5 - half) / R;
      for (let i = 0; i < size; i++) {
        const x = (i + 0.5 - half) / R;
        const o = (j * size + i) * 4;
        const d2 = x * x + y * y;
        let a = 0;
        let r = 0, g = 0, b = 0;
        let nz = -Infinity;
        if (d2 <= 1) {
          nz = Math.sqrt(1 - d2);
          /* The map at this point of the sphere (three.js's sphere UVs). */
          v.set(x, y, nz).applyQuaternion(inv);
          const u = ((Math.atan2(v.z, -v.x) / (2 * Math.PI)) % 1 + 1) % 1;
          const t = Math.acos(Math.max(-1, Math.min(1, v.y))) / Math.PI;
          if (map) sample(map, u, t, px);
          else { px[0] = base[0]; px[1] = base[1]; px[2] = base[2]; }
          r = px[0]; g = px[1]; b = px[2];
          if (clouds) {
            const c = sample(clouds, u, t, rp)[0] / 255 * 0.85;
            r += (255 - r) * c; g += (255 - g) * c; b += (255 - b) * c;
          }
          /* The light: never much below 55% on the shaded side, a lift where it's lit, haze at the limb. */
          const lit = 0.55 + 0.75 * Math.max(0, x * SUN.x + y * SUN.y + nz * SUN.z);
          const fres = air ? (1 - nz) ** 3 * air[1] : 0;
          if (ring) {
            r = Math.min(255, r * lit + (air ? air[0][0] * fres : 0));
            g = Math.min(255, g * lit + (air ? air[0][1] * fres : 0));
            b = Math.min(255, b * lit + (air ? air[0][2] * fres : 0));
          } else {
            B[o] = r; B[o + 1] = g; B[o + 2] = b; B[o + 3] = 255;
            /* The shading layer over the (turning) map: darker or lighter, plus the haze. */
            if (lit < 1) {
              S[o] = air ? air[0][0] * fres : 0; S[o + 1] = air ? air[0][1] * fres : 0; S[o + 2] = air ? air[0][2] * fres : 0;
              S[o + 3] = Math.min(255, (1 - lit + fres * 0.6) * 255);
            } else {
              S[o] = 255; S[o + 1] = 255; S[o + 2] = 255;
              S[o + 3] = Math.min(255, (lit - 1) * 0.6 * 255);
            }
          }
          a = 255;
        } else if (air && air[2] > 1 && !ring) {
          /* Glow just past the edge. */
          const d = Math.sqrt(d2);
          if (d < air[2]) {
            const k = ((air[2] - d) / (air[2] - 1)) ** 1.6 * 0.7 * air[1];
            S[o] = air[0][0]; S[o + 1] = air[0][1]; S[o + 2] = air[0][2]; S[o + 3] = k * 255;
          }
        }
        if (ring && pole && Math.abs(pole.z) > 1e-3) {
          /* Where this pixel's line of sight crosses the ring's plane. */
          const z = -(pole.x * x + pole.y * y) / pole.z;
          const rr = Math.sqrt(d2 + z * z);
          const [inner, outer] = ring[1];
          if (rr >= inner && rr <= outer && z > nz) {
            const u = (rr - inner) / (outer - inner);
            const c = ringMap ? sample(ringMap, u, 0.5, rp) : ring[2];
            const ra = (c[3] / 255) * 0.95;
            r = r * (1 - ra) * (a / 255) + c[0] * 0.9 * ra;
            g = g * (1 - ra) * (a / 255) + c[1] * 0.9 * ra;
            b = b * (1 - ra) * (a / 255) + c[2] * 0.9 * ra;
            a = a + (255 - a) * ra;
            if (a > 0) { r /= a / 255; g /= a / 255; b /= a / 255; }
          }
        }
        if (ring && a > 0) {
          B[o] = r; B[o + 1] = g; B[o + 2] = b; B[o + 3] = a;
        }
      }
    }
    const canvasOf = (data) => {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      c.getContext('2d').putImageData(data, 0, 0);
      return c;
    };
    const s = { R, half, body: canvasOf(body), shade: ring ? null : canvasOf(shade) };
    this.sprites.set(key, s);
    return s;
  }

  /** `moving`: anything in the pile still moving (a still pile is drawn once). */
  render(bodies, time, moving = true) {
    const g = this.ctx;
    const any = this.warmed && bodies.some((b) => b.live);
    if (!any) {
      if (!this.blank) {
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.blank = true;
      }
      this.drawn = false;
      return;
    }
    this.blank = false;
    if (!moving && this.drawn) return;
    this.drawn = true;
    const dpr = this.dpr || 1;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.canvas.width, this.canvas.height);
    for (const b of bodies) {
      if (!b.live) continue;
      const s = this.sprite(b.type, b.seed < 0.5 ? 0 : 1);
      const k = (b.size * dpr) / s.R;
      const e = s.half * k;
      const x = b.x * dpr;
      const y = b.y * dpr;
      if (s.shade) {
        g.setTransform(1, 0, 0, 1, x, y);
        /* (Its roll, as PlanetScene turns it: y runs down here.) */
        g.rotate(-b.rot);
        g.drawImage(s.body, -e, -e, e * 2, e * 2);
        g.setTransform(1, 0, 0, 1, x, y);
        g.drawImage(s.shade, -e, -e, e * 2, e * 2);
      } else {
        g.setTransform(1, 0, 0, 1, x, y);
        g.drawImage(s.body, -e, -e, e * 2, e * 2);
      }
    }
  }

  dispose() {
    this.disposed = true;
    this.sprites.clear();
    this.maps = null;
  }
}
