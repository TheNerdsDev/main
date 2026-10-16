/**
 * Generates every route's index.html from src/content/site.js.
 * Run with `npm run pages` (wired into predev / prebuild).
 *
 * `--build` (prebuild): pages for the published site. With maintenance on
 * (CMS → Maintenance), that's the maintenance page at every address and
 * nothing else. Without it (dev, the CMS): always the real pages — with a
 * reminder while maintenance is on — and the maintenance page at
 * /maintenance/ to preview.
 */
import { existsSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { studio, maintenance, main, team, workIndex, info, contact, showcase, finale, projects, getNext, getPrev } from '../src/content/site.js';
import { logoSvg } from '../src/content/logo.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const BUILD = process.argv.includes('--build');

/* On this computer, while maintenance is on: a corner note on every page,
   so it's never forgotten — the real pages are still here to work on. */
const maintenanceNote = !BUILD && maintenance.on
  ? `
<a href="/maintenance/" style="position:fixed;left:1.6rem;bottom:1.6rem;z-index:200;display:flex;align-items:center;gap:.8rem;padding:.9rem 1.4rem;border-radius:99px;background:rgba(5,6,15,.88);border:1px solid rgba(244,162,97,.55);color:#f8c393;font:500 1.3rem/1.2 'Inter',system-ui,sans-serif;letter-spacing:.02em;text-decoration:none;backdrop-filter:blur(8px);pointer-events:auto">
  <span style="width:.8rem;height:.8rem;border-radius:50%;background:#f4a261;box-shadow:0 0 .8rem #f4a261"></span>
  Maintenance is on — visitors see the maintenance page once published. Preview ↗
</a>`
  : '';

/* ---------------------------------------------------------------- shell */

const shell = ({ title, description, pageId, body, bodyClass = '' }) => `<!doctype html>
<html lang="en" class="is-transitioning">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta name="author" content="${esc(studio.name)}" />
<meta name="theme-color" content="#05060F" />
<meta property="og:type" content="website" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:site_name" content="${esc(studio.name)}" />
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
<link rel="icon" href="/favicon-48.png" type="image/png" sizes="48x48" />
<link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<!-- The first paint, before the stylesheet arrives (in dev it's injected by
     script): dark, with the loader covering the page. The loader's contents
     stay hidden until base.css sets --styled, so nothing shows unstyled. -->
<style>
  html { background: #05060F; color-scheme: dark; scrollbar-width: none; }
  html::-webkit-scrollbar { display: none; }
  .loader { position: fixed; inset: 0; z-index: 100; background: #05060F; }
  .loader > * { visibility: var(--styled, hidden); }
  /* Already tucked away above the top, where base.css keeps it: otherwise
     it starts in view, and base.css slides it up over the loader (it sits
     above it, for keyboard users) as a white box for a moment. */
  .skip-link { position: absolute; top: 0; left: 0; transform: translateY(-120%); }
</style>
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#page-content">Skip to content</a>

<div class="loader" role="status" aria-live="polite" aria-label="Loading">
  <!-- The logo, built in layers by fx/LoaderLogo.js: the letters rise in and the
       rocket flies its trail while loading runs. -->
  <div class="loader-logo" aria-hidden="true"></div>
  <div class="loader-progress-wrapper">
    <span class="loader-progress-inner"><span class="loader-progress">0</span>%</span>
  </div>
</div>

<canvas class="canvas" aria-hidden="true"></canvas>
<div class="overlay" aria-hidden="true"></div>

${body}
${maintenanceNote}
<script type="module" src="/src/main.js"></script>
</body>
</html>
`;

/* ------------------------------------------------------------- partials */

/* A label as rolling letters: on hover each letter rolls up and its twin
   rolls in from below, in a ripple (same as the About Us button). */
const roll = (text) =>
  `<span class="roll" aria-hidden="true">${[...text]
    .map((c, i) => {
      const ch = c === ' ' ? '&nbsp;' : esc(c);
      return `<span class="roll-char" style="--i: ${i}" data-c="${c === ' ' ? '\u00a0' : esc(c)}">${ch}</span>`;
    })
    .join('')}</span>`;

/* `inside`: on a page within the current section (a project, under Work),
   whose rule under the link is drawn shorter. */
const navItem = (href, label, on, inside) =>
  `<a class="nav-link roll-link${on ? ' is-current' : ''}${on && inside ? ' is-inside' : ''}" href="${href}" data-link aria-label="${esc(label)}"${on ? ' aria-current="page"' : ''}>${roll(label)}</a>`;

/* The phone menu's moons (base.css .nav-moons): tossed up from the bottom
   and falling back, over and over — each its own size (rem), height (of
   the screen), rhythm, drift and spin, and one of four faces
   (public/media/menu). Decoration only. */
const MENU_MOONS = [
  { img: 1, x: 7, s: 3.4, h: 46, d: 3.4, delay: -0.6, dx: 10, spin: 120 },
  { img: 3, x: 24, s: 2.6, h: 30, d: 2.6, delay: -1.9, dx: -8, spin: -150 },
  { img: 2, x: 42, s: 4, h: 54, d: 3.9, delay: -2.8, dx: 6, spin: 90 },
  { img: 4, x: 60, s: 2.8, h: 36, d: 2.9, delay: -0.2, dx: -10, spin: -110 },
  { img: 1, x: 76, s: 3.6, h: 48, d: 3.6, delay: -1.3, dx: -6, spin: 140 },
  { img: 3, x: 89, s: 2.4, h: 26, d: 2.4, delay: -2.1, dx: 8, spin: -100 }
];
const menuMoons = () => `<div class="nav-moons" aria-hidden="true">${MENU_MOONS.map((m) =>
  `<i style="--x: ${m.x}%; --s: ${m.s}rem; --h: ${m.h}; --d: ${m.d}s; --delay: ${m.delay}s; --dx: ${m.dx}px; --spin: ${m.spin}deg; background-image: url(/media/menu/moon-${m.img}.webp)"></i>`).join('')}</div>`;

const header = (current, inside = false) => `  <header class="site-header">
    <!-- Hover: the letters jump one by one and the rocket flies a lap (fx/LogoRocket.js). -->
    <a class="logo" href="/" data-link aria-label="${esc(studio.wordmark)} — home">${logoSvg({ id: 'site-logo' })}</a>
    <!-- Phones: the links fold into a panel behind this (core/App.js bindMenu);
         open, a satellite circles the cross (base.css). -->
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open menu">
      <span class="menu-toggle-line"></span><span class="menu-toggle-line"></span><span class="menu-toggle-line"></span>
      <span class="menu-toggle-orbit" aria-hidden="true"></span>
    </button>
    <nav class="nav" id="site-nav" aria-label="Primary">
      ${menuMoons()}
      ${navItem('/work/', 'Work', current === 'projects', inside)}
      ${navItem('/info/', 'About', current === 'info')}
      ${navItem('/contact/', studio.contactLabel || 'Contact', current === 'contact')}
      <!-- Phones only: at the foot of the open menu, how to reach us. -->
      <div class="nav-foot">
        <span class="nav-foot-label">${esc(contact.title[0])}</span>
        <a class="nav-foot-mail" href="mailto:${esc(studio.email)}">${esc(studio.email)}</a>
        <span class="nav-foot-social">${studio.social.map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">${esc(s.label)} ↗</a>`).join('')}</span>
      </div>
    </nav>
  </header>`;

/* Where a wider-than-its-picture frame keeps the picture (`thumbFocus` in
   the CMS, 0 = its top … 1 = its bottom; left out: the middle): the Work
   page's cards are 1.62 : 1, the thumbnails 4 : 3, so each shows a
   stretch of its thumbnail and this picks which. (gl/MediaMesh.js) */
const focusAttr = (p) => (Number.isFinite(p.thumbFocus) ? ` data-focus="${Math.min(1, Math.max(0, p.thumbFocus))}"` : '');

/* On phones the <img> itself is what shows (src/core/Store.js isPhone):
   a project thumbnail offers its 960px WebP there, and keeps the part of
   it its `thumbFocus` names, as the WebGL plane does. (The planes always
   load `src`.) */
const mediaBlock = (src, alt, extra = '') => {
  const thumb = src.match(/^\/media\/([^/]+)\/featured\.jpg$/);
  const small = thumb && existsSync(join(root, 'public', 'media', thumb[1], 'featured-960.webp'));
  const set = small ? ` srcset="/media/${thumb[1]}/featured-960.webp 960w, ${src} 1600w" sizes="(max-width: 767px) 100vw, 50vw"` : '';
  const focus = extra.match(/data-focus="([\d.]+)"/);
  const pos = focus ? ` style="object-position: 50% ${(Number(focus[1]) * 100).toFixed(1)}%"` : '';
  return `<div class="media-wrapper" data-media ${extra}><img class="media" src="${src}"${set} alt="${esc(alt)}"${pos} loading="lazy" decoding="async" /></div>`;
};

/* Project pages show empty frames until the real photos are in — a project
   with `photos: true` shows its own, and setting this to true shows them
   everywhere. (An empty frame holds the layout; with no data-media, WebGL
   leaves it alone.) */
const WORK_PHOTOS = false;
const workMedia = (p, src, alt, extra = '') =>
  WORK_PHOTOS || p.photos ? mediaBlock(src, alt, extra) : '<div class="media-wrapper is-empty" aria-hidden="true"></div>';

const splitTitle = (lines) =>
  lines.map((l) => `<span class="line"><span class="line-inner">${esc(l)}</span></span>`).join('\n        ');

/* Text with each of us named in our own colour (the first mention). */
const teamNames = (text) =>
  team.reduce((t, m) => t.replace(m.name, `<span class="about-name" style="color: ${m.colour}">${m.name}</span>`), esc(text));

/* The closing screen — "Ready for liftoff?" — on the welcome page and
   About: planets shower down from the seam above and pile up along the
   bottom (fx/Finale.js, fx/PlanetShower.js). */
const finaleSection = () => {
  const chars = [...finale.button]
    .map((c, i) => `<span class="about-button-char" style="--i: ${i}" data-c="${c === ' ' ? ' ' : esc(c)}">${c === ' ' ? '&nbsp;' : esc(c)}</span>`)
    .join('');
  return `    <section class="finale" id="connect" aria-labelledby="finale-title">
      <canvas class="planet-canvas" aria-hidden="true"></canvas>
      <div class="finale-body">
        <h2 class="finale-title" id="finale-title">${finale.title.map((l) => `<span class="line"><span class="line-inner">${esc(l)}</span></span>`).join(' ')}</h2>
        <p class="finale-text subtext">${[].concat(finale.text).map((l) => `<span class="finale-line">${esc(l)}</span>`).join(' ')}</p>
        <div class="finale-cta">
          <a class="about-button finale-button" href="/contact/" data-link aria-label="${esc(finale.button)}">
            <span class="about-button-text" aria-hidden="true">${chars}</span>
          </a>
        </div>
      </div>
    </section>`;
};

/* ----------------------------------------------------------------- main */

/* Light lines keep their brightness as alpha; pencil on paper is inverted
   so the white paper drops out. Either way the source alpha masks it. */
const INK = {
  light: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.333 0.333 0.333 0 0',
  dark:  '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.6 -0.6 -0.6 0 1.6'
};

/* A finished neon portrait: the calm one, and the angry one stacked on top,
   hidden until a rock hits (fx/Duo.js). */
const portrait = (m) => `            <div class="sketch-svg sketch-portrait">
              <img class="sketch-face" src="${m.portrait}" alt="" width="800" height="1000" decoding="async" />
              <img class="sketch-face sketch-face-angry" data-src="${m.portraitAngry}" alt="" width="800" height="1000" decoding="async" />
            </div>`;

const sketch = (m, other) => {
  const w = 400;
  const h = Math.round(w / m.aspect);
  const art = m.portrait ? portrait(m) : `            <div class="sketch-svg">
            <svg class="sketch-vector" viewBox="0 0 ${w} ${h}" aria-hidden="true">
              <defs>
                <filter id="neon-${m.id}" x="-12%" y="-12%" width="124%" height="124%" color-interpolation-filters="sRGB">
                  <feImage class="eye-map" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="eyeMap" />
                  <feDisplacementMap class="eye-warp" in="SourceGraphic" in2="eyeMap" scale="0" xChannelSelector="R" yChannelSelector="G" result="eyes" />
                  <!-- Two expression stages, so one face can cross-fade into the next. -->
                  <feImage class="face-map" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="faceMapA" />
                  <feDisplacementMap class="face-warp" in="eyes" in2="faceMapA" scale="0" xChannelSelector="R" yChannelSelector="G" result="faceA" />
                  <feImage class="face-map" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="faceMapB" />
                  <feDisplacementMap class="face-warp" in="faceA" in2="faceMapB" scale="0" xChannelSelector="R" yChannelSelector="G" result="warped" />
                  <feColorMatrix in="warped" type="matrix" values="${INK[m.ink] || INK.light}" result="ink" />
                  <feComposite in="ink" in2="warped" operator="in" result="lines" />
                  <feFlood flood-color="${m.colour}" result="tint" />
                  <feComposite in="tint" in2="lines" operator="in" result="neon" />
                  <feGaussianBlur in="neon" stdDeviation="2.4" result="glowNear" />
                  <feGaussianBlur in="neon" stdDeviation="10" result="glowFar" />
                  <feMorphology in="lines" operator="erode" radius="0.5" result="thin" />
                  <feColorMatrix in="thin" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.7 0" result="core" />
                  <feMerge>
                    <feMergeNode in="glowFar" />
                    <feMergeNode in="glowNear" />
                    <feMergeNode in="neon" />
                    <feMergeNode in="core" />
                  </feMerge>
                </filter>
              </defs>
              <image href="${m.sketch}" width="${w}" height="${h}" preserveAspectRatio="xMidYMid meet" filter="url(#neon-${m.id})" />
            </svg>
            </div>`;
  return `        <div class="sketch sketch-${m.id}" data-sketch="${m.id}" style="--neon: ${m.colour}">
          <button class="sketch-hit" type="button" aria-label="${esc(m.name)}: throw a meteor at ${esc(other.name)}"></button>
          <div class="sketch-body">
