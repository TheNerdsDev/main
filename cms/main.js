/*
 * The CMS dashboard. Edits are kept here until Save (which writes
 * src/content/cms.js and rebuilds the pages — the site at
 * localhost:5173 shows them at once); uploads are converted and saved
 * straight away by the server (server/api.js). Publish commits and pushes.
 */
import '@fontsource/anton';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './style.css';

/* The site's address on this computer — found by the server (api/site), since
   its dev server moves to another port when 5173 is taken. */
let SITE = 'http://localhost:5173';
const S = { saved: null, draft: null, media: {}, git: null, ffmpeg: null, v: {}, busy: new Set() };

/* ----------------------------------------------------------- helpers */

function h(tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v;
    /* (A property: a textarea ignores a value attribute.) */
    else if (k === 'value') el.value = v;
    else if (k in el && typeof v !== 'string') el[k] = v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : String(kid));
  return el;
}
const $ = (s, r = document) => r.querySelector(s);
const clone = (x) => structuredClone(x);
const pad = (n) => String(n).padStart(2, '0');
const mb = (b) => `${(b / 1048576).toFixed(b > 10485760 ? 0 : 1)} MB`;
const dirty = () => JSON.stringify(S.draft) !== JSON.stringify(S.saved);
const live = () => S.draft.projects.filter((p) => !p.hidden);
const bust = (slug) => S.v[slug] || 0;

function toast(text, kind = '') {
  const t = h('div', { class: `toast ${kind ? `is-${kind}` : ''}`, role: kind === 'error' ? 'alert' : 'status' }, text);
  $('#toasts').append(t);
  setTimeout(() => t.remove(), kind === 'error' ? 7000 : 3600);
}

async function call(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Something went wrong (${res.status}).`);
  return data;
}

/** Send a file; onProgress gets 0..1 of the upload. Resolves with the job id. */
function send(url, file, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', url);
    x.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => {
      let data = {};
      try { data = JSON.parse(x.responseText); } catch { /* not JSON */ }
      if (x.status >= 200 && x.status < 300) resolve(data.job);
      else reject(new Error(data.error || `The upload failed (${x.status}).`));
    };
    x.onerror = () => reject(new Error('The upload failed — is the CMS still running?'));
    x.send(file);
  });
}

/** Follow a server task until it's done. */
async function follow(job, onProgress) {
  for (;;) {
    await new Promise((r) => setTimeout(r, 400));
    const j = await call('GET', `/api/jobs/${job}`);
    onProgress?.(j.progress, j.message);
    if (j.state === 'done') return j.result;
    if (j.state === 'error') throw new Error(j.message);
  }
}

function modal({ title, text, input, confirm = 'OK', danger = false, match }) {
  return new Promise((resolve) => {
    const field = input ? h('input', { class: 'input', placeholder: input, autocomplete: 'off' }) : null;
    const ok = h('button', { class: `btn ${danger ? 'btn-danger' : 'btn-primary'}`, type: 'submit' }, confirm);
    const close = (value) => { back.remove(); resolve(value); };
    const form = h('form', { class: 'modal', onSubmit: (e) => { e.preventDefault(); close(field ? field.value.trim() : true); } },
      h('h2', {}, title), text ? h('p', {}, text) : null, field,
      h('div', { class: 'modal-actions' }, h('button', { class: 'btn btn-ghost', type: 'button', onClick: () => close(null) }, 'Cancel'), ok));
    const back = h('div', { class: 'modal-back', onClick: (e) => e.target === back && close(null) }, form);
    if (match) {
      ok.disabled = true;
      field.addEventListener('input', () => { ok.disabled = field.value.trim() !== match; });
    }
    document.body.append(back);
    (field || ok).focus();
    back.addEventListener('keydown', (e) => e.key === 'Escape' && close(null));
  });
}

/** A two-way choice, like "Keep whole / Fill". */
function seg(options, value, onPick) {
  const wrap = h('div', { class: 'seg', role: 'group' });
  for (const [v, label] of options) {
    wrap.append(h('button', {
      type: 'button', class: v === value ? 'is-on' : '', 'aria-pressed': String(v === value),
      onClick: (e) => {
        const picked = e.currentTarget;
        [...wrap.children].forEach((b) => { b.classList.toggle('is-on', b === picked); b.setAttribute('aria-pressed', String(b === picked)); });
        onPick(v);
      }
    }, label));
  }
  return wrap;
}

/** A drop area that also opens the file picker. `onFiles` (instead of
    `onFile`) takes several at once, in the order given. */
function dropzone({ title, sub, accept, onFile, onFiles, disabled }) {
  const take = (list) => {
    const files = [...list];
    if (!files.length) return;
    if (onFiles) onFiles(files); else onFile(files[0]);
  };
  const input = h('input', { type: 'file', accept, hidden: true, multiple: !!onFiles, onChange: () => { take(input.files); input.value = ''; } });
  const zone = h('div', {
    class: 'drop', tabindex: disabled ? -1 : 0, role: 'button', 'aria-disabled': String(!!disabled),
    onClick: () => !disabled && input.click(),
    onKeydown: (e) => { if (!disabled && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); input.click(); } },
    onDragover: (e) => { if (disabled) return; e.preventDefault(); zone.classList.add('is-over'); },
    onDragleave: () => zone.classList.remove('is-over'),
    onDrop: (e) => { e.preventDefault(); zone.classList.remove('is-over'); if (!disabled) take(e.dataTransfer.files); }
  }, h('b', {}, title), h('small', {}, sub), input);
  if (disabled) zone.style.opacity = '0.45';
  return zone;
}

/* ------------------------------------------------------------- state */

async function load() {
  const st = await call('GET', '/api/state');
  apply(st);
  locateSite();
}

/** Ask where the site is running; null when it isn't. Redraws what shows it. */
async function locateSite() {
  let origin = null;
  let known = true;
  /* (A dashboard started before this existed can't look: it keeps to the
     usual address, as it always did.) */
  try { origin = (await call('GET', '/api/site')).origin; } catch { known = false; }
  if (origin) SITE = origin;
  const up = known ? !!origin : true;
  const changed = S.siteUp !== up;
  S.siteUp = up;
  if (changed || origin) chrome();
  return origin;
}

/** Take in fresh state from the server (unsaved edits are replaced). */
function apply(st) {
  S.saved = st.content;
  S.draft = clone(st.content);
  S.media = st.media || S.media;
  S.git = st.git || S.git;
  if ('ffmpeg' in st) S.ffmpeg = st.ffmpeg;
  chrome();
}

/** An upload/refit finished: its project's media fields, into both copies. */
function merge({ project, media }) {
  for (const copy of [S.saved, S.draft]) {
    const p = copy.projects.find((x) => x.slug === project.slug);
    if (p) for (const k of ['shots', 'photos', 'video', 'screenshot']) p[k] = project[k];
  }
  S.media[project.slug] = media;
  S.v[project.slug] = Date.now();
  refreshGit();
  chrome();
}

async function refreshGit() {
  try { S.git = await call('GET', '/api/git'); chrome(); } catch { /* not essential */ }
}

async function save() {
  if (!dirty()) return true;
  const btn = $('#save');
  btn.disabled = true;
  btn.textContent = 'Saving…';
  btn.dataset.saving = '1';
  try {
    const keep = location.hash;
    const st = await call('PUT', '/api/content', S.draft);
    apply(st);
    /* A renamed project's address followed its name (server/api.js follow):
       say so, and stay on its page at the new one. */
    const moves = st.renamed || [];
    const names = moves.map(([, to]) => `/work/${to}/`).join(', ');
    toast(moves.length ? `Saved — renamed, so its address is now ${names} (the old one sends visitors there).` : 'Saved — the site has the changes.', 'good');
    const moved = moves.find(([from]) => keep === `#/projects/${from}`);
    if (moved) location.hash = `#/projects/${moved[1]}`;
    else if (location.hash === keep) route();
    return true;
  } catch (err) {
    toast(err.message, 'error');
    chrome();
    return false;
  } finally {
    delete btn.dataset.saving;
    chrome();
  }
}

