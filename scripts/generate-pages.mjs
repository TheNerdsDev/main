/**
 * Generates every route's index.html from src/content/site.js.
 * Run with `npm run pages` (wired into predev / prebuild).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { studio, main, team, workIndex, info, contact, showcase, projects, getNext } from '../src/content/site.js';

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
<link rel="preload" as="image" href="/textures/noise.png" />
</head>
<body class="${bodyClass}">
<a class="skip-link" href="#page-content">Skip to content</a>

<div class="loader" role="status" aria-live="polite" aria-label="Loading">
  <div class="loader-icon">
    <svg class="loader-icon-inner" viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <circle class="loader-dot loader-dot-a" cx="18" cy="24" r="11" />
      <circle class="loader-dot loader-dot-b" cx="30" cy="24" r="11" />
    </svg>
  </div>
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

const header = (current) => `  <header class="site-header">
    <a class="logo link" href="/" data-link><span class="line-inner">${esc(studio.wordmark)}</span></a>
    <nav class="nav" aria-label="Primary">
      <a class="nav-link link${current === 'projects' ? ' is-current' : ''}" href="/work/" data-link><span class="line-inner">Work</span></a>
      <a class="nav-link link${current === 'info' ? ' is-current' : ''}" href="/info/" data-link><span class="line-inner">Info</span></a>
      <a class="nav-link link${current === 'contact' ? ' is-current' : ''}" href="/contact/" data-link><span class="line-inner">Contact</span></a>
    </nav>
  </header>`;

const footer = () => `  <footer class="site-footer">
    <dl class="metas footer-metas">
      <div class="meta meta-email">
        <dt class="label">Contact</dt>
        <dd><button class="text link" type="button" data-email="${esc(studio.email)}"><span class="line-inner">${esc(studio.email)}</span></button></dd>
        <span class="copied" aria-hidden="true">Email copied</span>
      </div>
      <div class="meta meta-available">
        <dt class="label">Available</dt>
        <dd class="text">${esc(studio.available)}</dd>
      </div>
    </dl>
    <span class="copyright">&copy; ${esc(studio.year)}</span>
  </footer>`;

const mediaBlock = (src, alt, extra = '') =>
  `<div class="media-wrapper" data-media ${extra}><img class="media" src="${src}" alt="${esc(alt)}" loading="lazy" decoding="async" /></div>`;

const splitTitle = (lines) =>
  lines.map((l) => `<span class="line"><span class="line-inner">${esc(l)}</span></span>`).join('\n        ');

/* ----------------------------------------------------------------- main */

/* Light lines keep their brightness as alpha; pencil on paper is inverted
   so the white paper drops out. Either way the source alpha masks it. */
const INK = {
  light: '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0.333 0.333 0.333 0 0',
  dark:  '0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  -0.6 -0.6 -0.6 0 1.6'
};

const sketch = (m, other) => {
  const w = 400;
  const h = Math.round(w / m.aspect);
  return `        <div class="sketch sketch-${m.id}" data-sketch="${m.id}" style="--neon: ${m.colour}">
          <button class="sketch-hit" type="button" aria-label="${esc(m.name)}: throw a meteor at ${esc(other.name)}"></button>
          <div class="sketch-body">
            <svg class="sketch-svg" viewBox="0 0 ${w} ${h}" aria-hidden="true">
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
          </div>
          <span class="sketch-name">${esc(m.name)}</span>
        </div>`;
};

/* The work, given a section of its own on the landing page: a pinned
   reel that the scroll pulls sideways (see Main.js). */
const showcaseSection = () => {
  const pad = (n) => String(n).padStart(2, '0');
  const cards = projects
    .map((p, i) => `          <a class="show-card" href="/work/${p.slug}/" data-link data-cursor="View"${p.video ? ` data-video="${esc(p.video)}"` : ''} style="--accent: ${p.accent}">
            <span class="show-card-inner">
              <span class="show-card-media"><img class="show-card-img" src="/media/${p.slug}/featured.jpg" alt="${esc(p.name)}" loading="lazy" decoding="async" /></span>
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
  const buttonChars = [...main.about.button]
    .map((c, i) => {
      const ch = c === ' ' ? '&nbsp;' : esc(c);
      const copy = c === ' ' ? '\u00a0' : esc(c);
      return `<span class="about-button-char" style="--i: ${i}" data-c="${copy}">${ch}</span>`;
    })
    .join('');

  const frame = (m, side) => `      <figure class="about-frame about-frame-${side}" data-frame="${m.id}" style="--neon: ${m.colour}">
        <div class="about-photos">
${m.photos.map((src, i) => `          <img class="about-photo" src="${src}" alt="${i === m.photos.length - 1 ? esc(m.name) : ''}" decoding="async" />`).join('\n')}
          <span class="about-flash" aria-hidden="true"></span>
        </div>
        <figcaption class="about-caption">${esc(m.name)}</figcaption>
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
${frame(meet, 'left')}
        <div class="about-body">
          <p class="about-text">${team.reduce((t, m) => t.replace(m.name,`<span class="about-name" style="color: ${m.colour}">${m.name}</span>`), esc(main.about.text))}</p>
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

${footer()}
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

${footer()}
  </div>
</div>`
  });
};

/* ----------------------------------------------------------------- work */

const workPage = (p) => {
  const next = getNext(p.slug);
  const shots = Array.from({ length: p.shots }, (_, i) =>
    `        ${mediaBlock(`/media/${p.slug}/0${i + 1}.jpg`, `${p.name} — detail ${i + 1}`)}`
  ).join('\n');

  const deliverables = p.deliverables
    .map((d) => `<li class="text">${esc(d)}</li>`)
    .join('');

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

    <div class="hero-media">
      ${mediaBlock(`/media/${p.slug}/featured.jpg`, p.name)}
    </div>

    <p class="description" data-split-lines>${esc(p.description)}</p>

    <dl class="metas">
      <div class="meta"><dt class="label">Year</dt><dd class="text">${esc(p.year)}</dd></div>
      <div class="meta"><dt class="label">Role</dt><dd class="text">${esc(p.role)}</dd></div>
      <div class="meta"><dt class="label">Scope</dt><dd><ul class="meta-list">${deliverables}</ul></dd></div>
      <div class="meta"><dt class="label">Visit</dt><dd><a class="text link" href="${esc(p.link)}" target="_blank" rel="noopener noreferrer"><span class="line-inner">Live site &nearr;</span></a></dd></div>
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

${footer()}
  </div>
</div>`
  });
};

