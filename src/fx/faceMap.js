/**
 * Facial expressions as displacement maps.
 *
 * Each expression is a handful of local warps placed on the face's
 * landmarks — brow ends pulled up or down, eyes squeezed narrower, mouth
 * corners dragged — summed into one vector field and encoded for
 * `feDisplacementMap`. Because it only moves pixels, it works on any
 * drawing, given where its brows, eyes and mouth are.
 *
 * Moves are in viewBox units of a 400-wide drawing (scaled to the real
 * width). `brow` x is towards the nose; `corner` x is away from it.
 */
export const EXPRESSIONS = {
  /* Pain: brows knit up in the middle, eyes screwed shut, a grimace. */
  hurt:  { browIn: [3, -10], browOut: [0, 4], squint: 0.45, corner: [2, 8], mid: [0, -2.5] },
  /* Anger: brows slammed down into a V, a hard narrow glare, a tight scowl. */
  angry: { browIn: [6.5, 15], browOut: [0, -6.5], squint: 0.46, corner: [-3, 7], mid: [0, 2] },
  /* Sad: brows tilted up in the middle and down at the ends, mouth turned down. */
  sad:   { browIn: [1.5, -12], browOut: [0, 7], squint: 0.2, corner: [0.5, 11], mid: [0, -2] }
};

const falloff = (d2) => (d2 < 1 ? (1 - d2) * (1 - d2) : 0);

/**
 * Returns { url, scale }: the encoded map and the `scale` attribute value
 * that applies the expression in full (animate 0 → scale to ease it in).
 *
 *   w, h  the drawing's viewBox size
 *   face  { brows, browsOuter, mouth, corners } as fractions of w / h
 *   eyes  eye centres as fractions; eyeR the eye radius as a fraction of w
 */
export const faceMap = (w, h, face, eyes, eyeR, name) => {
  const e = EXPRESSIONS[name];
  const k = w / 400;
  const P = ([x, y]) => [x * w, y * h];

  /* Sampling offsets: to move content by m, sample from -m. */
  const moves = [];
  const squash = [];
  [0, 1].forEach((side) => {
    const toNose = side === 0 ? 1 : -1;
    if (face.brows?.[side]) moves.push({ c: P(face.brows[side]), r: 0.065 * w, m: [e.browIn[0] * toNose * k, e.browIn[1] * k] });
    if (face.browsOuter?.[side]) moves.push({ c: P(face.browsOuter[side]), r: 0.055 * w, m: [e.browOut[0] * toNose * k, e.browOut[1] * k] });
    if (face.corners?.[side]) moves.push({ c: P(face.corners[side]), r: 0.05 * w, m: [-e.corner[0] * toNose * k, e.corner[1] * k] });
    if (eyes?.[side]) squash.push({ c: P(eyes[side]), r: eyeR * w * 0.85, s: e.squint });
  });
  if (face.mouth) moves.push({ c: P(face.mouth), r: 0.04 * w, m: [e.mid[0] * k, e.mid[1] * k] });

  const mw = Math.round(w / 2);
  const mh = Math.round(h / 2);
  const dx = new Float32Array(mw * mh);
  const dy = new Float32Array(mw * mh);
  let max = 0.0001;

  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const px = ((x + 0.5) / mw) * w;
      const py = ((y + 0.5) / mh) * h;
      let ox = 0;
      let oy = 0;
      for (const f of moves) {
        const fx = (px - f.c[0]) / f.r;
        const fy = (py - f.c[1]) / f.r;
        const a = falloff(fx * fx + fy * fy);
        if (a > 0) { ox -= f.m[0] * a; oy -= f.m[1] * a; }
      }
      /* Squeeze: sample further from the eye's centre line, so the eye
         looks narrower top to bottom. */
      for (const f of squash) {
        const fx = (px - f.c[0]) / f.r;
        const fy = (py - f.c[1]) / f.r;
        const a = falloff(fx * fx + fy * fy);
        if (a > 0) oy += (py - f.c[1]) * f.s * a;
      }
      const i = y * mw + x;
      dx[i] = ox;
      dy[i] = oy;
      max = Math.max(max, Math.abs(ox), Math.abs(oy));
    }
  }

  const c = document.createElement('canvas');
  c.width = mw;
  c.height = mh;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(mw, mh);
  for (let i = 0; i < mw * mh; i++) {
    img.data[i * 4] = Math.round(128 + (dx[i] / max) * 127);
    img.data[i * 4 + 1] = Math.round(128 + (dy[i] / max) * 127);
    img.data[i * 4 + 2] = 128;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);

  /* feDisplacementMap shifts by scale × (channel − 0.5), so 2 × max
     reproduces the field at full strength. */
  return { url: c.toDataURL('image/png'), scale: max * 2 };
};
