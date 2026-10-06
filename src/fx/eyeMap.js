/**
 * Builds the displacement map that makes a sketch's eyes bulge.
 *
 * For `feDisplacementMap`, red/green = 128 means "no shift". Around each
 * eye we encode an inward shift that fades to nothing at the edge of the
 * eye radius, so with a positive filter `scale` every pixel inside samples
 * from closer to the eye's centre — a magnifying lens. Raising `scale`
 * from 0 makes the eyes swell; it works on any drawing, given where the
 * eyes are.
 *
 * w, h   — the sketch's viewBox size
 * eyes   — eye centres as fractions of w / h
 * eyeR   — lens radius as a fraction of w
 */
export const eyeMap = (w, h, eyes, eyeR) => {
  const mw = Math.round(w / 2);
  const mh = Math.round(h / 2);
  const c = document.createElement('canvas');
  c.width = mw;
  c.height = mh;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(mw, mh);
  const data = img.data;
  const rad = eyeR * w;

  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const px = ((x + 0.5) / mw) * w;
      const py = ((y + 0.5) / mh) * h;
      let ox = 0;
      let oy = 0;
      for (const [ex, ey] of eyes) {
        const dx = (px - ex * w) / rad;
        const dy = (py - ey * h) / rad;
        const r2 = dx * dx + dy * dy;
        if (r2 < 1) {
          /* Linear falloff keeps the whole eye growing, not just the pupil;
             the lens never folds over for scales up to ~1.3× the radius. */
          const f = 1 - r2;
          ox -= dx * f;
          oy -= dy * f;
        }
      }
      const i = (y * mw + x) * 4;
      data[i] = Math.max(0, Math.min(255, Math.round(128 + ox * 127)));
      data[i + 1] = Math.max(0, Math.min(255, Math.round(128 + oy * 127)));
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
  return c.toDataURL('image/png');
};
