/*
 * The CMS's server side, as a Vite plugin: the dashboard's API under /api,
 * and the site's media under /media (uncached, so a new upload shows at
 * once). Only ever on this computer — the CMS's Vite listens on
 * 127.0.0.1, and none of this is part of the site's build.
 */
import { createReadStream, createWriteStream, existsSync } from 'node:fs';
import { mkdir, stat, rm, readdir, writeFile } from 'node:fs/promises';
import { join, extname, normalize } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { readContent, writeContent, regenerate } from './content.js';
import { MEDIA, TMP, mediaDir, originalsDir } from './paths.js';
import { inspectImage, inspectVideo, encodeVideo, detectStretch, ffmpegVersion, VIDEO_EXT } from './media.js';
import { getShots, layoutShots, keepShotOriginal, setThumb, trashProject, trash, mediaInfo, newId, rename } from './store.js';
import { status, publish, pull } from './git.js';

const MB = 1024 * 1024;
const LIMIT = { image: 60 * MB, video: 2048 * MB };
const ACCENTS = ['#E63946', '#9259EE', '#2F8CFF', '#1F8F6A', '#F4A261', '#E76F51', '#06B6D4', '#B8343C'];

/* One change to the content at a time (uploads finish in the background,
   and must not race a save). */
let queue = Promise.resolve();
const serial = (fn) => {
  const run = queue.then(fn, fn);
  queue = run.catch(() => {});
  return run;
};

/** Change one project in the saved content, write, and rebuild the pages. */
const updateProject = (slug, change) => serial(async () => {
  const content = await readContent();
  const p = content.projects.find((x) => x.slug === slug);
  if (!p) throw Object.assign(new Error('That project no longer exists.'), { status: 404 });
  await change(p, content);
  await writeContent(content);
  await regenerate();
  return p;
});

/* -------------------------------------------------------------- jobs */

const jobs = new Map();
function startJob(work) {
  const job = { id: newId(), state: 'running', progress: 0, message: '', result: null };
  jobs.set(job.id, job);
  work((p, message) => { job.progress = p; if (message) job.message = message; })
    .then((result) => { job.state = 'done'; job.progress = 1; job.result = result; })
    .catch((err) => { job.state = 'error'; job.message = err.message; console.error('[cms]', err); });
  setTimeout(() => jobs.delete(job.id), 30 * 60 * 1000);
  return job;
}

/* ----------------------------------------------------------- helpers */

const send = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

async function readJson(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 5 * MB) throw Object.assign(new Error('Too much data.'), { status: 413 });
  }
  try { return raw ? JSON.parse(raw) : {}; } catch { throw Object.assign(new Error('That wasn’t valid JSON.'), { status: 400 }); }
}

/** An upload, streamed to a temp file (with a size cap). */
async function receive(req, kind) {
  await mkdir(TMP, { recursive: true });
  const name = String(req.headers['x-file-name'] || 'upload');
  const ext = extname(decodeURIComponent(name)).slice(1).toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
  const size = Number(req.headers['content-length'] || 0);
  if (size > LIMIT[kind]) throw Object.assign(new Error(`That file is too big (${Math.round(size / MB)} MB). The limit is ${LIMIT[kind] / MB} MB.`), { status: 413 });
  const file = join(TMP, `upload-${newId()}.${ext}`);
  let got = 0;
  req.on('data', (c) => {
    got += c.length;
    if (got > LIMIT[kind]) req.destroy(new Error('too big'));
  });
  try {
    await pipeline(req, createWriteStream(file));
  } catch {
    await rm(file, { force: true });
    throw Object.assign(new Error('The upload didn’t finish. Try again.'), { status: 400 });
  }
  return { file, ext };
}

const slugify = (s) => String(s).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'project';

/**
 * A project renamed (`p`, its name changed since it was saved as `s`): its
 * address follows — a slug from the new name, unique among the projects
 * (and their old addresses) and the folders already there — and its media
 * and originals folders, and every path into them, move with it. The old
 * address is kept (formerSlugs): the site sends anyone who has it on to the
 * new one (generate-pages → public/.htaccess). Returns [old, new], or null
 * when the address stays (the name gives the same slug).
 */
async function follow(p, s, content) {
  const base = slugify(p.name);
  if (base === p.slug) return null;
  const own = new Set([p.slug, ...(s.formerSlugs || [])]);
  const taken = (slug) => content.projects.some((x) => x !== p && (x.slug === slug || (x.formerSlugs || []).includes(slug)))
    || (!own.has(slug) && (existsSync(mediaDir(slug)) || existsSync(originalsDir(slug))));
  let next = base;
  for (let i = 2; taken(next); i++) next = `${base}-${i}`;
  if (next === p.slug) return null;

  const from = p.slug;
  for (const dir of [mediaDir, originalsDir]) {
    if (existsSync(dir(from))) await rename(dir(from), dir(next));
  }
  const swap = (v) => {
    if (typeof v === 'string') return v.split(`/media/${from}/`).join(`/media/${next}/`);
    if (Array.isArray(v)) return v.map(swap);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, swap(x)]));
    return v;
  };
  for (const key of Object.keys(p)) p[key] = swap(p[key]);
  p.formerSlugs = [...new Set([...(s.formerSlugs || []), from])].filter((x) => x !== next);
  p.slug = next;
  return [from, next];
}

