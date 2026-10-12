/**
 * Generates every route's index.html from src/content/site.js.
 * Run with `npm run pages` (wired into predev / prebuild).
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { studio, main, team, workIndex, info, contact, showcase, finale, projects, getNext } from '../src/content/site.js';
import { logoSvg } from '../src/content/logo.js';
import { astronaut } from '../src/content/astronauts.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<!-- The first paint, before the stylesheet arrives (in dev it's injected by
     script): dark, with the loader covering the page. The loader's contents
     stay hidden until base.css sets --styled, so nothing shows unstyled. -->
<style>
  html { background: #05060F; color-scheme: dark; scrollbar-width: none; }
  html::-webkit-scrollbar { display: none; }
  .loader { position: fixed; inset: 0; z-index: 100; background: #05060F; }
  .loader > * { visibility: var(--styled, hidden); }
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

const navItem = (href, label, on) =>
  `<a class="nav-link roll-link${on ? ' is-current' : ''}" href="${href}" data-link aria-label="${esc(label)}"${on ? ' aria-current="page"' : ''}>${roll(label)}</a>`;

const header = (current) => `  <header class="site-header">
    <!-- Hover: the letters jump one by one and the rocket flies a lap (fx/LogoRocket.js). -->
    <a class="logo" href="/" data-link aria-label="${esc(studio.wordmark)} — home">${logoSvg({ id: 'site-logo' })}</a>
    <!-- Phones: the links fold into a panel behind this (core/App.js bindMenu). -->
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Open menu">
      <span class="menu-toggle-line"></span><span class="menu-toggle-line"></span><span class="menu-toggle-line"></span>
    </button>
    <nav class="nav" id="site-nav" aria-label="Primary">
      ${navItem('/work/', 'Work', current === 'projects')}
      ${navItem('/info/', 'About', current === 'info')}
      ${navItem('/contact/', studio.contactLabel || 'Contact', current === 'contact')}
    </nav>
  </header>`;

const mediaBlock = (src, alt, extra = '') =>
  `<div class="media-wrapper" data-media ${extra}><img class="media" src="${src}" alt="${esc(alt)}" loading="lazy" decoding="async" /></div>`;

/* Project pages show empty frames until the real photos are in — a project
   with `photos: true` shows its own, and setting this to true shows them
   everywhere. (An empty frame holds the layout; with no data-media, WebGL
   leaves it alone.) */
const WORK_PHOTOS = false;
const workMedia = (p, src, alt) =>
  WORK_PHOTOS || p.photos ? mediaBlock(src, alt) : '<div class="media-wrapper is-empty" aria-hidden="true"></div>';