/** Saved before something the server does to the content as a whole. */
async function saveFirst() {
  if (!dirty()) return true;
  return save();
}

function changed() { chrome(); }

/** Top bar, nav and side panel. */
function chrome() {
  const d = S.draft && dirty();
  const saveBtn = $('#save');
  saveBtn.disabled = !d;
  /* (Not while a save is going: it says "Saving…" then.) */
  if (!saveBtn.dataset.saving) saveBtn.textContent = d ? 'Save' : 'Saved ✓';
  $('#dirty').hidden = !d;
  const n = S.git?.changes?.length || 0;
  const count = $('#publish-count');
  count.hidden = !n;
  count.textContent = n;
  $('#maint-flag').hidden = !S.draft?.maintenance?.on;
  $('#side-foot').innerHTML = '';
  $('#side-foot').append(
    h('div', {}, 'Branch ', h('b', {}, S.git?.branch || '…')),
    h('div', {}, 'Videos ', h('b', {}, S.ffmpeg ? 'ready' : 'need ffmpeg')),
    h('div', {}, 'Site ', S.siteUp === false
      ? h('b', {}, 'not running')
      : h('a', { href: SITE, target: '_blank', rel: 'noopener' }, SITE.replace(/^https?:\/\//, '')))
  );
}

window.addEventListener('beforeunload', (e) => { if (S.draft && dirty()) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); }
});
$('#save').addEventListener('click', save);

/* ------------------------------------------------------------ router */

function route() {
  const parts = location.hash.replace(/^#\/?/, '').split('/').filter(Boolean);
  const view = $('#view');
  view.innerHTML = '';
  const section = parts[0] || 'overview';
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.toggle('is-on', a.dataset.nav === section));
  const title = $('#top-title');
  title.innerHTML = '';
  if (section === 'projects' && parts[1]) {
    const p = S.draft.projects.find((x) => x.slug === parts[1]);
    if (!p) { location.hash = '#/projects'; return; }
    title.append(h('a', { href: '#/projects' }, 'Projects'), ' / ', p.name);
    view.append(projectEditor(p));
  } else {
    const views = { overview, projects: projectList, about, home, maintenance: maintenanceView, publish: publishView };
    const titles = { overview: 'Overview', projects: 'Projects', about: 'About page', home: 'Home page', maintenance: 'Maintenance', publish: 'Publish' };
    title.append(titles[section] || 'Overview');
    view.append((views[section] || overview)());
  }
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

/* ---------------------------------------------------------- overview */

function overview() {
  const all = S.draft.projects;
  const shown = live();
  const onHome = Math.min(S.draft.home.showcase, shown.length);
  const pending = S.git?.changes?.length || 0;
  const needs = (p) => {
    const m = S.media[p.slug] || {};
    const out = [];
    if (!m.thumb) out.push('thumbnail');
    if (!p.video) out.push('video');
    if (!p.photos || !p.shots) out.push('screenshots');
    if (!p.github) out.push('GitHub link');
    if (!p.description?.trim()) out.push('description');
    return out;
  };
  return h('div', {},
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Overview'), h('p', {}, 'Everything the site shows that you can change here.'))),
    S.saved.maintenance?.on ? maintenanceWarning() : null,
    h('div', { class: 'grid-4' },
      stat(shown.length, `projects on the site${all.length > shown.length ? ` · ${all.length - shown.length} hidden` : ''}`),
      stat(onHome, 'in the home page reel'),
      stat(S.draft.about.offer.items.length, 'services in The Offer'),
      stat(pending, pending === 1 ? 'file waiting to publish' : 'files waiting to publish', pending > 0)),
    h('div', { class: 'card', style: 'margin-top:16px' },
      h('div', { class: 'card-head' }, h('div', {}, h('h2', {}, 'Projects at a glance'), h('p', {}, 'What each project still needs.')),
        h('button', { class: 'btn', onClick: addProject }, '+ Add project')),
      h('ul', { class: 'checklist' }, all.map((p) => {
        const n = needs(p);
        return h('li', {},
          h('a', { href: `#/projects/${p.slug}` }, p.name, p.hidden ? h('span', { class: 'chip is-off', style: 'margin-left:8px' }, 'Hidden') : null),
          n.length ? h('span', { class: 'no' }, `Needs ${n.join(', ')}`) : h('span', { class: 'ok' }, 'Complete ✓'));
      }))),
    S.ffmpeg ? null : h('div', { class: 'warn-box', style: 'margin-top:16px' },
      'Video uploads need ffmpeg on this computer. Install it (once) with: winget install Gyan.FFmpeg — then restart the CMS.'));
}
const stat = (n, label, warn) => h('div', { class: `stat ${warn ? 'is-warn' : ''}` }, h('b', {}, n), h('span', {}, label));

/* ---------------------------------------------------------- projects */

function projectList() {
  const n = S.draft.home.showcase;
  let dragFrom = -1;
  const rows = h('div', { class: 'rows' });
  const draw = () => {
    rows.innerHTML = '';
    let liveIndex = 0;
    S.draft.projects.forEach((p, i) => {
      const m = S.media[p.slug] || {};
      const homeNo = p.hidden ? 0 : ++liveIndex;
      const row = h('div', {
        class: 'row', draggable: 'true',
        onClick: (e) => { if (!e.target.closest('.handle')) location.hash = `#/projects/${p.slug}`; },
        onDragstart: (e) => { dragFrom = i; row.classList.add('is-drag'); e.dataTransfer.effectAllowed = 'move'; },
        onDragend: () => { row.classList.remove('is-drag'); rows.querySelectorAll('.is-over').forEach((r) => r.classList.remove('is-over')); },
        onDragover: (e) => { e.preventDefault(); row.classList.add('is-over'); },
        onDragleave: () => row.classList.remove('is-over'),
        onDrop: (e) => {
          e.preventDefault();
          if (dragFrom < 0 || dragFrom === i) return;
          const [moved] = S.draft.projects.splice(dragFrom, 1);
          S.draft.projects.splice(i, 0, moved);
          dragFrom = -1;
          changed();
          draw();
        }
      },
      h('span', { class: 'handle', title: 'Drag to reorder' }, '⋮⋮'),
      m.thumb ? h('img', { class: 'thumb', src: `/media/${p.slug}/featured-960.webp?v=${bust(p.slug)}`, alt: '', onError: (e) => { e.target.src = `/media/${p.slug}/featured.jpg?v=${bust(p.slug)}`; } }) : h('div', { class: 'thumb is-none' }, 'No picture'),
      h('div', {}, h('div', { class: 'row-name' }, p.name), h('div', { class: 'row-sub' }, `${p.year}${p.github ? ' · GitHub linked' : ''}`)),
      h('div', { class: 'chips' },
        p.hidden ? h('span', { class: 'chip is-off' }, 'Hidden') : homeNo <= n ? h('span', { class: 'chip is-good' }, `Home reel #${homeNo}`) : h('span', { class: 'chip' }, 'Work page only'),
        h('span', { class: `chip ${p.video ? '' : 'is-warn'}` }, p.video ? 'Video' : 'No video'),
        h('span', { class: `chip ${p.photos && p.shots ? '' : 'is-warn'}` }, p.photos && p.shots ? `${p.shots} screenshot${p.shots === 1 ? '' : 's'}` : 'No screenshots')));
      rows.append(row);
    });
  };
  draw();
  return h('div', {},
    h('div', { class: 'page-head' },
      h('div', {}, h('h1', {}, 'Projects'), h('p', {}, 'Drag to change the order — it’s the order on the site, and the home page reel shows the first ones.')),
      h('button', { class: 'btn btn-primary', onClick: addProject }, '+ Add project')),
    rows);
}

async function addProject() {
  const name = await modal({ title: 'Add a project', text: 'You can fill in everything else on its page. It stays hidden from the site until it has a thumbnail and you switch it on.', input: 'Project name', confirm: 'Add project' });
  if (!name) return;
  if (!(await saveFirst())) return;
  try {
    const st = await call('POST', '/api/projects', { name });
    apply(st);
    toast(`“${name}” added.`, 'good');
    location.hash = `#/projects/${st.slug}`;
  } catch (err) { toast(err.message, 'error'); }
}

/* ------------------------------------------------------ one project */

function projectEditor(p) {
  const slug = p.slug;
  const m = () => S.media[slug] || {};
  const wrap = h('div', {});

  /* Header: the name, and whether it's on the site — with, while it's
     hidden, what it takes to show it (a new project starts hidden). */
  const showSwitch = h('input', {
    type: 'checkbox', checked: !p.hidden, disabled: !m().thumb && p.hidden,
    onChange: (e) => { p.hidden = !e.target.checked; changed(); showState(); }
  });
  const hiddenBox = h('div', { class: 'hidden-box' });
  const showState = () => {
    const thumb = !!m().thumb;
    const saved = S.saved.projects.find((x) => x.slug === slug);
    hiddenBox.innerHTML = '';
    hiddenBox.hidden = !saved?.hidden;
    if (hiddenBox.hidden) return;
    const step = (done, text) => h('li', { class: done ? 'is-done' : '' }, h('span', { class: 'step-mark' }, done ? '✓' : ''), text);
    hiddenBox.append(
      h('b', {}, 'Hidden — not on the site yet'),
      h('p', {}, 'It isn’t on the Work page or the home page reel until you show it:'),
      h('ol', { class: 'steps' },
        step(thumb, 'Add a thumbnail (below)'),
        step(!p.hidden, 'Switch on “Shown on the site” (top right)'),
        step(false, 'Save')));
  };
  wrap.append(h('div', { class: 'page-head' },
    h('div', {}, h('h1', {}, p.name), h('p', {}, `thenerds.dev/work/${slug}/`)),
    h('label', { class: 'switch', title: !m().thumb ? 'Add a thumbnail first' : '' }, showSwitch, 'Shown on the site')),
    hiddenBox);
  showState();

  /* Details. */
  const text = (label, key, opts = {}) => {
    const input = h(opts.area ? 'textarea' : 'input', {
      class: opts.area ? 'textarea' : 'input', value: p[key] ?? '', placeholder: opts.placeholder || '',
      maxlength: opts.max || null,
      onInput: (e) => {
        p[key] = e.target.value;
        if (key === 'name') $('#top-title').lastChild.textContent = e.target.value;
        if (opts.check) e.target.classList.toggle('is-bad', !opts.check(e.target.value));
        changed();
      }
    });
    if (opts.check && p[key]) input.classList.toggle('is-bad', !opts.check(p[key]));
    return h('div', { class: 'field' }, h('label', {}, label), input, opts.hint ? h('span', { class: 'hint' }, opts.hint) : null);
  };
  const colour = h('input', { type: 'color', value: p.accent || '#e63946', onInput: (e) => { p.accent = e.target.value.toUpperCase(); hex.value = p.accent; changed(); } });
  const hex = h('input', {
    class: 'input', value: p.accent || '', style: 'max-width:130px', maxlength: 7,
    onInput: (e) => { const v = e.target.value.trim(); if (/^#[0-9a-f]{6}$/i.test(v)) { p.accent = v.toUpperCase(); colour.value = v; changed(); } }
  });
  wrap.append(h('div', { class: 'card' },
    h('div', { class: 'card-head' }, h('div', {}, h('h2', {}, 'Details'), h('p', {}, 'Shown on the project’s page.'))),
    h('div', { class: 'grid-2' },
      h('div', {},
        text('Name', 'name', { max: 60 }),
        text('Year', 'year', { max: 4, check: (v) => /^\d{4}$/.test(v), hint: 'Four digits, like 2026.' }),
        text('GitHub link', 'github', { placeholder: 'https://github.com/you/repo', check: (v) => !v || /^https:\/\/github\.com\/[\w.-]+(\/[\w.-]+)?\/?$/i.test(v), hint: 'Leave empty to hide the “Code — GitHub” link.' }),
        h('div', { class: 'field' }, h('label', {}, 'Accent colour'), h('div', { class: 'colour' }, colour, hex), h('span', { class: 'hint' }, 'The glow on its page and card.'))),
      h('div', {}, text('Description', 'description', { area: true, max: 600, hint: 'Two or three sentences under the video on its page.' })))));

  /* Media. */
  const thumbCard = h('div', { class: 'card' });
  const videoCard = h('div', { class: 'card' });
  const shotsCard = h('div', { class: 'card' });
  wrap.append(thumbCard, videoCard, shotsCard);

  const busy = (frame, label) => {
    const bar = h('i');
    const msg = h('span', {}, label);
    const box = h('div', { class: 'busy' }, msg, h('div', { class: 'bar' }, bar));
    frame.append(box);
    return { set: (p, text) => { bar.style.width = `${Math.round(p * 100)}%`; if (text) msg.textContent = text; }, done: () => box.remove() };
  };

  /** An upload, from picking the file to the converted result. */
  async function run(frame, label, start) {
    if (S.busy.has(slug)) return toast('Wait for the current upload on this project to finish.', 'error');
    S.busy.add(slug);
    const b = busy(frame, label);
    try {
      const job = await start((p) => b.set(p * 0.35, label));
      const result = await follow(job, (p, text) => b.set(0.35 + p * 0.65, text));
      merge(result);
      if (result.note) toast(result.note);
      else toast('Done — it’s on the site.', 'good');
      return result;
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      b.done();
      S.busy.delete(slug);
    }
  }

  const IMG = 'image/png,image/jpeg,image/webp,image/avif';
  const pictureOk = (f) => /^image\/(png|jpe?g|webp|avif)$/.test(f.type) || /\.(png|jpe?g|webp|avif)$/i.test(f.name);

  let thumbMode = m().thumbMode || 'fit';
  function drawThumb() {
    thumbCard.innerHTML = '';
    const frame = h('div', { class: 'frame r43' },
      m().thumb ? h('img', { src: `/media/${slug}/featured.jpg?v=${bust(slug)}`, alt: 'Thumbnail' }) : h('div', { class: 'frame-empty' }, 'No thumbnail yet'));
    const upload = (file) => {
      if (!pictureOk(file)) return toast('That isn’t a picture this takes — use PNG, JPG or WebP.', 'error');
      run(frame, 'Uploading…', (prog) => send(`/api/upload?slug=${slug}&kind=thumb&mode=${thumbMode}`, file, prog))
        .then((r) => { if (r) { showSwitch.disabled = false; drawThumb(); showState(); } });
    };
    thumbCard.append(
      h('div', { class: 'card-head' }, h('div', {}, h('h2', {}, 'Thumbnail'), h('p', {}, 'The picture on its card — the home page reel and the Work page. Saved as 1600 × 1200 (4:3).'))),
      h('div', { class: 'media-row' }, frame,
        h('div', { class: 'media-side' },
          h('div', { class: 'field' }, h('span', { class: 'label' }, 'How it fills the card'),
            seg([['fit', 'Keep it whole'], ['fill', 'Fill the frame']], thumbMode, async (v) => {
              thumbMode = v;
              if (!m().thumb) return;
              await run(frame, 'Refitting…', () => call('POST', `/api/thumb/${slug}`, { mode: v }).then((r) => r.job));
              drawThumb();
            }),
            h('span', { class: 'hint' }, 'Keep it whole: on a dark backdrop, nothing cut — for screenshots and posters. Fill: cropped to the card — for photos.')),
          dropzone({ title: m().thumb ? 'Replace the thumbnail' : 'Add a thumbnail', sub: 'Drop a picture here, or click — PNG, JPG or WebP', accept: IMG, onFile: upload }))));
  }

  let videoMode = 'fit';
  function drawVideo() {
    videoCard.innerHTML = '';
    const has = !!p.video && m().video > 0;
    const placeholder = p.video && !has;
    const frame = h('div', { class: 'frame r43' },
      has ? h('video', { src: `/media/${slug}/preview.mp4?v=${bust(slug)}`, muted: true, loop: true, autoplay: true, playsinline: true }) : h('div', { class: 'frame-empty' }, placeholder ? 'Using the sample clip' : 'No video yet'));
    const upload = (file) => {
      if (!S.ffmpeg) return toast('Video needs ffmpeg — install it with: winget install Gyan.FFmpeg, then restart the CMS.', 'error');
      if (!/^video\//.test(file.type) && !/\.(mp4|mov|m4v|webm|mkv|avi)$/i.test(file.name)) return toast('That isn’t a video this takes — use MP4, MOV or WebM.', 'error');
      run(frame, 'Uploading…', (prog) => send(`/api/upload?slug=${slug}&kind=video&mode=${videoMode}`, file, prog)).then((r) => {
        if (!r) return;
        /* A new video: the old one's stretch would cut it in the wrong places. */
        if (p.videoFrom || p.videoTo) {
          delete p.videoFrom;
          delete p.videoTo;
          changed();
        }
        drawVideo();
      });
    };
    const pageVideo = h('input', { type: 'checkbox', checked: !!p.pageVideo, onChange: (e) => { p.pageVideo = e.target.checked; changed(); } });
    /* The stretch a hover plays (seconds; blank: the start / the end). */
    const secs = (key) => h('input', {
      class: 'input', type: 'number', min: 0, step: 0.1, style: 'max-width:90px', placeholder: key === 'videoTo' ? 'end' : '0',
      value: p[key] > 0 ? p[key] : '',
      onInput: (e) => {
        const v = parseFloat(e.target.value);
        if (v > 0) p[key] = Math.round(v * 10) / 10;
        else delete p[key];
        changed();
      }
    });
    const stretch = h('div', { class: 'field' }, h('span', { class: 'label' }, 'On hover, play'),
      h('div', { class: 'colour' }, 'from', secs('videoFrom'), 'to', secs('videoTo'), 's'),
      h('span', { class: 'hint' }, 'Skip a title screen the thumbnail already shows: the card goes straight into the project. It loops just this part. Blank: the whole video.'));
    videoCard.append(
      h('div', { class: 'card-head' },
        h('div', {}, h('h2', {}, 'Video'), h('p', {}, 'Plays in its card on hover. Converted to the site’s format: 1440 × 1080 (1080p), sharp and smooth, no sound; longer than 90 seconds is cut.')),
        has ? h('button', { class: 'btn btn-sm btn-danger', onClick: async () => {
          if (!(await modal({ title: 'Remove the video?', text: 'Its card shows just the thumbnail on hover.', confirm: 'Remove', danger: true }))) return;
          if (!(await saveFirst())) return;
          try { apply(await call('DELETE', `/api/video/${slug}`)); S.v[slug] = Date.now(); route(); toast('Video removed.', 'good'); } catch (err) { toast(err.message, 'error'); }
        } }, 'Remove') : null),
      h('div', { class: 'media-row' }, frame,
        h('div', { class: 'media-side' },
          has ? h('div', { class: 'note' }, `preview.mp4 · ${mb(m().video)}`) : null,
          h('div', { class: 'field' }, h('span', { class: 'label' }, 'If it isn’t 4:3'),
            seg([['fit', 'Keep it whole'], ['fill', 'Crop to 4:3']], videoMode, (v) => { videoMode = v; }),
            h('span', { class: 'hint' }, 'Keep it whole: the full frame over a blurred copy of itself. Crop: fills the frame, cutting the sides. Applies to the next upload.')),
          has ? stretch : null,
          h('label', { class: 'switch' }, pageVideo, 'Also play it at the top of the project’s page'),
          S.ffmpeg ? null : h('div', { class: 'warn-box' }, 'Video uploads need ffmpeg: winget install Gyan.FFmpeg'),
          dropzone({ title: has ? 'Replace the video' : 'Add a video', sub: 'Drop a video here, or click — MP4, MOV or WebM', accept: 'video/*', onFile: upload, disabled: !S.ffmpeg }))));
  }

  let shotMode = 'fit';
  function drawShots() {
    shotsCard.innerHTML = '';
    const list = (m().shots || []).slice();
    const grid = h('div', { class: 'shots' });
    const arrange = (order, modes = {}, label = 'Arranging…') => run(grid, label, () => call('POST', `/api/shots/${slug}`, { order, modes }).then((r) => r.job)).then((r) => r && drawShots());
    list.forEach((s, i) => {
      const frame = h('div', { class: 'frame' }, h('img', { src: `/media/${slug}/${pad(s.slot)}.webp?v=${bust(slug)}`, alt: `Screenshot ${i + 1}` }));
      const ids = list.map((x) => x.id);
      const move = (d) => { const o = ids.slice(); [o[i], o[i + d]] = [o[i + d], o[i]]; arrange(o); };
      const replace = h('input', { type: 'file', accept: IMG, hidden: true, onChange: () => {
        const f = replace.files[0];
        replace.value = '';
        if (!f) return;
        if (!pictureOk(f)) return toast('That isn’t a picture this takes — use PNG, JPG or WebP.', 'error');
        run(frame, 'Uploading…', (prog) => send(`/api/upload?slug=${slug}&kind=shot&mode=${s.mode}&replace=${s.id}`, f, prog)).then((r) => r && drawShots());
      } });
      grid.append(h('div', { class: 'shot' }, frame,
        h('div', { class: 'shot-bar' },
          h('span', { class: 'label' }, i === 0 ? '1 · Wide, at the top' : String(i + 1)),
          h('div', { class: 'shot-tools' },
            h('button', { class: 'icon-btn', title: 'Move earlier', disabled: i === 0, onClick: () => move(-1) }, '←'),
            h('button', { class: 'icon-btn', title: 'Move later', disabled: i === list.length - 1, onClick: () => move(1) }, '→'),
            h('button', { class: 'btn btn-sm', title: 'Switch between keeping it whole and filling the frame', onClick: () => arrange(ids, { [s.id]: s.mode === 'fit' ? 'fill' : 'fit' }, 'Refitting…') }, s.mode === 'fit' ? 'Whole' : 'Filled'),
            h('button', { class: 'btn btn-sm', onClick: () => replace.click() }, 'Replace'), replace,
            h('button', { class: 'icon-btn', title: 'Remove', onClick: async () => {
              if (!(await modal({ title: 'Remove this screenshot?', confirm: 'Remove', danger: true }))) return;
              arrange(ids.filter((x) => x !== s.id), {}, 'Removing…');
            } }, '✕')))));
    });
    /* One or several, added in order into the free places (one at a time —
       each is converted before the next goes up). */
    const add = async (files) => {
      const pics = files.filter(pictureOk);
      if (pics.length < files.length) toast('Skipped what isn’t a picture — use PNG, JPG or WebP.', 'error');
      for (const [k, file] of pics.entries()) {
        const label = pics.length > 1 ? `Uploading ${k + 1} of ${pics.length}…` : 'Uploading…';
        const r = await run(grid, label, (prog) => send(`/api/upload?slug=${slug}&kind=shot&mode=${shotMode}`, file, prog));
        if (!r) break;
      }
      drawShots();
    };
    /* The page's own layout, as places to fill: the wide one at the top, two
       side by side under it — and, once those are in, room for more (they
       go on two to a row). Only the next free place takes a drop, so each
       lands where it's shown; several dropped at once fill them in turn. */
    const places = list.length < 3 ? 3 : list.length + 1;
    for (let n = list.length + 1; n <= places; n++) {
      const next = n === list.length + 1;
      const title = n === 1 ? 'Add the wide screenshot' : n <= 3 ? `Add screenshot ${n}` : 'Add another';
      const sub = !next ? `After screenshot ${n - 1}`
        : n === 1 ? 'Drop one here, or several at once (they fill all three) — or click'
          : n <= 3 ? `Drop ${n === 2 ? 'one or two' : 'one'} here, or click`
            : 'Drop pictures here, or click — two to a row';
      grid.append(h('div', { class: `shot shot-empty ${next ? '' : 'is-later'}` },
        h('div', { class: 'frame' }, dropzone({ title, sub, accept: IMG, onFiles: add, disabled: !next })),
        h('div', { class: 'shot-bar' }, h('span', { class: 'label' }, n === 1 ? '1 · Wide, at the top' : n <= 3 ? `${n} · Under it, side by side` : String(n)))));
    }
    shotsCard.append(
      h('div', { class: 'card-head' }, h('div', {}, h('h2', {}, 'Screenshots'), h('p', {}, 'On the project’s page, under the description: one wide at the top (2.1 : 1) and two side by side under it (1.62 : 1). More go on two to a row. Each is fitted to its place.'))),
      h('div', { class: 'field', style: 'margin-bottom:16px' }, h('span', { class: 'label' }, 'New screenshots'),
        seg([['fit', 'Keep them whole'], ['fill', 'Fill the frame']], shotMode, (v) => { shotMode = v; }),
        h('span', { class: 'hint' }, 'Keep whole: on a dark backdrop, so the hover zoom never cuts them (app screenshots). Fill: cropped to the frame (photos, designed images).')),
      grid);
  }

  drawThumb();
  drawVideo();
  drawShots();

  /* Deleting. */
  wrap.append(h('div', { class: 'card danger-zone' },
    h('div', { class: 'card-head' },
      h('div', {}, h('h2', {}, 'Delete this project'), h('p', {}, 'It comes off the site. Its files go to the .cms-trash folder, so they can be brought back by hand.')),
      h('button', { class: 'btn btn-danger', onClick: async () => {
        const typed = await modal({ title: `Delete “${p.name}”?`, text: `Type the project’s name to confirm: ${p.name}`, input: p.name, confirm: 'Delete project', danger: true, match: p.name });
        if (!typed) return;
        if (!(await saveFirst())) return;
        try { apply(await call('DELETE', `/api/projects/${slug}`)); toast(`“${p.name}” deleted.`, 'good'); location.hash = '#/projects'; } catch (err) { toast(err.message, 'error'); }
      } }, 'Delete project'))));
  return wrap;
}

/* ------------------------------------------------------------- about */

/** Edit a list of lines in place: reorder, remove, add. */
function lines(arr, { placeholder, add }) {
  const box = h('div', { class: 'list' });
  const draw = () => {
    box.innerHTML = '';
    arr.forEach((v, i) => {
      box.append(h('div', { class: 'list-row' },
        h('input', { class: 'input', value: v, placeholder, onInput: (e) => { arr[i] = e.target.value; changed(); } }),
        h('div', { class: 'list-tools' },
          h('button', { class: 'icon-btn', title: 'Move up', disabled: i === 0, onClick: () => { [arr[i - 1], arr[i]] = [arr[i], arr[i - 1]]; changed(); draw(); } }, '↑'),
          h('button', { class: 'icon-btn', title: 'Move down', disabled: i === arr.length - 1, onClick: () => { [arr[i + 1], arr[i]] = [arr[i], arr[i + 1]]; changed(); draw(); } }, '↓'),
          h('button', { class: 'icon-btn', title: 'Remove', onClick: () => { arr.splice(i, 1); changed(); draw(); } }, '✕'))));
    });
    box.append(h('div', {}, h('button', { class: 'btn btn-sm', onClick: () => { arr.push(''); changed(); draw(); box.querySelectorAll('input')[arr.length - 1]?.focus(); } }, add)));
  };
  draw();
  return box;
}

function about() {
  const { offer, work } = S.draft.about;
  const kinds = h('div', {});
  const drawKinds = () => {
    kinds.innerHTML = '';
    work.kinds.forEach((k, i) => {
      kinds.append(h('div', { class: 'kind' },
        h('div', { class: 'kind-head' },
          h('span', { class: 'kind-no' }, pad(i + 1)),
          h('div', { class: 'list-tools' },
            h('button', { class: 'icon-btn', title: 'Move up', disabled: i === 0, onClick: () => { [work.kinds[i - 1], work.kinds[i]] = [work.kinds[i], work.kinds[i - 1]]; changed(); drawKinds(); } }, '↑'),
            h('button', { class: 'icon-btn', title: 'Move down', disabled: i === work.kinds.length - 1, onClick: () => { [work.kinds[i + 1], work.kinds[i]] = [work.kinds[i], work.kinds[i + 1]]; changed(); drawKinds(); } }, '↓'),
            h('button', { class: 'icon-btn', title: 'Remove', onClick: async () => { if (await modal({ title: `Remove “${k.name}”?`, confirm: 'Remove', danger: true })) { work.kinds.splice(i, 1); changed(); drawKinds(); } } }, '✕'))),
        h('div', { class: 'grid-2' },
          h('div', {},
            h('div', { class: 'field' }, h('label', {}, 'Name'), h('input', { class: 'input', value: k.name, onInput: (e) => { k.name = e.target.value; changed(); } })),
            h('div', { class: 'field' }, h('label', {}, 'The line under it'), h('textarea', { class: 'textarea', style: 'min-height:70px', value: k.text, onInput: (e) => { k.text = e.target.value; changed(); } }))),
          h('div', { class: 'field' }, h('label', {}, 'What it covers (shown in its panel)'), lines(k.items, { placeholder: 'A deliverable', add: '+ Add an item' })))));
    });
    kinds.append(h('button', { class: 'btn btn-sm', style: 'margin-top:10px', onClick: () => { work.kinds.push({ name: 'New kind', text: '', items: [''] }); changed(); drawKinds(); } }, '+ Add a kind of work'));
  };
  drawKinds();
  return h('div', {},
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'About page'), h('p', {}, 'The two boxes under the intro.'))),
    h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', {}, h('h2', {}, 'The Offer'), h('p', {}, 'The services clients hire you for, one per line. About eight fit the box.'))),
      h('div', { class: 'field' }, h('label', {}, 'Title'), h('input', { class: 'input', value: offer.title, style: 'max-width:320px', onInput: (e) => { offer.title = e.target.value; changed(); } })),
      h('div', { class: 'field' }, h('label', {}, 'Services'), lines(offer.items, { placeholder: 'A service', add: '+ Add a service' }))),
    h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', {}, h('h2', {}, 'The Work'), h('p', {}, 'The kinds of thing you make. Hovering one on the site opens a panel with its line and items. Five fit the box best.'))),
      h('div', { class: 'field' }, h('label', {}, 'Title'), h('input', { class: 'input', value: work.title, style: 'max-width:320px', onInput: (e) => { work.title = e.target.value; changed(); } })),
      h('div', { style: 'margin-top:14px' }, kinds)));
}