/* Where the site is running, for the maintenance preview. Its dev server asks
   for 5173 but takes the next free port when something else has it (another
   project's dev server, say), so the preview can't assume one address — and
   must never show whatever else happens to answer there. Each candidate is
   asked for /maintenance/ and counts only if it answers with this site's
   own page. */
const SITE_PORTS = [5173, 5174, 5175, 5176, 5177, 5178, 5179, 5180, 5181, 5182, 4173, 4180];
let siteSeen = { at: 0, origin: null };

async function findSite() {
  if (Date.now() - siteSeen.at < 3000) return siteSeen.origin;
  const asks = SITE_PORTS.map(async (port) => {
    const origin = `http://localhost:${port}`;
    try {
      const res = await fetch(`${origin}/maintenance/`, { signal: AbortSignal.timeout(1500) });
      if (!res.ok) return null;
      const html = await res.text();
      return html.includes('class="maint"') && html.includes('maint-main') ? origin : null;
    } catch {
      return null;
    }
  });
  const origin = (await Promise.all(asks)).find(Boolean) || null;
  siteSeen = { at: Date.now(), origin };
  return origin;
}

/** Everything the dashboard shows. */
async function state() {
  const content = await readContent();
  const media = {};
  for (const p of content.projects) media[p.slug] = await mediaInfo(p);
  return { content, media, git: await status(), ffmpeg: await ffmpegVersion() };
}

/* -------------------------------------------------------------- routes */

