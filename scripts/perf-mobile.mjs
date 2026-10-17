/*
 * Mobile smoothness audit (`npm run perf:mobile`).
 *
 * Drives a real Chrome with phone emulation (touch, DPR, viewport), CPU
 * throttling and native touch-scroll gestures, and records, per scenario:
 *
 *   frames    every animation frame's time (p50 / p95 / p99 / max, and the
 *             share over 16.7 ms and 33 ms)
 *   long      long tasks (> 50 ms) while it ran, and their blocking time
 *   cls       layout shift during the scenario (no recent input)
 *   rocks     on the home page: frames the scattered field was empty where
 *             it should show, frames it popped in all at once, the largest
 *             jump of a fragment between two frames, and what a URL-bar
 *             resize does to it
 *
 * Usage: build and serve the site (npm run build && npm run preview), then
 *
 *   npm run perf:mobile                     # http://localhost:4173
 *   BASE=http://localhost:4180 npm run perf:mobile
 *   PROFILES=pixel7,se CPU=4,6 npm run perf:mobile
 *
 * It needs Playwright (npm i -D playwright) and Google Chrome; set
 * PLAYWRIGHT=<path to playwright's index.mjs> to use another copy.
 * Reports land in perf-reports/<label>/ (JSON + screenshots).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');

/* SERVE=<a build folder>: serve it here for the run (vite preview, on
   port 4190), instead of an already running server at BASE. */
let server = null;
if (process.env.SERVE) {
  const { preview } = await import('vite');
  server = await preview({ logLevel: 'silent', build: { outDir: process.env.SERVE }, preview: { port: 4190, strictPort: true } });
}
const BASE = (process.env.SERVE ? 'http://localhost:4190' : process.env.BASE || 'http://localhost:4173').replace(/\/$/, '');
const LABEL = process.env.LABEL || 'run';
const OUT = join(process.cwd(), 'perf-reports', LABEL);
mkdirSync(OUT, { recursive: true });

const PROFILES = {
  se: { width: 375, height: 667, dpr: 2 },
  android: { width: 360, height: 800, dpr: 3 },
  pixel7: { width: 412, height: 915, dpr: 2.625 },
  promax: { width: 430, height: 932, dpr: 3 }
};
const pick = (env, all) => (env ? env.split(',').map((s) => s.trim()).filter(Boolean) : all);
const profiles = pick(process.env.PROFILES, ['pixel7', 'se']);
const rates = pick(process.env.CPU, ['4']).map(Number);
const scenarios = pick(process.env.SCENARIOS, ['home', 'urlbar', 'menu', 'work', 'load']);

const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

/* ------------------------------------------------- in-page recorders */

