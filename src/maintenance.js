/*
 * The maintenance page (scripts/generate-pages.mjs → maintenancePage): its
 * type and stylesheet, and a field of slowly twinkling stars. None of the
 * site's app or 3D, so it's up at once.
 */
import '@fontsource/anton/400.css';
import './styles/base.css';
import './styles/maintenance.css';

const canvas = document.querySelector('.maint-stars');
const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (canvas) {
  const g = canvas.getContext('2d');
  let stars = [];
  let w = 0;
  let h = 0;

  /* About one star per 5,000 px² of screen, mostly faint and small. */
  const size = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    stars = Array.from({ length: Math.round((w * h) / 5000) }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() ** 3 * 1.3 + 0.3,
      a: Math.random() * 0.6 + 0.2,
      speed: Math.random() * 1.4 + 0.3,
      phase: Math.random() * Math.PI * 2
    }));
  };

  const draw = (now) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#F4F3EE';
    for (const s of stars) {
      g.globalAlpha = s.a * (still ? 1 : 0.65 + 0.35 * Math.sin((now / 1000) * s.speed + s.phase));
      g.beginPath();
      g.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      g.fill();
    }
    if (!still) requestAnimationFrame(draw);
  };

  size();
  window.addEventListener('resize', () => {
    size();
    if (still) draw(0);
  });
  requestAnimationFrame(draw);
}