const splitTitle = (lines) =>
  lines.map((l) => `<span class="line"><span class="line-inner">${esc(l)}</span></span>`).join('\n        ');

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
        <p class="finale-text">${[].concat(finale.text).map((l) => `<span class="finale-line">${esc(l)}</span>`).join(' ')}</p>
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
  const cards = projects
    .map((p, i) => `          <a class="show-card${p.screenshot ? ' is-still' : ''}" href="/work/${p.slug}/" data-link data-cursor="View"${p.video ? ` data-video="${esc(p.video)}"` : ''} style="--accent: ${p.accent}">
            <span class="show-card-inner">
              <span class="show-card-media"><img class="show-card-img" src="/media/${p.slug}/featured.jpg"${srcset(p.slug)} alt="${esc(p.name)}" loading="lazy" decoding="async" /></span>
              <span class="show-card-meta">
                <span class="show-card-no">${pad(i + 1)}</span>
                <span class="show-card-name">${esc(p.name)}</span>
                <span class="show-card-year">${esc(p.year)}</span>
              </span>
              <span class="show-card-excerpt">${esc(p.excerpt)} &middot; ${esc(p.role)}</span>
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
              <span class="showcase-all-sub">${projects.length} projects</span>
              <svg class="showcase-all-arrow" viewBox="0 0 48 48" aria-hidden="true"><path d="M10 38 38 10M16 10h22v22" /></svg>
            </a>
          </div>
          <span class="showcase-count" aria-hidden="true"><span class="showcase-count-now">01</span> / ${pad(projects.length)}</span>
        </div>
        <div class="showcase-track">
${cards}
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

  /* A spaceship porthole (main-page.css): a riveted metal rim with a status
     light, and through the glass each of us in our own cabin, as a cartoon
     astronaut (content/astronauts.js) — a console of blinking lights in
     front, space drifting past the window behind. A shutter covers it
     until the first scroll irises it open. */
  const LEDS = ['neon', 'amber', 'neon', 'white', 'red', 'neon', 'amber'];
  const porthole = (m, side) => `      <figure class="porthole porthole-${side}" data-porthole="${m.id}" style="--neon: ${m.colour}">
        <div class="porthole-body">
          <div class="porthole-rim" aria-hidden="true">${Array.from({ length: 8 }, (_, i) => `<span class="porthole-bolt" style="--i: ${i}"></span>`).join('')}</div>
          <div class="porthole-window">
            <div class="porthole-shutter" aria-hidden="true">
              <span class="porthole-hint">${esc(main.about.hint)}</span>
              <svg class="porthole-hint-arrow" viewBox="0 0 16 10"><path d="M1 1.5 8 8.5l7-7" /></svg>
            </div>
            <div class="porthole-view">
              <div class="porthole-space" aria-hidden="true">
                <span class="porthole-stars"></span>
                <span class="porthole-stars porthole-stars-near"></span>
                <span class="porthole-rock porthole-rock-1"></span>
                <span class="porthole-rock porthole-rock-2"></span>
                <span class="porthole-rock porthole-rock-3"></span>
              </div>
              <div class="porthole-cabin" aria-hidden="true"></div>
              <div class="porthole-crew">
                <div class="porthole-crew-wave">
${astronaut(m.id, { mirror: side === 'right', label: `${esc(m.name)}, as a cartoon astronaut` })}
                </div>
              </div>
              <div class="porthole-console" aria-hidden="true">
                <span class="porthole-screen"></span>
                ${LEDS.map((c, i) => `<span class="porthole-led porthole-led-${c}" style="--i: ${i}"></span>`).join('')}
              </div>
            </div>
            <div class="porthole-glass" aria-hidden="true"></div>
          </div>
          <span class="porthole-ring" aria-hidden="true"></span>
        </div>
      </figure>`;

  return shell({
    title: `${studio.name} — ${studio.tagline}`,
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
        <p class="text hero-intro" data-split-lines>${esc(main.intro).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')}</p>
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
        <div class="about-pair">
${porthole(meet, 'left')}
${porthole(prem, 'right')}
        </div>
        <div class="about-body">
          <p class="about-text">${team.reduce((t, m) => t.replace(m.name,`<span class="about-name" style="color: ${m.colour}">${m.name}</span>`), esc(main.about.text))}</p>
          <div class="about-cta">
            <a class="about-button" href="/info/" data-link aria-label="${esc(main.about.button)}">
              <span class="about-button-text" aria-hidden="true">${buttonChars}</span>
            </a>
          </div>
        </div>
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
            ${mediaBlock(`/media/${p.slug}/featured.jpg`, p.name, `data-video="/media/${p.slug}/preview.jpg"`)}
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
        `          <div class="media-wrapper" data-media data-preview="${i}"><img class="media" src="/media/${p.slug}/featured.jpg" alt="" loading="lazy" decoding="async" /></div>`
    )
    .join('\n');

  return shell({
    title: `${studio.name} — Work`,
    description: studio.description,
    pageId: 'projects',
    body: `<div class="page" id="projects" data-page="projects">
  <div class="page-content" id="page-content" tabindex="-1">
${header('projects')}

    <div class="text-wrapper">
      <h1 class="title" data-split>
        ${splitTitle(workIndex.title)}
      </h1>
      <p class="text" data-split-lines>${esc(workIndex.intro)}</p>
    </div>

    <section class="work" aria-label="Selected work">
      <ul class="projects">
${cards}
      </ul>

      <aside class="project-index">
        <span class="project-index-title">${esc(workIndex.indexLabel)}</span>
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
  /* The WebP copy when there is one (scripts/media-variants.py) — the same
     picture, lighter. */
  const shot = (i) => {
    const webp = `/media/${p.slug}/0${i + 1}.webp`;
    return existsSync(join(root, 'public', webp)) ? webp : `/media/${p.slug}/0${i + 1}.jpg`;
  };
  const shots = Array.from({ length: p.shots }, (_, i) =>
    `        ${workMedia(p, shot(i), `${p.name} — detail ${i + 1}`)}`
  ).join('\n');

  const deliverables = p.deliverables
    .map((d) => `<li class="text">${esc(d)}</li>`)
    .join('');

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
${header('projects')}

    <a class="back link" href="/work/" data-link><span class="line-inner"><span class="back-arrow" aria-hidden="true">&larr;</span>Work</span></a>

    <h1 class="title" data-split>
        ${splitTitle([p.name])}
    </h1>

    <div class="hero-media${certs.length ? ' has-certs' : ''}">
      ${certs[0] ? cert(certs[0], 'left') : ''}
      ${p.pageVideo && p.video
        ? `<div class="work-film"><video class="work-film-video" src="${esc(p.video)}" autoplay muted loop playsinline preload="auto" aria-label="${esc(p.name)}, a walkthrough"></video></div>`
        : workMedia(p, `/media/${p.slug}/featured.jpg`, p.name)}
      ${certs[1] ? cert(certs[1], 'right') : ''}
    </div>

    <p class="description" data-split-lines>${esc(p.description)}</p>

    <dl class="metas">
      <div class="meta"><dt class="label">Year</dt><dd class="text">${esc(p.year)}</dd></div>
      <div class="meta"><dt class="label">Role</dt><dd class="text">${esc(p.role)}</dd></div>
      <div class="meta"><dt class="label">Scope</dt><dd><ul class="meta-list">${deliverables}</ul></dd></div>
      ${p.github ? `<div class="meta"><dt class="label">Code</dt><dd><a class="text link" href="${esc(p.github)}" target="_blank" rel="noopener noreferrer"><span class="line-inner">GitHub &nearr;</span></a></dd></div>` : ''}
    </dl>

    <div class="content">
${shots}
    </div>

    <div class="work-bottom">
      <a class="next-project link" href="/work/${next.slug}/" data-link>
        <span class="label">Next project</span>
        <span class="text"><span class="line-inner">${esc(next.name)}</span></span>
      </a>
    </div>

  </div>
</div>`
  });
};

/* ----------------------------------------------------------------- info */

const infoPage = () => shell({
  title: `${studio.name} — About`,
  description: info.lead,
  pageId: 'info',
  body: `<div class="page" id="info" data-page="info">
  <div class="page-content" id="page-content" tabindex="-1">
${header('info')}

    <h1 class="title" data-split>
        ${splitTitle(info.title)}
    </h1>

    <div class="info-grid">
      <div class="info-body">
        <p class="lead" data-split-lines>${esc(info.lead)}</p>
      </div>
      <div class="info-portrait">
        ${mediaBlock('/media/studio/portrait.jpg', 'The studio')}
      </div>
    </div>

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
     sending/sent states are written by the script; the labels are here. */
  const { form } = contact;
  const field = (f) => {
    const id = `cf-${f.name}`;
    const attrs = `class="field-input" id="${id}" name="${f.name}" maxlength="${f.max}" aria-describedby="${id}-error"${f.required ? ' required' : ''}`;
    const control = f.type === 'textarea'
      ? `<textarea ${attrs} rows="${f.rows || 4}"></textarea>`
      : `<input ${attrs} type="${f.type}" autocomplete="${f.autocomplete || 'off'}"${f.type === 'tel' ? ' inputmode="tel"' : ''} />`;
    const optional = f.required ? '' : ` <span class="field-optional">(${esc(form.optional)})</span>`;
    return `          <div class="field${f.type === 'textarea' ? ' field-wide' : ''}" data-field="${f.name}">
            <label class="field-label" for="${id}">${esc(f.label)}${optional}</label>
            ${control}
            <p class="field-error" id="${id}-error"></p>
          </div>`;
  };
  const shoutChars = [...form.button]
    .map((c, i) => `<span class="shout-char" style="--i: ${i}" data-c="${c === ' ' ? ' ' : esc(c)}">${c === ' ' ? '&nbsp;' : esc(c)}</span>`)
    .join('');

  return shell({
    title: `${studio.name} — Contact`,
    description: leadPlain,
    pageId: 'contact',
    body: `<div class="page" id="contact" data-page="contact">
  <div class="page-content" id="page-content" tabindex="-1">
${header('contact')}

    <div class="contact-grid">
      <h1 class="title" data-split>
        ${splitTitle(contact.title)}
      </h1>

      <p class="lead" data-split-lines>${lead}</p>

      <form class="contact-form" data-contact-form data-mailto="${esc(studio.email)}" data-messages="${esc(JSON.stringify({ sending: form.sending, failed: form.failed, ...form.errors }))}" novalidate>
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

/* ----------------------------------------------------------------- emit */

const write = (relDir, html) => {
  const dir = join(root, relDir);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'index.html'), html, 'utf8');
  console.log('  ✓', join(relDir || '.', 'index.html'));
};

console.log('Generating pages…');
write('', mainPage());
write('work', projectsPage());
write('info', infoPage());
write('contact', contactPage());
projects.forEach((p) => write(join('work', p.slug), workPage(p)));

/* favicon */
mkdirSync(join(root, 'public'), { recursive: true });
writeFileSync(
  join(root, 'public', 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48"><rect width="48" height="48" fill="#05060F"/><circle cx="19" cy="24" r="10" fill="#F4F3EE"/><circle cx="29" cy="24" r="10" fill="#F4F3EE" fill-opacity=".55"/></svg>`,
  'utf8'
);
console.log('  ✓ public/favicon.svg');
console.log(`Done — ${projects.length + 4} pages.`);