${art}
          </div>
          <span class="sketch-name">${esc(m.name)}</span>
        </div>`;
};

/* The work, given a section of its own on the landing page: a pinned
   reel that the scroll pulls sideways (see Main.js). */
const showcaseSection = () => {
  const pad = (n) => String(n).padStart(2, '0');
  /* A 960px WebP alongside the full photo when there is one
     (scripts/media-variants.py): the card shows at most ~36vw (photo
     overscan and hover zoom included), full width on phones. */
  const srcset = (slug) => existsSync(join(root, 'public', 'media', slug, 'featured-960.webp'))
    ? ` srcset="/media/${slug}/featured-960.webp 960w, /media/${slug}/featured.jpg 1600w" sizes="(max-width: 767px) 100vw, 36vw"`
    : '';
  /* The first `showcase.count` projects (CMS: Home page). */
  const shown = projects.slice(0, Math.max(1, Math.min(showcase.count || projects.length, projects.length)));
  /* The stretch of the video a hover plays (fx/WaterReveal.js): past its
     title screen, which the thumbnail already shows. */
  const span = (p) => `${p.videoFrom > 0 ? ` data-video-from="${Number(p.videoFrom)}"` : ''}${p.videoTo > 0 ? ` data-video-to="${Number(p.videoTo)}"` : ''}`;
  /* Every card is still and whole (is-still): the CMS makes each thumbnail
     at the card's exact 4:3, so nothing about it is cropped here — no
     overscan, no sideways drift cutting off its edges. */
  const cards = shown
    .map((p, i) => `          <a class="show-card is-still" href="/work/${p.slug}/" data-link data-cursor="View"${p.video ? ` data-video="${esc(p.video)}"${span(p)}` : ''} style="--accent: ${p.accent}">
            <span class="show-card-inner">
              <span class="show-card-media"><img class="show-card-img" src="/media/${p.slug}/featured.jpg"${srcset(p.slug)} alt="${esc(p.name)}" loading="lazy" decoding="async" /></span>
              <span class="show-card-meta">
                <span class="show-card-name">${esc(p.name)}</span>
              </span>
            </span>
          </a>`)
    .join('\n');

  return `    <section class="showcase" id="work" aria-labelledby="showcase-title">
      <div class="showcase-stage">
        <div class="showcase-head">
          <div class="showcase-heading">
            <h2 class="showcase-title" id="showcase-title">${showcase.title.map((l) => `<span class="line"><span class="line-inner">${esc(l)}</span></span>`).join(' ')}</h2>
            <a class="showcase-all" href="/work/" data-link data-cursor="Open">
              <span class="showcase-all-text">${esc(showcase.more)}</span>
              <svg class="showcase-all-arrow" viewBox="0 0 48 48" aria-hidden="true"><path d="M10 38 38 10M16 10h22v22" /></svg>
            </a>
          </div>
          <span class="showcase-count" aria-hidden="true"><span class="showcase-count-now">01</span> / ${pad(shown.length)}</span>
        </div>
        <div class="showcase-rail">
          <div class="showcase-track">
