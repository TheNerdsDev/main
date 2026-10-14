/*
 * A project's files: its media folder (what the site serves) and its
 * originals (what was uploaded). The screenshots' order and how each was
 * fitted are kept in cms/originals/<slug>/shots.json:
 *
 *   [{ id, original, mode, slot, wide }]   original: file name in the
 *   project's originals folder (null: the site's copy is the original);
 *   slot/wide: where and in what shape it was last written.
 *
 * Nothing is deleted: replaced and removed files go to .cms-trash.
 */
import { mkdir, readFile, writeFile, rename as move, copyFile, cp, readdir, stat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { MEDIA, TRASH, TMP, mediaDir, originalsDir } from './paths.js';
import { writeShot, writeThumb } from './media.js';

export const newId = () => randomBytes(4).toString('hex');

/** Move a file — or, where Windows holds it busy, copy it and clear up. */
export async function rename(from, to) {
  try {
    await move(from, to);
  } catch (err) {
    if (err.code !== 'EBUSY' && err.code !== 'EPERM' && err.code !== 'EXDEV') throw err;
    if ((await stat(from)).isDirectory()) await cp(from, to, { recursive: true });
    else await copyFile(from, to);
    await rm(from, { recursive: true, force: true }).catch(() => {});
  }
}
const pad = (n) => String(n).padStart(2, '0');
const stamp = () => new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

/** Move a file or folder into the trash (dated), if it's there. */
export async function trash(path, label) {
  if (!existsSync(path)) return;
  await mkdir(TRASH, { recursive: true });
  await rename(path, join(TRASH, `${stamp()}-${label}`));
}

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}
const writeJson = (file, data) => writeFile(file, `${JSON.stringify(data, null, 2)}\n`);

/* ---------------------------------------------------------- shots */

/**
 * A project's screenshots, in order. The first time, they're read from
 * its folder (a project with `photos` off has placeholders, not shots).
 */
export async function getShots(project) {
  const file = join(originalsDir(project.slug), 'shots.json');
  const saved = await readJson(file, null);
  if (saved) return saved;
  if (!project.photos) return [];
  return Array.from({ length: project.shots }, (_, i) => ({
    id: newId(), original: null, mode: 'fill', slot: i + 1, wide: i === 0
  }));
}

/** Where a shot's best source is: its original, else the site's copy. */
function sourceOf(slug, shot) {
  if (shot.original) return join(originalsDir(slug), shot.original);
  const base = join(mediaDir(slug), pad(shot.slot));
  return existsSync(`${base}.webp`) ? `${base}.webp` : `${base}.jpg`;
}

/**
 * Write a project's shots, in this order, as 01, 02, … — reusing a file
 * where it's already right (same slot, same shape), else refitting from
 * its original. Leftover numbered files go to the trash. Returns the list
 * as written; the caller updates the project's `shots` / `photos`.
 */
export async function layoutShots(project, shots) {
  const { slug } = project;
  const dir = mediaDir(slug);
  await mkdir(dir, { recursive: true });
  await mkdir(originalsDir(slug), { recursive: true });
  const stage = join(TMP, `shots-${slug}-${newId()}`);
  await mkdir(stage, { recursive: true });

  /* A shot with no original yet keeps a copy of its current file as one,
     before anything moves. */
  for (const s of shots) {
    if (s.original) continue;
    const from = sourceOf(slug, s);
    if (!existsSync(from)) continue;
    s.original = `shot-${s.id}${extname(from)}`;
    await copyFile(from, join(originalsDir(slug), s.original));
  }

  /* (One whose file has gone missing can't be laid out: it drops out.) */
  for (let i = shots.length - 1; i >= 0; i--) if (!shots[i].original) shots.splice(i, 1);

  /* Each into its new place, in the staging folder. */
  for (let i = 0; i < shots.length; i++) {
    const s = shots[i];
    const slot = i + 1;
    const wide = slot === 1;
    const out = join(stage, pad(slot));
    const old = join(dir, pad(s.slot ?? 0));
    if (s.slot && s.wide === wide && existsSync(`${old}.webp`)) {
      await copyFile(`${old}.webp`, `${out}.webp`);
      if (existsSync(`${old}.jpg`)) await copyFile(`${old}.jpg`, `${out}.jpg`);
    } else {
      await writeShot(join(originalsDir(slug), s.original), out, wide, s.mode);
    }
    s.slot = slot;
    s.wide = wide;
  }

  /* Out with the old numbered files, in with the staged ones. */
  for (const name of await readdir(dir)) {
    if (/^\d\d\.(webp|jpg)$/.test(name)) await trash(join(dir, name), `${slug}-${name}`);
  }
  for (const name of await readdir(stage)) await rename(join(stage, name), join(dir, name));
  await rm(stage, { recursive: true, force: true });

  await writeJson(join(originalsDir(slug), 'shots.json'), shots);
  return shots;
}

/** A new upload, kept as the original of a new shot. */
export async function keepShotOriginal(slug, file, ext, mode) {
  await mkdir(originalsDir(slug), { recursive: true });
  const id = newId();
  const original = `shot-${id}.${ext}`;
  await rename(file, join(originalsDir(slug), original));
  return { id, original, mode, slot: null, wide: null };
}

/* -------------------------------------------------------- thumbnail */

const metaFile = (slug) => join(originalsDir(slug), 'media.json');

export async function getThumbMeta(slug) {
  return (await readJson(metaFile(slug), {})).thumb || null;
}

/** A new thumbnail (or the same one fitted the other way). */
export async function setThumb(slug, { file, ext, mode }) {
  await mkdir(originalsDir(slug), { recursive: true });
  const dir = mediaDir(slug);
  await mkdir(dir, { recursive: true });
  const meta = await readJson(metaFile(slug), {});
  let original = meta.thumb?.original;
  if (file) {
    if (original) await trash(join(originalsDir(slug), original), `${slug}-${original}`);
    original = `thumb-${newId()}.${ext}`;
    await rename(file, join(originalsDir(slug), original));
  } else if (!original) {
    /* Refitting one that predates the CMS: its current file is the original. */
    if (!existsSync(join(dir, 'featured.jpg'))) throw Object.assign(new Error('Upload a thumbnail first.'), { status: 400 });
    original = `thumb-${newId()}.jpg`;
    await copyFile(join(dir, 'featured.jpg'), join(originalsDir(slug), original));
  }
  await writeThumb(join(originalsDir(slug), original), dir, mode);
  meta.thumb = { original, mode };
  await writeJson(metaFile(slug), meta);
  return meta.thumb;
}

/* --------------------------------------------------------- projects */

/** A project's folders, out of the way (trash), when it's deleted. */
export async function trashProject(slug) {
  await trash(mediaDir(slug), `project-${slug}`);
  await trash(originalsDir(slug), `originals-${slug}`);
}

/** What the dashboard shows about a project's files. */
export async function mediaInfo(project) {
  const dir = mediaDir(project.slug);
  const size = async (f) => { try { return (await stat(join(dir, f))).size; } catch { return 0; } };
  const shots = await getShots(project);
  return {
    thumb: (await size('featured.jpg')) > 0,
    thumbMode: (await getThumbMeta(project.slug))?.mode || (project.screenshot ? 'fit' : 'fill'),
    video: project.video && project.video.startsWith(`/media/${project.slug}/`) ? await size('preview.mp4') : 0,
    shots: shots.map((s) => ({ id: s.id, mode: s.mode, slot: s.slot }))
  };
}

export { MEDIA, TMP };
