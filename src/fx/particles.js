/* Shared helpers for the 2D effects. */

export const rand = (a, b) => a + Math.random() * (b - a);
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;

export const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/**
 * Black-body-ish cooling ramp: 1 = white hot, 0 = dark red ember.
 * Returns an [r, g, b] triple.
 */
const HEAT = [
  [0.0, [90, 14, 6]],
  [0.25, [200, 48, 14]],
  [0.5, [255, 132, 40]],
  [0.75, [255, 208, 120]],
  [1.0, [255, 250, 236]]
];
export const heat = (t) => {
  t = clamp(t, 0, 1);
  for (let i = 1; i < HEAT.length; i++) {
    if (t <= HEAT[i][0]) {
      const [t0, c0] = HEAT[i - 1];
      const [t1, c1] = HEAT[i];
      const k = (t - t0) / (t1 - t0);
      return [lerp(c0[0], c1[0], k), lerp(c0[1], c1[1], k), lerp(c0[2], c1[2], k)];
    }
  }
  return HEAT[HEAT.length - 1][1];
};

/*
 * Soft round glow sprites, cached per colour. Drawing a pre-rendered
 * gradient with drawImage is far cheaper than building a gradient per
 * particle per frame.
 */
const sprites = new Map();
export const glow = (rgb) => {
  const key = rgb.map((v) => Math.round(v / 8) * 8).join(',');
  let c = sprites.get(key);
  if (c) return c;

  const size = 64;
  c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  const [r, gg, b] = key.split(',').map(Number);
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  const core = [lerp(r, 255, 0.65), lerp(gg, 255, 0.65), lerp(b, 255, 0.65)].map(Math.round);
  grad.addColorStop(0, `rgba(${core.join(',')},1)`);
  grad.addColorStop(0.18, `rgba(${r},${gg},${b},0.85)`);
  grad.addColorStop(0.45, `rgba(${r},${gg},${b},0.22)`);
  grad.addColorStop(1, `rgba(${r},${gg},${b},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);

  sprites.set(key, c);
  return c;
};

/** Draw a glow sprite centred on (x, y) with radius r. */
export const drawGlow = (ctx, rgb, x, y, r, alpha = 1) => {
  if (alpha <= 0.004 || r <= 0.1) return;
  ctx.globalAlpha = alpha;
  ctx.drawImage(glow(rgb), x - r, y - r, r * 2, r * 2);
};

/** A jagged rock outline, as unit-radius vertices. */
export const rockShape = (points = 9, rough = 0.28) =>
  Array.from({ length: points }, (_, i) => {
    const a = (i / points) * Math.PI * 2 + rand(-0.18, 0.18);
    const r = 1 - rough / 2 + Math.random() * rough;
    return [Math.cos(a) * r, Math.sin(a) * r];
  });

export const tracePoly = (ctx, shape, x, y, r, rot) => {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  ctx.beginPath();
  shape.forEach(([px, py], i) => {
    const vx = x + (px * c - py * s) * r;
    const vy = y + (px * s + py * c) * r;
    if (i === 0) ctx.moveTo(vx, vy);
    else ctx.lineTo(vx, vy);
  });
  ctx.closePath();
};

/*
 * A billowy smoke puff: dozens of overlapping soft blobs under a round
 * falloff, rendered once. Drawn rotated and scaled per particle it reads
 * as moving smoke instead of a flat grey disc.
 */
let smokeSprite = null;
export const smokePuff = () => {
  if (smokeSprite) return smokeSprite;
  const size = 128;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  for (let i = 0; i < 46; i++) {
    const a = rand(0, Math.PI * 2);
    const d = Math.pow(Math.random(), 0.7) * 36;
    const x = size / 2 + Math.cos(a) * d;
    const y = size / 2 + Math.sin(a) * d;
    const r = rand(8, 30);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, `rgba(255,255,255,${rand(0.08, 0.2)})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);
  }
  g.globalCompositeOperation = 'destination-in';
  const mask = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  mask.addColorStop(0, 'rgba(0,0,0,1)');
  mask.addColorStop(0.6, 'rgba(0,0,0,0.7)');
  mask.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = mask;
  g.fillRect(0, 0, size, size);
  smokeSprite = c;
  return c;
};

/** Draw a smoke puff, tinted by drawing a light sprite at low alpha over the dark sky. */
export const drawSmoke = (ctx, x, y, r, rot, alpha) => {
  if (alpha <= 0.004) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.drawImage(smokePuff(), -r, -r, r * 2, r * 2);
  ctx.restore();
};

/** The smoke puff tinted to a colour — used for rock dust. Cached per colour. */
const tinted = new Map();
export const drawDust = (ctx, x, y, r, rot, alpha, rgb = [138, 128, 116]) => {
  if (alpha <= 0.004) return;
  const key = rgb.join(',');
  let c = tinted.get(key);
  if (!c) {
    const src = smokePuff();
    c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const g = c.getContext('2d');
    g.drawImage(src, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = `rgb(${key})`;
    g.fillRect(0, 0, c.width, c.height);
    tinted.set(key, c);
  }
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = alpha;
  ctx.drawImage(c, -r, -r, r * 2, r * 2);
  ctx.restore();
};