async function api(req, res, url) {
  const path = url.pathname.replace(/^\/api/, '');
  const method = req.method;

  if (method === 'GET' && path === '/state') return send(res, 200, await state());
  if (method === 'GET' && path === '/site') return send(res, 200, { origin: await findSite() });

  if (method === 'PUT' && path === '/content') {
    const content = await readJson(req);
    const renamed = [];
    await serial(async () => {
      /* Media fields belong to the server (uploads may have changed them
         since the dashboard last loaded): keep the saved ones. */
      const saved = await readContent();
      for (const p of content.projects || []) {
        const s = saved.projects.find((x) => x.slug === p.slug);
        if (!s) continue;
        for (const key of ['shots', 'photos', 'video', 'screenshot', 'certificates', 'formerSlugs']) {
          if (key in s) p[key] = s[key]; else delete p[key];
        }
      }
      /* Renamed: the address follows the name. */
      for (const p of content.projects || []) {
        const s = saved.projects.find((x) => x.slug === p.slug);
        if (!s || s.name === p.name) continue;
        const moved = await follow(p, s, content);
        if (moved) renamed.push(moved);
      }
      await writeContent(content);
      await regenerate();
    });
    return send(res, 200, { ...(await state()), renamed });
  }

  if (method === 'POST' && path === '/projects') {
    const { name } = await readJson(req);
    if (!String(name || '').trim()) throw Object.assign(new Error('Give the project a name.'), { status: 400 });
    let slug;
    await serial(async () => {
      const content = await readContent();
      const base = slugify(name);
      slug = base;
      for (let i = 2; content.projects.some((p) => p.slug === slug) || existsSync(mediaDir(slug)); i++) slug = `${base}-${i}`;
      await mkdir(mediaDir(slug), { recursive: true });
      content.projects.push({
        slug,
        name: String(name).trim(),
        year: String(new Date().getFullYear()),
        role: '',
        accent: ACCENTS[content.projects.length % ACCENTS.length],
        screenshot: true,
        pageVideo: true,
        description: '',
        github: '',
        shots: 0,
        photos: false,
        video: '',
        /* Kept off the site until it has a thumbnail and is switched on. */
        hidden: true
      });
      await writeContent(content);
      await regenerate();
    });
    return send(res, 200, { slug, ...(await state()) });
  }

  const del = path.match(/^\/projects\/([a-z0-9-]+)$/);
  if (method === 'DELETE' && del) {
    const slug = del[1];
    await serial(async () => {
      const content = await readContent();
      const i = content.projects.findIndex((p) => p.slug === slug);
      if (i < 0) throw Object.assign(new Error('That project no longer exists.'), { status: 404 });
      content.projects.splice(i, 1);
      const live = content.projects.filter((p) => !p.hidden).length;
      content.home.showcase = Math.max(1, Math.min(content.home.showcase, live || 1));
      await writeContent(content);
      await trashProject(slug);
      await regenerate();
    });
    return send(res, 200, await state());
  }

  if (method === 'POST' && path === '/upload') {
    const slug = url.searchParams.get('slug');
    const kind = url.searchParams.get('kind');
    const mode = url.searchParams.get('mode') === 'fill' ? 'fill' : 'fit';
    const content = await readContent();
    const project = content.projects.find((p) => p.slug === slug);
    if (!project) throw Object.assign(new Error('That project no longer exists.'), { status: 404 });
    if (!['thumb', 'shot', 'video'].includes(kind)) throw Object.assign(new Error('Unknown upload.'), { status: 400 });

    const { file, ext } = await receive(req, kind === 'video' ? 'video' : 'image');
    try {
      if (kind === 'video') {
        if (!VIDEO_EXT.includes(ext)) throw Object.assign(new Error(`.${ext} files aren’t videos this takes. Use MP4, MOV or WebM.`), { status: 415 });
        const info = await inspectVideo(file);
        const job = startJob(async (progress) => {
          const out = join(mediaDir(slug), `preview-${newId()}.mp4`);
          await mkdir(mediaDir(slug), { recursive: true });
          try {
            await encodeVideo(file, out, mode, info.seconds, (p) => progress(p * 0.92, 'Converting the video…'), { hdr: info.hdr });
            const final = join(mediaDir(slug), 'preview.mp4');
            await trash(final, `${slug}-preview.mp4`);
            await rename(out, final);
          } finally {
            await rm(out, { force: true });
            await rm(file, { force: true });
          }
          /* Where its card should start and stop on hover: past a still
             title it opens on, short of the title coming back (media.js). */
          progress(0.95, 'Finding where it starts…');
          const stretch = await detectStretch(join(mediaDir(slug), 'preview.mp4'), Math.min(info.seconds, 90));
          progress(0.995, 'Saving…');
          const p = await updateProject(slug, (p) => {
            p.video = `/media/${slug}/preview.mp4`;
            if (stretch.from) p.videoFrom = stretch.from; else delete p.videoFrom;
            if (stretch.to) p.videoTo = stretch.to; else delete p.videoTo;
          });
          const notes = [];
          if (info.seconds > 90) notes.push('It was longer than 90 seconds, so it was cut there.');
          if (info.hdr) notes.push('It was HDR; its colours were brought to normal.');
          if (stretch.from || stretch.to) notes.push(`On hover its card plays ${stretch.from ? `from ${stretch.from} s` : 'from the start'}${stretch.to ? ` to ${stretch.to} s` : ''} (past its title) — change it under “On hover, play” if you like.`);
          return { project: p, media: await mediaInfo(p), note: notes.join(' ') };
        });
        return send(res, 202, { job: job.id });
      }

      const info = await inspectImage(file);
      const note = info.width < 900 ? `It’s quite small (${info.width} × ${info.height}); a larger picture will look sharper.` : '';
      if (kind === 'thumb') {
        const job = startJob(async (progress) => {
          progress(0.3, 'Fitting the thumbnail…');
          await setThumb(slug, { file, ext, mode });
          const p = await updateProject(slug, (p) => { p.screenshot = mode === 'fit'; });
          return { project: p, media: await mediaInfo(p), note };
        });
        return send(res, 202, { job: job.id });
      }

      /* A screenshot: appended, or replacing one (?replace=<id>). */
      const replace = url.searchParams.get('replace');
      const job = startJob(async (progress) => {
        progress(0.3, 'Fitting the screenshot…');
        const shots = await getShots(project);
        const fresh = await keepShotOriginal(slug, file, ext, mode);
        const at = replace ? shots.findIndex((s) => s.id === replace) : -1;
        if (at >= 0) {
          const [old] = shots.splice(at, 1, fresh);
          if (old.original) await trash(join(originalsDir(slug), old.original), `${slug}-${old.original}`);
        } else shots.push(fresh);
        await layoutShots(project, shots);
        const p = await updateProject(slug, (p) => { p.shots = shots.length; p.photos = shots.length > 0; });
        return { project: p, media: await mediaInfo(p), note };
      });
      return send(res, 202, { job: job.id });
    } catch (err) {
      await rm(file, { force: true });
      throw err;
    }
  }

  const jobMatch = path.match(/^\/jobs\/([a-f0-9]+)$/);
  if (method === 'GET' && jobMatch) {
    const job = jobs.get(jobMatch[1]);
    if (!job) return send(res, 404, { error: 'That task has finished or expired.' });
    return send(res, 200, job);
  }

  /* Screenshots rearranged, removed or refitted: { order: [ids], modes: {id: mode} }. */
  const shotsMatch = path.match(/^\/shots\/([a-z0-9-]+)$/);
  if (method === 'POST' && shotsMatch) {
    const slug = shotsMatch[1];
    const { order = [], modes = {} } = await readJson(req);
    const content = await readContent();
    const project = content.projects.find((p) => p.slug === slug);
    if (!project) throw Object.assign(new Error('That project no longer exists.'), { status: 404 });
    const job = startJob(async (progress) => {
      progress(0.2, 'Arranging the screenshots…');
      const shots = await getShots(project);
      const byId = new Map(shots.map((s) => [s.id, s]));
      const next = order.map((id) => byId.get(id)).filter(Boolean);
      for (const s of shots) {
        if (!next.includes(s) && s.original) await trash(join(originalsDir(slug), s.original), `${slug}-${s.original}`);
      }
      for (const s of next) {
        if (modes[s.id] && modes[s.id] !== s.mode) {
          s.mode = modes[s.id] === 'fill' ? 'fill' : 'fit';
          s.wide = null; // refit, whatever its slot
        }
      }
      if (next.length) await layoutShots(project, next);
      else {
        for (const name of await readdir(mediaDir(slug)).catch(() => [])) {
          if (/^\d\d\.(webp|jpg)$/.test(name)) await trash(join(mediaDir(slug), name), `${slug}-${name}`);
        }
        await mkdir(originalsDir(slug), { recursive: true });
        await writeFile(join(originalsDir(slug), 'shots.json'), '[]\n');
      }
      const p = await updateProject(slug, (p) => { p.shots = next.length; p.photos = next.length > 0; });
      return { project: p, media: await mediaInfo(p) };
    });
    return send(res, 202, { job: job.id });
  }

  const refit = path.match(/^\/thumb\/([a-z0-9-]+)$/);
  if (method === 'POST' && refit) {
    const slug = refit[1];
    const { mode } = await readJson(req);
    const job = startJob(async (progress) => {
      progress(0.3, 'Refitting the thumbnail…');
      await setThumb(slug, { mode: mode === 'fill' ? 'fill' : 'fit' });
      const p = await updateProject(slug, (p) => { p.screenshot = mode !== 'fill'; });
      return { project: p, media: await mediaInfo(p) };
    });
    return send(res, 202, { job: job.id });
  }

  const noVideo = path.match(/^\/video\/([a-z0-9-]+)$/);
  if (method === 'DELETE' && noVideo) {
    const slug = noVideo[1];
    await trash(join(mediaDir(slug), 'preview.mp4'), `${slug}-preview.mp4`);
    await updateProject(slug, (p) => { p.video = ''; });
    return send(res, 200, await state());
  }

  if (method === 'GET' && path === '/git') return send(res, 200, await status());
  if (method === 'POST' && path === '/publish') {
    const { message } = await readJson(req);
    const done = await serial(() => publish(message));
    return send(res, 200, { ...done, git: await status() });
  }
  if (method === 'POST' && path === '/pull') {
    await serial(async () => { await pull(); await regenerate(); });
    return send(res, 200, await state());
  }

  return send(res, 404, { error: 'Not found.' });
}