/* -------------------------------------------------------------- home */

function home() {
  const shown = live();
  const list = h('div', { class: 'home-list' });
  const out = h('output', {});
  const minus = h('button', { class: 'icon-btn', style: 'width:40px;height:40px;font-size:20px', title: 'Fewer' }, '−');
  const plus = h('button', { class: 'icon-btn', style: 'width:40px;height:40px;font-size:20px', title: 'More' }, '+');
  const draw = () => {
    const n = Math.min(S.draft.home.showcase, shown.length);
    out.textContent = n;
    minus.disabled = n <= 1;
    plus.disabled = n >= shown.length;
    list.innerHTML = '';
    shown.forEach((p, i) => list.append(h('div', { class: `home-item ${i < n ? 'is-on' : ''}` }, h('b', {}, pad(i + 1)), p.name, i < n ? '' : h('span', { style: 'margin-left:auto;font-size:12px' }, 'Work page only'))));
    /* Hidden ones too, so a new project isn't simply missing here. */
    S.draft.projects.filter((p) => p.hidden).forEach((p) => list.append(
      h('a', { class: 'home-item is-hidden', href: `#/projects/${p.slug}` }, h('b', {}, '—'), p.name,
        h('span', { style: 'margin-left:auto;font-size:12px' }, 'Hidden — show it on the site first ↗'))));
  };
  const set = (n) => { S.draft.home.showcase = Math.max(1, Math.min(n, shown.length)); changed(); draw(); };
  minus.addEventListener('click', () => set(S.draft.home.showcase - 1));
  plus.addEventListener('click', () => set(S.draft.home.showcase + 1));
  draw();
  return h('div', {},
    h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Home page'), h('p', {}, 'The reel of projects on the home page (the third screen). Every project stays on the Work page.'))),
    h('div', { class: 'card' },
      h('div', { class: 'card-head' }, h('div', {}, h('h2', {}, 'Projects in the reel'), h('p', {}, 'The first ones, in the order set on the Projects page.'))),
      h('div', { class: 'stepper' }, minus, out, plus, h('span', { class: 'note' }, `of ${shown.length} on the site`)),
      list));
}