/* ----------------------------------------------------------------- info */

const infoPage = () => {
  const services = info.services
    .map(
      (s) => `        <div class="service">
          <h2 class="label">${esc(s.label)}</h2>
          <ul>${s.items.map((i) => `<li class="text">${esc(i)}</li>`).join('')}</ul>
        </div>`
    )
    .join('\n');

  const body = info.body.map((t) => `      <p class="text" data-split-lines>${esc(t)}</p>`).join('\n');
  const caps = info.capabilities.map((c) => `<li class="text">${esc(c)}</li>`).join('');
  const social = studio.social
    .map(
      (s) =>
        `<li><a class="text link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"><span class="line-inner">${esc(s.label)} &nearr;</span></a></li>`
    )
    .join('');

  return shell({
    title: `${studio.name} — Info`,
    description: info.lead,
    pageId: 'info',
    body: `<div class="page" id="info" data-page="info">
  <div class="page-content" id="page-content" tabindex="-1">
${header('info')}

    <a class="back link" href="/" data-link><span class="line-inner"><span class="back-arrow" aria-hidden="true">&larr;</span>Index</span></a>

    <h1 class="title" data-split>
        ${splitTitle(info.title)}
    </h1>

    <div class="info-grid">
      <div class="info-portrait">
        ${mediaBlock('/media/studio/portrait.jpg', 'The studio')}
      </div>

      <div class="info-body">
        <p class="lead" data-split-lines>${esc(info.lead)}</p>
${body}
      </div>
    </div>

    <section class="services" aria-label="Services">
${services}
    </section>

    <section class="capabilities" aria-label="Capabilities">
      <h2 class="label">Stack</h2>
      <ul class="capability-list">${caps}</ul>
    </section>

    <section class="elsewhere" aria-label="Elsewhere">
      <h2 class="label">Elsewhere</h2>
      <ul class="social-list">${social}</ul>
    </section>

${footer()}
  </div>
</div>`
  });
};

/* -------------------------------------------------------------- contact */

const contactPage = () => {
  const details = contact.details
    .map((d) => `        <div class="contact-detail"><dt class="label">${esc(d.label)}</dt><dd class="text">${esc(d.value)}</dd></div>`)
    .join('\n');
  const social = studio.social
    .map((s) => `<li><a class="text link" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer"><span class="line-inner">${esc(s.label)} &nearr;</span></a></li>`)
    .join('');

  return shell({
    title: `${studio.name} — Contact`,
    description: contact.lead,
    pageId: 'contact',
    body: `<div class="page" id="contact" data-page="contact">
  <div class="page-content" id="page-content" tabindex="-1">
${header('contact')}

    <h1 class="title" data-split>
        ${splitTitle(contact.title)}
    </h1>

    <div class="contact-grid">
      <p class="lead" data-split-lines>${esc(contact.lead)}</p>

      <div class="contact-email">
        <span class="label">Write to us</span>
        <button class="contact-address" type="button" data-email="${esc(studio.email)}">
          <span class="contact-address-text">${esc(studio.email)}</span>
          <span class="contact-address-hint">Click to copy</span>
        </button>
        <span class="copied" aria-live="polite">Copied to your clipboard</span>
        <a class="contact-mail link" href="mailto:${esc(studio.email)}"><span class="line-inner">Or open it in your mail app &rarr;</span></a>
      </div>

      <dl class="contact-details">
${details}
        <div class="contact-detail"><dt class="label">Elsewhere</dt><dd><ul class="social-list">${social}</ul></dd></div>
      </dl>
    </div>

${footer()}
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