${cards}
          </div>
          <!-- Touch tablets: the cards are swiped, not scrolled past — this says so, until they are (Main.js). -->
          <div class="showcase-swipe" aria-hidden="true">
            <svg class="showcase-swipe-hand" viewBox="0 0 24 24"><path d="M22 14a8 8 0 0 1-8 8"/><path d="M18 11v-1a2 2 0 0 0-2-2a2 2 0 0 0-2 2"/><path d="M14 10V9a2 2 0 0 0-2-2a2 2 0 0 0-2 2v1"/><path d="M10 9.5V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v10"/><path d="M18 11a2 2 0 1 1 4 0v3a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/></svg>
            <span class="showcase-swipe-text">Swipe for more</span>
          </div>
        </div>
        <div class="showcase-progress" aria-hidden="true"><span class="showcase-progress-bar"></span></div>
      </div>
    </section>`;
};

const mainPage = () => {
  const [prem, meet] = team;
  const actions = Array.from(
    { length: main.rocks },
    () => `          <button class="duo-action" type="button" aria-label="Throw a space rock">
            <canvas class="duo-action-rock" aria-hidden="true"></canvas>
          </button>`
  ).join('\n');

  /* Each letter carries a copy of itself (data-c) for the hover roll. */
  const rollChars = (text) => [...text]
    .map((c, i) => {
      const ch = c === ' ' ? '&nbsp;' : esc(c);
      const copy = c === ' ' ? '\u00a0' : esc(c);
      return `<span class="about-button-char" style="--i: ${i}" data-c="${copy}">${ch}</span>`;
    })
    .join('');
  const buttonChars = rollChars(main.about.button);

  /* A square frame with corner brackets in each person's colour: empty but
     for "Scroll down" until the first scroll cuts the photo in (Main.js),
     and our name set under it (read out whole; the rolling letters are for
     the eye only). */
  const frame = (m, side) => `      <figure class="about-frame about-frame-${side}" data-frame="${m.id}" style="--neon: ${m.colour}">
        <div class="about-photos">
          <span class="about-hint" aria-hidden="true">
            <span class="about-hint-text">${esc(main.about.hint)}</span>
            <svg class="about-hint-arrow" viewBox="0 0 16 10"><path d="M1 1.5 8 8.5l7-7" /></svg>
          </span>
          <img class="about-photo" src="${m.photo}" alt="${esc(m.photoAlt)}" width="960" height="960" decoding="async" fetchpriority="low" />
          <span class="about-flash" aria-hidden="true"></span>
        </div>
        <figcaption class="about-who">
          <span class="sr-only">${esc(m.name)} ${esc(m.surname)}</span>
          <span class="about-who-name" aria-hidden="true"><span class="about-who-first">${[...m.name].map((c, i) => `<span class="about-who-char" style="--i: ${i}" data-c="${esc(c)}">${esc(c)}</span>`).join('')}</span></span>
          <span class="about-who-last" aria-hidden="true">${esc(m.surname)}</span>
        </figcaption>
      </figure>`;

  return shell({
    title: studio.name,
    description: studio.description,
    pageId: 'main',
    body: `<div class="page" id="main" data-page="main">
  <div class="page-content" id="page-content" tabindex="-1">