function recorders() {
  const P = (window.__perf = { frames: [], long: [], shifts: [], lcp: 0, events: [], rocks: [] });
  let last = 0;
  const loop = (t) => {
    if (last) P.frames.push([t, t - last]);
    last = t;
    /* The home page's debris field, sampled every frame. */
    const pg = window.__app?.page;
    if (P.watchRocks && pg?.scatter) {
      const pieces = pg.scatter.pieces;
      let vis = 0;
      const pos = [];
      for (const f of pieces) {
        if (f.mesh.visible) vis++;
        pos.push(f.mesh.visible ? [f.mesh.position.x, f.mesh.position.y] : null);
      }
      P.rocks.push({ t, y: window.scrollY, p: pg.rockP, vis, pos, shown: pg.stage?.canvas.style.visibility !== 'hidden' });
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  const watch = (type, fn) => {
    try { new PerformanceObserver((l) => l.getEntries().forEach(fn)).observe({ type, buffered: true }); } catch { /* unsupported */ }
  };
  watch('longtask', (e) => P.long.push([e.startTime, e.duration]));
  watch('layout-shift', (e) => {
    if (!e.hadRecentInput) P.shifts.push([e.startTime, e.value, (e.sources || []).map((s) => (s.node && (s.node.className || s.node.nodeName)) || '?').join(' | ')]);
  });
  watch('largest-contentful-paint', (e) => { P.lcp = e.startTime; });
  watch('event', (e) => { if (e.interactionId) P.events.push([e.startTime, e.duration, e.name]); });
}

/* --------------------------------------------------------- helpers */

const pct = (sorted, q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0;

function frameStats(frames, from, to) {
  const d = frames.filter(([t]) => t >= from && t <= to).map(([, dt]) => dt);
  if (!d.length) return { n: 0 };
  const s = [...d].sort((a, b) => a - b);
  const vsync = pct(s, 0.1);
  return {
    n: d.length,
    p50: +pct(s, 0.5).toFixed(1),
    p95: +pct(s, 0.95).toFixed(1),
    p99: +pct(s, 0.99).toFixed(1),
    max: +s[s.length - 1].toFixed(1),
    over16: +((d.filter((x) => x > 16.7).length / d.length) * 100).toFixed(2),
    over33: +((d.filter((x) => x > 33.4).length / d.length) * 100).toFixed(2),
    /* Frames that missed their slot on this display (1.5 × its interval). */
    missed: +((d.filter((x) => x > vsync * 1.5).length / d.length) * 100).toFixed(2)
  };
}

function longStats(long, from, to) {
  const l = long.filter(([t]) => t >= from && t <= to);
  return { count: l.length, worst: +Math.max(0, ...l.map(([, d]) => d)).toFixed(0), blocking: +l.reduce((a, [, d]) => a + Math.max(0, d - 50), 0).toFixed(0) };
}

function clsIn(shifts, from, to) {
  const s = shifts.filter(([t]) => t >= from && t <= to);
  return { cls: +s.reduce((a, [, v]) => a + v, 0).toFixed(4), sources: [...new Set(s.map(([, , src]) => src))].slice(0, 6) };
}

/** The debris field: emptiness where it should show, pop-in, jumps. */
function rockStats(rocks, from, to, collide = 0.2) {
  const r = rocks.filter((x) => x.t >= from && x.t <= to);
  let empty = 0;
  let pops = 0;
  let maxJump = 0;
  const jumps = [];
  for (let i = 0; i < r.length; i++) {
    const a = r[i];
    /* Past contact and not scrolled away: something should be on screen. */
    if (a.p > collide + 0.04 && a.p < 0.98 && a.vis === 0) empty++;
    if (i === 0) continue;
    const b = r[i - 1];
    if (a.vis - b.vis >= 15) pops++;
    for (let k = 0; k < a.pos.length; k++) {
      if (!a.pos[k] || !b.pos[k]) continue;
      const j = Math.hypot(a.pos[k][0] - b.pos[k][0], a.pos[k][1] - b.pos[k][1]);
      if (j > maxJump) maxJump = j;
      if (j > 60) jumps.push({ t: +a.t.toFixed(0), y: a.y, piece: k, px: +j.toFixed(0) });
    }
  }
  return { frames: r.length, empty, pops, maxJump: +maxJump.toFixed(0), bigJumps: jumps.length, firstJumps: jumps.slice(0, 5) };
}

async function ready(page) {
  await page.waitForFunction(() => document.documentElement.classList.contains('loaded') && !document.documentElement.classList.contains('lenis-stopped'), null, { timeout: 60000 });
  await page.waitForTimeout(1200);
}

const now = (page) => page.evaluate(() => performance.now());

/**
 * A finger swipe — touch start, moves every 16ms, lift — so the browser
 * scrolls natively, with its fling, as on a phone: dy > 0 scrolls down.
 * Near the left edge, clear of anything that could be dragged.
 * (Input.synthesizeScrollGesture's touch source doesn't scroll an
 * emulated mobile page in headless Chrome.)
 */
async function swipe(cdp, prof, dy, speed = 1400) {
  const travel = Math.min(Math.abs(dy), prof.height * 0.6);
  const x = Math.round(prof.width * 0.06);
  const y0 = dy > 0 ? prof.height * 0.8 : prof.height * 0.2;
  const y1 = y0 - Math.sign(dy) * travel;
  const steps = Math.max(4, Math.round((travel / speed) * 1000 / 16));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
  for (let i = 1; i <= steps; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y0 + ((y1 - y0) * i) / steps }] });
    await new Promise((r) => setTimeout(r, 16));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Swipe from where we are to `target` (page px), in finger-sized moves. */
async function swipeTo(page, cdp, prof, target, speed) {
  for (let guard = 0; guard < 80; guard++) {
    const y = await page.evaluate(() => window.scrollY);
    const left = target - y;
    if (Math.abs(left) < 40) return;
    const step = Math.sign(left) * Math.min(Math.abs(left), prof.height * 0.55);
    await swipe(cdp, prof, step, speed);
    await page.waitForTimeout(60);
  }
}

/* ------------------------------------------------------- scenarios */

async function homeScroll(page, cdp, prof) {
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await ready(page);
  await page.evaluate(() => { window.__perf.watchRocks = true; });
  const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const t0 = await now(page);
  /* Down the whole page and back, steadily; then flicks both ways. */
  await swipeTo(page, cdp, prof, max, 1400);
  const tDown = await now(page);
  await swipeTo(page, cdp, prof, 0, 1400);
  const tUp = await now(page);
  for (let i = 0; i < 3; i++) await swipe(cdp, prof, prof.height * 1.4, 4200);
  for (let i = 0; i < 3; i++) await swipe(cdp, prof, -prof.height * 1.4, 4200);
  await page.waitForTimeout(600);
  const t1 = await now(page);
  const P = await page.evaluate(() => window.__perf);
  return {
    scroll: frameStats(P.frames, t0, t1),
    down: frameStats(P.frames, t0, tDown),
    up: frameStats(P.frames, tDown, tUp),
    long: longStats(P.long, t0, t1),
    layoutShift: clsIn(P.shifts, t0, t1),
    rocksDown: rockStats(P.rocks, t0, tDown),
    rocksUp: rockStats(P.rocks, tDown, tUp),
    rocksFlick: rockStats(P.rocks, tUp, t1)
  };
}

/**
 * Chrome's URL bar hiding or showing, as it does on a phone: the page's
 * layout (and 100lvh) stays as it is, while innerHeight changes by the
 * bar's height (~56px) and a resize event fires. Emulation can't slide a
 * real bar, so innerHeight is overridden and the event dispatched — done
 * at rest at the top and inside About.
 */
async function urlBar(page, cdp, prof) {
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await ready(page);
  const bar = 56;
  const setBar = async (shown) => {
    await page.evaluate(([h]) => {
      Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => h });
      window.dispatchEvent(new Event('resize'));
    }, [shown ? prof.height - bar : prof.height]);
  };
  const H = prof.height;
  const probe = () => page.evaluate(() => {
    const q = (s) => document.querySelector(s)?.getBoundingClientRect().top ?? null;
    const pg = window.__app?.page;
    return {
      y: window.scrollY,
      title: q('.page-title, h1'),
      header: q('.site-header'),
      cells: pg?.scatter?.pieces.filter((f) => f.cell).map((f) => `${Math.round(f.cell.x)},${Math.round(f.cell.y)}`) ?? [],
      pos: pg?.scatter?.pieces.map((f) => (f.mesh.visible ? [Math.round(f.mesh.position.x), Math.round(f.mesh.position.y)] : null)) ?? [],
      rockP: pg?.rockP
    };
  });
  const res = {};
  /* At the top: does the hero move? */
  const a0 = await probe();
  await setBar(true);
  await page.waitForTimeout(700);
  const a1 = await probe();
  await setBar(false);
  await page.waitForTimeout(700);
  res.top = { titleMoved: a1.title !== null && a0.title !== null ? +(a1.title - a0.title).toFixed(1) : null, headerMoved: a1.header - a0.header };

  /* Inside About, rocks scattered. */
  const aboutY = await page.evaluate(() => {
    const pg = window.__app.page;
    const end = pg.aboutTop + pg.aboutH - innerHeight;
    return Math.round(pg.aboutTop + (end - pg.aboutTop) * 0.33);
  });
  await swipeTo(page, cdp, prof, aboutY, 1200);
  await page.waitForTimeout(1500);
  /* Count re-splits of the About copy. */
  await page.evaluate(() => {
    window.__resplit = 0;
    const el = document.querySelector('.about-text');
    if (el) new MutationObserver(() => { window.__resplit++; }).observe(el, { childList: true, subtree: true });
  });
  const b0 = await probe();
  await setBar(true);
  await page.waitForTimeout(900);
  const b1 = await probe();
  await setBar(false);
  await page.waitForTimeout(900);
  const b2 = await probe();
  const moved = (p, q) => {
    let m = 0;
    for (let i = 0; i < p.pos.length; i++) if (p.pos[i] && q.pos[i]) m = Math.max(m, Math.hypot(p.pos[i][0] - q.pos[i][0], p.pos[i][1] - q.pos[i][1]));
    return Math.round(m);
  };
  const changed = (p, q) => p.cells.filter((c, i) => c !== q.cells[i]).length;
  res.about = {
    scrollMoved: [b1.y - b0.y, b2.y - b0.y],
    rockPChange: +((b1.rockP ?? 0) - (b0.rockP ?? 0)).toFixed(3),
    cellsReassigned: [changed(b0, b1), changed(b0, b2)],
    /* (Includes ~1s of their own slow float.) */
    fragmentShift: [moved(b0, b1), moved(b0, b2)],
    aboutTextMutations: await page.evaluate(() => window.__resplit)
  };
  return res;
}

