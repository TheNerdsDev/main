/*
 * The 404 page (scripts/generate-pages.mjs → notFoundPage). The site's own
 * sky (gl/World.js — stars, nebula, the smoke the cursor leaves) and its
 * cursor (core/Cursor.js), so a wrong turn still feels like the same
 * place; the site's type and stylesheet, its button the About Us one,
 * lean and all. Nothing else of the app: no loader, no header, no router.
 *
 * Without WebGL, or asked for less motion (as the rest of the site serves
 * then: core/Store.js hasWebGL), a plain sky of softly twinkling stars.
 */
import '@fontsource/anton/400.css';
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import './styles/main.css';
import './styles/notfound.css';
import gsap from 'gsap';
import store from './core/Store.js';
import magnetic from './fx/magnetic.js';

magnetic([...document.querySelectorAll('.about-button')]);

/* The words come in once their fonts have (the heading's, the line's, the
   button's), never in a stand-in face that then swaps: the page's head
   holds them back (lost-wait) until then — never past 1.5s here. Their
   entrance plays from that moment (notfound.css). */
Promise.race([
  Promise.all(['400 1em Anton', '400 1em "Atkinson Hyperlegible"', '400 1em "Syne Mono"'].map((f) => document.fonts?.load(f))),
  new Promise((r) => setTimeout(r, 1500))
]).catch(() => {}).then(() => store.html.classList.remove('lost-wait'));

/** The site's sky and cursor. */
async function sky() {
  const [{ default: World }, { default: Cursor }] = await Promise.all([
    import('./gl/World.js'),
    import('./core/Cursor.js')
  ]);
  const world = new World(document.querySelector('.canvas'));
  store.html.classList.add('webgl');
  /* Its shaders built before the first frame (never waited on past 0.6s). */
  await Promise.race([world.warm(), new Promise((r) => setTimeout(r, 600))]);
  gsap.ticker.add((time) => world.loop(time));
  world.reveal();
  if (Cursor.supported()) new Cursor();

  /* (A phone's address bar sliding changes nothing that's drawn: Store.) */
  let t;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => { if (store.resize()) world.resize(); }, 150);
  });
}

/** No WebGL (or less motion): stars on a 2D canvas, twinkling unless still. */
function plainSky() {
  const canvas = document.querySelector('.lost-stars');
  if (!canvas) return;
  canvas.hidden = false;
  const still = store.reducedMotion;
  const g = canvas.getContext('2d');
  let stars = [];
  let w = 0;
  let h = 0;
  let frame = 0;

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
    frame = still || document.hidden ? 0 : requestAnimationFrame(draw);
  };

  size();
  window.addEventListener('resize', () => {
    if (window.innerWidth === w && Math.abs(window.innerHeight - h) < 120) return;
    size();
    if (!frame) draw(performance.now());
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && !frame && !still) frame = requestAnimationFrame(draw);
  });
  draw(performance.now());
}

if (store.hasWebGL) {
  sky().catch((err) => {
    console.error('[404] sky failed, falling back', err);
    document.querySelector('.canvas')?.remove();
    plainSky();
  });
} else {
  document.querySelector('.canvas')?.remove();
  document.querySelector('.overlay')?.remove();
  plainSky();
}