${header('main')}

    <!-- One screen. The first scroll glides on to About and the rocks
         travel down with the viewer (see Main.js). -->
    <section class="hero" aria-label="Welcome">
      <div class="hero-stage">
      <div class="hero-text">
        <h1 class="title" data-split>
        ${splitTitle(main.title)}
        </h1>
        <p class="text hero-intro subtext" data-split-lines>${esc(main.intro).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>
        <a class="scroll-cue" href="#about">
          <span class="scroll-cue-track" aria-hidden="true"><span class="scroll-cue-spark"></span></span>
          <svg class="scroll-cue-head" viewBox="0 0 16 10" aria-hidden="true"><path d="M1 1.5 8 8.5l7-7" /></svg>
          <span class="scroll-cue-label">${esc(main.scrollLabel)}</span>
        </a>
      </div>

      <div class="duo" data-duo>
${sketch(prem, meet)}
${sketch(meet, prem)}
        <div class="duo-actions" role="group" aria-label="Space rocks">
${actions}
        </div>
      </div>
      </div>
    </section>

    <!-- A tall runway with a pinned stage: scrolling through it plays the
         About sequence forwards, scrolling back plays it in reverse. -->
    <section class="about" id="about" aria-label="About us">
      <div class="about-stage">
${frame(meet, 'left')}
        <div class="about-body">
          <p class="about-text">${teamNames(main.about.text)}</p>
          <div class="about-cta">
            <a class="about-button" href="/info/" data-link aria-label="${esc(main.about.button)}">
              <span class="about-button-text" aria-hidden="true">${buttonChars}</span>
            </a>
          </div>
        </div>
${frame(prem, 'right')}
      </div>
    </section>

${showcaseSection()}

${finaleSection()}

  </div>
</div>`
  });
};

/* ------------------------------------------------------------- projects */

const projectsPage = () => {
  const cards = projects
    .map(
      (p, i) => `        <li class="project-item">
          <a class="project" href="/work/${p.slug}/" data-link data-project="${i}" aria-label="${esc(p.name)}">
            ${mediaBlock(`/media/${p.slug}/featured.jpg`, p.name, `data-video="/media/${p.slug}/preview.jpg"${focusAttr(p)}`)}
            <span class="project-meta"><span class="project-name">${esc(p.name)}</span><span class="project-year">${esc(p.year)}</span></span>
          </a>
        </li>`
    )
    .join('\n');

  const titles = projects
    .map(
      (p, i) =>
        `          <li><a class="project-title link" href="/work/${p.slug}/" data-link data-index="${i}"><span class="line-inner">${esc(p.name)}</span></a></li>`
    )
    .join('\n');

  /* Stacked previews under the index — one per project, cross-faded by hover. */
  const previews = projects
    .map(
      (p, i) =>
        `          <div class="media-wrapper" data-media data-preview="${i}"${focusAttr(p)}><img class="media" src="/media/${p.slug}/featured.jpg" alt="" loading="lazy" decoding="async" /></div>`
    )
    .join('\n');

  return shell({
    title: 'Work',
    description: studio.description,
    pageId: 'projects',
    body: `<div class="page" id="projects" data-page="projects">
  <div class="page-content" id="page-content" tabindex="-1">
${header('projects')}

    <div class="text-wrapper">
      <h1 class="title" data-split>
        ${splitTitle(workIndex.title)}
      </h1>
      <p class="text subtext" data-split-lines>${esc(workIndex.intro)}</p>
    </div>

    <section class="work" aria-label="Selected work">
      <ul class="projects">
${cards}
      </ul>

      <aside class="project-index" aria-label="Projects">
        <ul class="project-titles">
${titles}
        </ul>
        <div class="project-previews" aria-hidden="true">
${previews}
        </div>
      </aside>
    </section>

  </div>
</div>`
  });
};

/* ----------------------------------------------------------------- work */

const workPage = (p) => {
  const next = getNext(p.slug);
  const prev = getPrev(p.slug);
  /* The WebP copy when there is one (scripts/media-variants.py) — the same
     picture, lighter. */
  const shot = (i) => {
    const webp = `/media/${p.slug}/0${i + 1}.webp`;
    return existsSync(join(root, 'public', webp)) ? webp : `/media/${p.slug}/0${i + 1}.jpg`;
  };
  const shots = Array.from({ length: p.shots }, (_, i) =>
    `        ${workMedia(p, shot(i), `${p.name} — detail ${i + 1}`)}`
  ).join('\n');

  /* Certificates pinned either side of the video (Work.js swings them and
     opens one whole on a click; without script, the link opens the image). */
  const certs = p.certificates || [];
  const cert = (c, side) => `<figure class="cert cert-${side}">
        <a class="cert-hang" href="${esc(c.src)}" target="_blank" rel="noopener" data-cursor="View" aria-label="View ${esc(c.name)}'s certificate of appreciation">
          <span class="cert-paper">
            <img class="cert-img" src="${esc(c.src)}" alt="Certificate of appreciation — ${esc(c.name)}" width="1055" height="1491" decoding="async" />
            <span class="cert-curl" aria-hidden="true"></span>
          </span>
        </a>
        <span class="cert-pin" aria-hidden="true"></span>
      </figure>`;

  return shell({
    title: `${studio.name} — ${p.name}`,
    description: p.description,
    pageId: 'work',
    body: `<div class="page" id="work" data-page="work" data-slug="${p.slug}" data-accent="${p.accent}">
  <div class="page-content" id="page-content" tabindex="-1">
${header('projects', true)}

    <a class="back link" href="/work/" data-link><span class="line-inner"><span class="back-arrow" aria-hidden="true">&larr;</span>Work</span></a>

    <h1 class="title" data-split>
        ${splitTitle([p.name])}
    </h1>

    <div class="hero-media${certs.length ? ' has-certs' : ''}">
      ${certs[0] ? cert(certs[0], 'left') : ''}
      ${p.pageVideo && p.video
        ? `<div class="work-film"><video class="work-film-video" src="${esc(p.video)}" autoplay muted loop playsinline preload="auto" aria-label="${esc(p.name)}, a walkthrough"></video></div>`
        : workMedia(p, `/media/${p.slug}/featured.jpg`, p.name, focusAttr(p).trim())}
      ${certs[1] ? cert(certs[1], 'right') : ''}
    </div>

    <p class="description subtext" data-split-lines>${esc(p.description)}</p>

    <dl class="metas">
      <div class="meta"><dt class="label">Year</dt><dd class="text">${esc(p.year)}</dd></div>
      ${p.github ? `<div class="meta"><dt class="label">Code</dt><dd><a class="text link meta-link" href="${esc(p.github)}" target="_blank" rel="noopener noreferrer"><span class="line-inner">GitHub<span class="meta-arrow" aria-hidden="true">&nearr;</span></span></a></dd></div>` : ''}
    </dl>

    <div class="content">
${shots}
    </div>

    <!-- The project before and the one after (the list wraps round). -->
    <nav class="work-bottom" aria-label="More projects">
      <a class="project-step project-step--prev link" href="/work/${prev.slug}/" data-link>
        <span class="label"><span aria-hidden="true">&larr; </span>Previous project</span>
        <span class="text"><span class="line-inner">${esc(prev.name)}</span></span>
      </a>
      <a class="project-step project-step--next link" href="/work/${next.slug}/" data-link>
        <span class="label">Next project<span aria-hidden="true"> &rarr;</span></span>
        <span class="text"><span class="line-inner">${esc(next.name)}</span></span>
      </a>
    </nav>

  </div>
</div>`
  });
};

/* ----------------------------------------------------------------- info */

/* One of About's two boxes: a heading and its list inside a double
   outline. The outline is drawn in SVG, in the box's own 338 × 422 units
   (the box keeps that shape, so it scales evenly), so it can draw itself on
   as the boxes come into view; each line of text rises in behind its own
   mask (pages.css, Info.js). The two lengths are each outline's perimeter,
   for the drawing. */
const OUTLINES = [
  { x: 0.75, y: 0.75, w: 336.5, h: 420.5, r: 16 },
  { x: 10.5, y: 10.5, w: 317, h: 401, r: 11 }
];
const perimeter = ({ w, h, r }) => (2 * (w + h - 4 * r) + 2 * Math.PI * r).toFixed(1);
const infoCard = (key, title, list, i) => `        <section class="info-card info-card--${key}" aria-labelledby="info-${key}" style="--i: ${i}">
          <svg class="info-card-frame" viewBox="0 0 338 422" aria-hidden="true">${OUTLINES.map((o) => `<rect class="info-card-edge" x="${o.x}" y="${o.y}" width="${o.w}" height="${o.h}" rx="${o.r}" style="--len: ${perimeter(o)}" />`).join('')}</svg>
          <div class="info-card-inner">
            <h2 class="info-card-title" id="info-${key}"><span class="info-card-rise">${esc(title)}</span></h2>
            ${list}
          </div>
        </section>`;

/* The Offer: the services, one per line. */
const offerCard = ({ title, items }) => infoCard('offer', title,
  `<ul class="info-card-list">${items.map((x, j) => `<li style="--j: ${j}"><span class="info-card-rise">${esc(x)}</span></li>`).join('')}</ul>`, 0);

/* The Work: its kinds, numbered, each a button that opens its panel —
   beside the box, level with the row, on a wide screen with a mouse;
   under it otherwise (pages.css, Info.js). The panels share one place:
   only the open one shows. */
/* Under the box (phones, tablets): a nudge that the rows open, gone once
   one has been (pages.css .info-work-hint). The buttons say so themselves
   to a screen reader (aria-expanded), so it's hidden from one. */
const WORK_HINT = '<p class="info-work-hint" aria-hidden="true"><span class="info-work-hint-ping"></span>'
  + '<span class="info-work-hint-tap">Tap one to peek inside</span><span class="info-work-hint-click">Click one to peek inside</span></p>';
const workCard = ({ title, kinds }) => {
  const no = (k) => String(k + 1).padStart(2, '0');
  const rows = kinds.map((kind, k) => `<li style="--j: ${k}"><button class="info-work-kind" type="button" data-kind="${k}" aria-expanded="false" aria-controls="info-work-${k}"><span class="info-card-rise"><span class="info-work-no">${no(k)}</span><span class="info-work-name">${esc(kind.name)}</span><span class="info-work-arrow" aria-hidden="true">→</span><span class="info-work-plus" aria-hidden="true"></span></span></button></li>`).join('');
  const panels = kinds.map((kind, k) => `
              <div class="info-work-detail" id="info-work-${k}" role="region" aria-label="${esc(kind.name)}">
                <p class="info-work-head" style="--k: 0"><span class="info-work-no">${no(k)}</span> ${esc(kind.name)}</p>
                <p class="info-work-text" style="--k: 1">${esc(kind.text)}</p>
                <ul class="info-work-items">${kind.items.map((x, j) => `<li style="--k: ${j + 2}">${esc(x)}</li>`).join('')}</ul>
              </div>`).join('');
  return `        <div class="info-work">
${infoCard('work', title, `<ol class="info-card-list info-work-list">${rows}</ol>${WORK_HINT}`, 1)}
          <span class="info-work-line" aria-hidden="true"></span>
          <div class="info-work-panel">
            <div class="info-work-clip"><div class="info-work-box"><div class="info-work-details">${panels}
            </div></div></div>
          </div>
        </div>`;
};

const infoPage = () => shell({
  title: 'About',
  description: info.lead,
  pageId: 'info',
  body: `<div class="page" id="info" data-page="info">
  <div class="page-content" id="page-content" tabindex="-1">
${header('info')}

    <!-- The heading and a few lines about us on the left; the photo on the
         right, level with the top of the heading. -->
    <div class="info-grid">
      <div class="info-body">
        <h1 class="title" data-split>
        ${splitTitle(info.title)}
        </h1>
        <p class="lead subtext" data-split-lines>${teamNames(info.lead)}</p>
      </div>
      <div class="info-portrait">
        ${mediaBlock('/media/studio/portrait.jpg', 'Prem Kajiwala and Meet Raval, The Nerds', 'data-still')}
      </div>
    </div>

    <!-- Below, in a section of their own: what we offer and what we make,
         two boxes stepping down the page. -->
    <section class="info-services" aria-label="What we do">
      <div class="info-cards">
${offerCard(info.offer)}
${workCard(info.work)}
      </div>
    </section>

${finaleSection()}

  </div>
</div>`
});

/* -------------------------------------------------------------- contact */

const contactPage = () => {
  const link = (href, text) => `<a class="link" href="${esc(href)}"><span class="line-inner">${esc(text)}</span></a>`;
  const value = (d) => {
    if (d.lines) {
      return `<ul class="contact-lines">${d.lines.map((l) => `<li><span class="contact-who">${esc(l.name)}</span>${link(l.href, l.value)}</li>`).join('')}</ul>`;
    }
    return d.href ? link(d.href, d.value) : esc(d.value);
  };
  const details = contact.details
    .map((d) => `        <div class="contact-detail${d.lines ? ' contact-detail-tall' : ''}"><dt class="label">${esc(d.label)}</dt><dd class="text">${value(d)}</dd></div>`)
    .join('\n');
  /* **word** renders bold (the meta description gets it plain). */
  const lead = esc(contact.lead).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const leadPlain = contact.lead.replace(/\*\*/g, '');
  const social = studio.social
    .map((s) => `<li><a class="text link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"><span class="line-inner">${esc(s.label)} &nearr;</span></a></li>`)
    .join('');

  /* The enquiry form (core/ContactForm.js sends it). Its errors and the
     sent state are written by the script; the labels are here. */
  const { form } = contact;
  /* Each question with its answer in a rounded box (pages.css). */
  const field = (f) => {
    const id = `cf-${f.name}`;
    const attrs = `class="field-input" id="${id}" name="${f.name}" maxlength="${f.max}" aria-describedby="${id}-error"${f.required ? ' required' : ''}`;
    const control = f.type === 'textarea'
      ? `<textarea ${attrs} rows="${f.rows || 4}"></textarea>`
      : `<input ${attrs} type="${f.type}" autocomplete="${f.autocomplete || 'off'}"${f.type === 'tel' ? ' inputmode="tel"' : ''} />`;
    const optional = f.required ? '' : ` <span class="field-optional">(${esc(form.optional)})</span>`;
    return `          <div class="field${f.type === 'textarea' ? ' field-wide' : ''}" data-field="${f.name}">
            <label class="field-label" for="${id}">${esc(f.label)}${optional}</label>
            <div class="field-control">
              ${control}
            </div>
            <p class="field-error" id="${id}-error"></p>
          </div>`;
  };
  const shoutChars = [...form.button]
    .map((c, i) => `<span class="shout-char" style="--i: ${i}" data-c="${c === ' ' ? ' ' : esc(c)}">${c === ' ' ? '&nbsp;' : esc(c)}</span>`)
    .join('');

  return shell({
    title: studio.contactLabel,
    description: leadPlain,
    pageId: 'contact',
    body: `<div class="page" id="contact" data-page="contact">
  <div class="page-content" id="page-content" tabindex="-1">
${header('contact')}

    <div class="contact-grid">
      <h1 class="title" data-split>
        ${splitTitle(contact.title)}
      </h1>

      <p class="lead subtext" data-split-lines>${lead}</p>

      <form class="contact-form" data-contact-form data-mailto="${esc(studio.email)}" data-messages="${esc(JSON.stringify({ failed: form.failed, ...form.errors }))}" novalidate>
${form.fields.map(field).join('\n')}
          <!-- A trap for bots: hidden from people, filled in by scripts. -->
          <div class="field-trap" aria-hidden="true">
            <label>Website <input type="text" name="website" tabindex="-1" autocomplete="off" /></label>
          </div>
          <div class="contact-form-foot">
            <button class="shout-button" type="submit" aria-label="${esc(form.button)}">
              <span class="shout-text" aria-hidden="true">${shoutChars}</span>
            </button>
            <p class="form-status" role="status" aria-live="polite"></p>
          </div>
        <div class="form-sent" tabindex="-1" hidden>
          <p class="form-sent-title">${esc(form.sent.title)}</p>
          <p class="text">${esc(form.sent.text)}</p>
        </div>
      </form>

      <dl class="contact-details">
${details}
        <div class="contact-detail"><dt class="label">${esc(contact.socials)}</dt><dd><ul class="social-list">${social}</ul></dd></div>
      </dl>
    </div>

  </div>
</div>`
  });
};

/* ---------------------------------------------------------- maintenance */

/* The page on its own: none of the site's app or 3D, just its own small
   script (src/maintenance.js — the stars and its stylesheet), so it's up
   at once. Not for search engines. */
const maintenancePage = () => {
  const m = maintenance;
  const title = `${studio.name} — ${m.kicker}`;
  const description = m.message || m.title;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta name="robots" content="noindex" />
<meta name="theme-color" content="#05060F" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:site_name" content="${esc(studio.name)}" />
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32" />
<link rel="icon" href="/favicon-48.png" type="image/png" sizes="48x48" />
<link rel="icon" href="/icon-192.png" type="image/png" sizes="192x192" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<style>html { background: #05060F; color-scheme: dark; }</style>
</head>
<body class="maint">
<canvas class="maint-stars" aria-hidden="true"></canvas>
<main class="maint-main">
  <span class="logo maint-logo" role="img" aria-label="${esc(studio.wordmark)}">${logoSvg({ id: 'maint-logo' })}</span>
  <div class="maint-orbit" aria-hidden="true">
    <span class="maint-orbit-ring"></span>
    <span class="maint-orbit-arm"><i class="maint-orbit-a"></i><i class="maint-orbit-b"></i></span>
  </div>
  <p class="maint-kicker">${esc(m.kicker)}</p>
  <h1 class="maint-title">${esc(m.title)}</h1>
  ${m.message ? `<p class="maint-text">${esc(m.message)}</p>` : ''}
  ${m.back ? `<p class="maint-back">${esc(m.back)}</p>` : ''}
  <p class="maint-reach">${esc(m.reach)} <a href="mailto:${esc(studio.email)}">${esc(studio.email)}</a></p>
</main>
<script type="module" src="/src/maintenance.js"></script>
</body>
</html>
`;
};