/* ------------------------------------------------------- maintenance */

/** On Overview and Publish while maintenance is on (saved). */
function maintenanceWarning() {
  return h('a', { class: 'maint-banner', href: '#/maintenance' },
    h('span', { class: 'maint-dot' }),
    h('span', {}, h('b', {}, 'Maintenance is on. '), 'Publishing puts the maintenance page on the live site, at every address, until you turn it off.'));
}

function maintenanceView() {
  const m = (S.draft.maintenance ??= { on: false, title: 'We’ll be right back', message: '', back: '' });
  const box = h('div', {});
  let fit = null;
  const draw = () => {
    box.innerHTML = '';
    fit?.disconnect();
    const pending = S.git?.changes?.some((c) => c.path === 'src/content/cms.js');
    /* The page at a desktop width (1280), scaled to the box. */
    /* Only ever this site's own page: where it's running is looked up, and
       if it isn't running there's a note instead of someone else's app. */
    const preview = h('div', { class: 'maint-preview' },
      S.siteUp !== false
        ? h('iframe', { src: `${SITE}/maintenance/?v=${Date.now()}`, title: 'The maintenance page', loading: 'lazy', tabindex: -1 })
        : h('p', { class: 'maint-preview-note' }, 'The site isn’t running on this computer, so there’s nothing to preview. Start it with npm run dev.'));
    fit = new ResizeObserver(([e]) => preview.style.setProperty('--k', String(e.contentRect.width / 1280)));
    fit.observe(preview);
    const where = dirty() ? 'Save, then publish, to put this on the live site.'
      : pending ? 'Saved here. Publish to put it on the live site.'
        : 'Published — live once the host has deployed the latest from GitHub.';

    const toggle = h('input', { type: 'checkbox', checked: m.on, 'aria-label': 'Maintenance mode' });
    toggle.addEventListener('change', async () => {
      if (toggle.checked) {
        const ok = await modal({
          title: 'Turn maintenance on?',
          text: 'Once you save and publish, visitors see only the maintenance page — at every address — until you turn it off. The site here on your computer keeps the real pages, so you can keep working.',
          confirm: 'Turn on'
        });
        if (!ok) { toggle.checked = false; return; }
      }
      m.on = toggle.checked;
      changed();
      draw();
    });

    const field = (label, key, { max, area, placeholder, hint }) => h('div', { class: 'field' },
      h('label', {}, label),
      h(area ? 'textarea' : 'input', {
        class: area ? 'textarea' : 'input', value: m[key] || '', maxlength: max, placeholder,
        style: area ? 'min-height:90px' : null,
        onInput: (e) => { m[key] = e.target.value; changed(); }
      }),
      hint ? h('span', { class: 'hint' }, hint) : null);

    box.append(
      h('div', { class: 'page-head' }, h('div', {}, h('h1', {}, 'Maintenance'), h('p', {}, 'Closing the site for a while — a big update, a move, anything? Turn this on and visitors get a page that says so.'))),
      h('div', { class: `card maint-card ${m.on ? 'is-on' : ''}` },
        h('div', { class: 'maint-row' },
          h('label', { class: 'switch switch-lg' }, toggle,
            h('span', {}, h('b', {}, m.on ? 'Maintenance is on' : 'Maintenance is off'),
              h('small', {}, m.on
                ? 'Visitors see only the maintenance page, at every address. The site here keeps the real pages, with a reminder in the corner.'
                : 'The site is open to everyone, as normal.'))),
          h('span', { class: `chip ${m.on ? 'is-warn' : 'is-good'}` }, m.on ? 'Closed for maintenance' : 'Open')),
        h('p', { class: 'note', style: 'margin:14px 0 0' }, where)),
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('div', {}, h('h2', {}, 'The page'), h('p', {}, 'What visitors read. Under it, always: how to reach you (getintouch@thenerds.dev).'))),
        h('div', { class: 'grid-2' },
          h('div', {},
            field('Heading', 'title', { max: 80, placeholder: 'We’ll be right back' }),
            field('Message', 'message', { max: 400, area: true, placeholder: 'What’s happening, in a line or two.' }),
            field('Back by (optional)', 'back', { max: 80, placeholder: 'e.g. Back on Monday, 10 AM IST', hint: 'Leave it empty if you’d rather not say.' })),
          h('div', { class: 'field' },
            h('div', { class: 'maint-preview-head' }, h('label', {}, 'Preview'), S.siteUp !== false ? h('a', { class: 'btn btn-sm', href: `${SITE}/maintenance/`, target: '_blank', rel: 'noopener' }, 'Open ↗') : null),
            preview,
            h('span', { class: 'hint' }, dirty() ? 'Shows the saved page — save to see your changes.' : 'The page as saved.')))));
  };
  draw();
  /* Look again each time this opens (the site may have been started since). */
  locateSite().then(() => { if (box.isConnected) draw(); });
  return box;
}