/** /media/... straight from public/media, never cached. */
async function media(req, res, url) {
  const rel = normalize(decodeURIComponent(url.pathname.replace(/^\/media\//, ''))).replace(/^(\.\.(\/|\\|$))+/, '');
  const file = join(MEDIA, rel);
  if (!file.startsWith(MEDIA) || !existsSync(file)) return send(res, 404, { error: 'No such file.' });
  const info = await stat(file);
  const types = { jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', png: 'image/png', mp4: 'video/mp4' };
  res.setHeader('Content-Type', types[extname(file).slice(1).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Cache-Control', 'no-store');
  /* Ranges, so the dashboard's video player can seek. */
  const range = req.headers.range?.match(/bytes=(\d*)-(\d*)/);
  if (range) {
    const start = Number(range[1] || 0);
    const end = range[2] ? Number(range[2]) : info.size - 1;
    res.statusCode = 206;
    res.setHeader('Content-Range', `bytes ${start}-${end}/${info.size}`);
    res.setHeader('Content-Length', end - start + 1);
    createReadStream(file, { start, end }).pipe(res);
    return;
  }
  res.setHeader('Content-Length', info.size);
  createReadStream(file).pipe(res);
}

export default function cmsApi() {
  return {
    name: 'nerds-cms-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://localhost');
        try {
          if (url.pathname.startsWith('/api/')) return await api(req, res, url);
          if (url.pathname.startsWith('/media/')) return await media(req, res, url);
        } catch (err) {
          if (err.status !== 400 && err.status !== 404 && err.status !== 409 && err.status !== 413 && err.status !== 415 && err.status !== 422) console.error('[cms]', err);
          return send(res, err.status || 500, { error: err.message || 'Something went wrong.' });
        }
        next();
      });
    }
  };
}