/* ----------------------------------------------------------------- emit */

const write = (relDir, html) => {
  const dir = join(root, relDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html, 'utf8');
  console.log('  ✓', join(relDir || '.', 'index.html'));
};

console.log(BUILD && maintenance.on ? 'Generating pages… (maintenance is on: the maintenance page at every address)' : 'Generating pages…');
if (BUILD && maintenance.on) {
  const page = maintenancePage();
  ['', 'work', 'info', 'contact', ...projects.map((p) => join('work', p.slug))].forEach((dir) => write(dir, page));
} else {
  write('', mainPage());
  write('work', projectsPage());
  write('info', infoPage());
  write('contact', contactPage());
  projects.forEach((p) => write(join('work', p.slug), workPage(p)));
}

/* The preview at /maintenance/: on this computer only — never built into
   the published site (where it'd be a page anyone could stumble on). */
if (BUILD) rmSync(join(root, 'maintenance'), { recursive: true, force: true });
else write('maintenance', maintenancePage());

/* A project's page from before it was deleted or hidden (in the CMS) would
   still be built and served: clear those out. (Generated, never edited —
   each holds only its index.html.) */
const keep = new Set(projects.map((p) => p.slug));
for (const entry of readdirSync(join(root, 'work'), { withFileTypes: true })) {
  if (!entry.isDirectory() || keep.has(entry.name)) continue;
  const dir = join(root, 'work', entry.name);
  if (readdirSync(dir).every((f) => f === 'index.html')) {
    rmSync(dir, { recursive: true, force: true });
    console.log('  ✗', join('work', entry.name), '(no longer a project)');
  }
}

/* The tab icon is the logo on space, as files in public/ (favicon-32.png,
   favicon-48.png, icon-192.png, icon-512.png, apple-touch-icon.png) — not
   made here. */
console.log(`Done — ${projects.length + 4} pages.`);