/* ----------------------------------------------------------- publish */

function publishView() {
  const box = h('div', {});
  const draw = () => {
    box.innerHTML = '';
    const changes = S.git?.changes || [];
    const msg = h('input', { class: 'input', value: 'Update content', maxlength: 120 });
    const go = h('button', { class: 'btn btn-primary', disabled: !changes.length || dirty() }, 'Publish');
    go.addEventListener('click', async () => {
      go.disabled = true;
      go.textContent = 'Publishing…';
      try {
        const r = await call('POST', '/api/publish', { message: msg.value });
        S.git = r.git;
        chrome();
        toast(`Published ${r.files} file${r.files === 1 ? '' : 's'} to ${r.branch}.`, 'good');
      } catch (err) { toast(err.message, 'error'); }
      draw();
    });
    const pull = h('button', { class: 'btn', onClick: async (e) => {
      e.currentTarget.disabled = true;
      try { apply(await call('POST', '/api/pull')); toast('Up to date with GitHub.', 'good'); } catch (err) { toast(err.message, 'error'); }
      draw();
    } }, 'Get latest from GitHub');
    box.append(...[
      h('div', { class: 'page-head' },
        h('div', {}, h('h1', {}, 'Publish'), h('p', {}, 'Saved changes are on the site on this computer. Publishing commits them and pushes them to GitHub, for Prem — and the live site once it deploys from GitHub.')),
        h('span', { class: 'branch' }, '⎇ ', S.git?.branch || '…')),
      dirty() ? h('div', { class: 'warn-box', style: 'margin-bottom:16px' }, 'You have unsaved changes — save them first, then publish.') : null,
      S.saved.maintenance?.on ? maintenanceWarning() : null,
      h('div', { class: 'card' },
        h('div', { class: 'card-head' }, h('div', {}, h('h2', {}, changes.length ? `${changes.length} file${changes.length === 1 ? '' : 's'} changed` : 'Nothing to publish'), h('p', {}, 'Only content and media — never code.'))),
        changes.length ? h('ul', { class: 'changes' }, changes.map((c) => h('li', {}, h('span', { class: `k ${c.kind}` }, c.kind), c.path))) : h('p', { class: 'note' }, 'Everything here is already on GitHub.'),
        h('div', { class: 'field', style: 'margin-top:18px' }, h('label', {}, 'What changed (the commit message)'), msg),
        h('div', { style: 'display:flex;gap:10px;margin-top:16px' }, go, pull))
    ].filter(Boolean));
  };
  draw();
  refreshGit().then(draw);
  return box;
}

/* -------------------------------------------------------------- start */

load().then(route).catch((err) => {
  $('#view').innerHTML = '';
  $('#view').append(h('div', { class: 'warn-box' }, `The CMS couldn’t load: ${err.message}`));
});
