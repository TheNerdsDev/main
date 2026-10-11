import gsap from 'gsap';

/**
 * Magnetic buttons: once the cursor comes within reach, a button leans
 * after it — following its movement, but never more than PULL px from
 * home — and eases back when the cursor leaves. The lean is written as
 * --nx / --ny for the CSS to apply (hover also grows the button there).
 * Returns a function that undoes it. Does nothing without a mouse.
 */
export default function magnetic(buttons) {
  const list = buttons.filter(Boolean);
  if (!list.length || !window.matchMedia('(hover: hover)').matches) return () => {};
  const PULL = 22;
  const springs = list.map((btn) => ({ btn, x: 0, y: 0, tx: 0, ty: 0 }));
  let on = false;

  const spring = () => {
    const k = 1 - Math.pow(1 - 0.16, gsap.ticker.deltaRatio(60));
    let busy = false;
    for (const s of springs) {
      s.x += (s.tx - s.x) * k;
      s.y += (s.ty - s.y) * k;
      if (!s.tx && !s.ty && Math.abs(s.x) + Math.abs(s.y) < 0.05) {
        if (s.x || s.y) {
          s.x = s.y = 0;
          s.btn.style.removeProperty('--nx');
          s.btn.style.removeProperty('--ny');
        }
        continue;
      }
      busy = true;
      s.btn.style.setProperty('--nx', `${s.x.toFixed(2)}px`);
      s.btn.style.setProperty('--ny', `${s.y.toFixed(2)}px`);
    }
    if (!busy) {
      gsap.ticker.remove(spring);
      on = false;
    }
  };

  const move = (e) => {
    for (const s of springs) {
      const r = s.btn.getBoundingClientRect();
      if (!r.width) continue;
      /* Where it sits without the lean, so the pull doesn't feed on itself. */
      const cx = r.left + r.width / 2 - s.x;
      const cy = r.top + r.height / 2 - s.y;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const reach = r.width / 2 + 70;
      const d = Math.hypot(dx, dy);
      if (d < reach) {
        /* Follows the cursor, softly capped at the edge of its radius. */
        const k = (PULL * Math.tanh(d / (reach * 0.5))) / Math.max(d, 1);
        s.tx = dx * k;
        s.ty = dy * k;
      } else {
        s.tx = 0;
        s.ty = 0;
      }
    }
    if (!on && springs.some((s) => s.tx || s.ty)) {
      on = true;
      gsap.ticker.add(spring);
    }
  };

  window.addEventListener('pointermove', move, { passive: true });
  return () => {
    window.removeEventListener('pointermove', move);
    gsap.ticker.remove(spring);
  };
}