async function menu(page, cdp, prof) {
  await page.goto(`${BASE}/`, { waitUntil: 'load' });
  await ready(page);
  const runs = [];
  for (let i = 0; i < 3; i++) {
    const t0 = await now(page);
    await page.tap('.menu-toggle');
    await page.waitForTimeout(1300);
    const t1 = await now(page);
    await page.tap('.menu-toggle');
    await page.waitForTimeout(800);
    const t2 = await now(page);
    const P = await page.evaluate(() => window.__perf);
    runs.push({ open: frameStats(P.frames, t0, t1), close: frameStats(P.frames, t1, t2), long: longStats(P.long, t0, t2) });
  }
  /* Rapid open / close / open: must end open, nothing queued or stuck. */
  await page.tap('.menu-toggle');
  await page.waitForTimeout(90);
  await page.tap('.menu-toggle');
  await page.waitForTimeout(90);
  await page.tap('.menu-toggle');
  await page.waitForTimeout(1300);
  const state = await page.evaluate(() => {
    const h = document.querySelector('.site-header');
    const nav = h.querySelector('.nav');
    const links = [...nav.querySelectorAll('.nav-link')].map((a) => +getComputedStyle(a).opacity);
    return { open: h.classList.contains('is-open'), expanded: h.querySelector('.menu-toggle').getAttribute('aria-expanded'), navVisible: getComputedStyle(nav).visibility, links };
  });
  await page.screenshot({ path: join(OUT, `menu-open-${prof.name}.png`) });
  await page.tap('.menu-toggle');
  await page.waitForTimeout(700);
  return { runs, rapid: state };
}

async function work(page, cdp, prof) {
  await page.goto(`${BASE}/work/`, { waitUntil: 'load' });
  await ready(page);
  const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
  const t0 = await now(page);
  await swipeTo(page, cdp, prof, max, 1400);
  await swipeTo(page, cdp, prof, 0, 1400);
  for (let i = 0; i < 2; i++) await swipe(cdp, prof, prof.height * 1.2, 4000);
  for (let i = 0; i < 2; i++) await swipe(cdp, prof, -prof.height * 1.2, 4000);
  await page.waitForTimeout(600);
  const t1 = await now(page);
  const P = await page.evaluate(() => window.__perf);
  await page.screenshot({ path: join(OUT, `work-${prof.name}.png`) });
  return { scroll: frameStats(P.frames, t0, t1), long: longStats(P.long, t0, t1), layoutShift: clsIn(P.shifts, t0, t1) };
}

/** Cold load on Slow 4G: LCP, CLS, blocking time until the page is live. */
async function load(page, cdp, prof) {
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
  const out = {};
  for (const path of ['/', '/work/', '/info/', '/contact/']) {
    const t = Date.now();
    await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 120000 });
    await ready(page);
    const live = Date.now() - t;
    await page.waitForTimeout(1500);
    const P = await page.evaluate(() => window.__perf);
    out[path] = { lcp: Math.round(P.lcp), liveMs: live, cls: clsIn(P.shifts, 0, 1e9), tbt: longStats(P.long, 0, 1e9).blocking, longTasks: P.long.length };
    await page.screenshot({ path: join(OUT, `load${path.replace(/\//g, '_') || '_'}${prof.name}.png`) });
  }
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false });
  return out;
}

const RUN = { home: homeScroll, urlbar: urlBar, menu, work, load };

/* ------------------------------------------------------------- run */

const browser = await chromium.launch({ channel: process.env.CHANNEL || 'chrome', headless: process.env.HEADED ? false : true });
const report = { base: BASE, label: LABEL, when: new Date().toISOString(), results: {} };

for (const name of profiles) {
  const prof = { ...PROFILES[name], name };
  for (const rate of rates) {
    const key = `${name}@${rate}x`;
    report.results[key] = {};
    for (const sc of scenarios) {
      const ctx = await browser.newContext({
        viewport: { width: prof.width, height: prof.height },
        deviceScaleFactor: prof.dpr, isMobile: true, hasTouch: true, userAgent: UA
      });
      await ctx.addInitScript(recorders);
      const page = await ctx.newPage();
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate });
      try {
        report.results[key][sc] = await RUN[sc](page, cdp, prof, ctx);
      } catch (err) {
        report.results[key][sc] = { error: String(err.message || err).split('\n')[0] };
      }
      console.log(key, sc, JSON.stringify(report.results[key][sc]));
      await ctx.close();
    }
  }
}

await browser.close();
await server?.close();
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(`\nSaved ${join(OUT, 'report.json')}`);
