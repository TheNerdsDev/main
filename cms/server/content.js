/*
 * The CMS's content: src/content/cms.js (a header comment, then
 * `export default` and the JSON). Read, checked, written back — and the
 * site's pages regenerated, so the dev server shows the change at once.
 */
import { readFile, writeFile, rename } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { HEADER } from './header.js';
import { ROOT, CONTENT_FILE } from './paths.js';

export async function readContent() {
  const text = await readFile(CONTENT_FILE, 'utf8');
  /* (At the start of a line: the header comment mentions it too.) */
  const m = text.match(/^export default\s*/m);
  if (!m) throw new Error('src/content/cms.js has no `export default`');
  const json = text.slice(m.index + m[0].length).trim().replace(/;\s*$/, '');
  return JSON.parse(json);
}

/** Write it whole (through a temp file, so a crash can't leave half a file). */
export async function writeContent(data) {
  const problems = check(data);
  if (problems.length) {
    const err = new Error(problems.join(' '));
    err.status = 422;
    throw err;
  }
  const tmp = `${CONTENT_FILE}.tmp`;
  await writeFile(tmp, `${HEADER}export default ${JSON.stringify(data, null, 2)};\n`, 'utf8');
  await rename(tmp, CONTENT_FILE);
}

const YEAR = /^\d{4}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** What's wrong with it, in words for the dashboard; empty when it's fine. */
export function check(data) {
  const out = [];
  if (!data || typeof data !== 'object') return ['The content is missing.'];
  const { home, about, projects } = data;
  if (!Array.isArray(projects)) return ['The projects list is missing.'];

  const slugs = new Set();
  projects.forEach((p, i) => {
    const who = p?.name ? `“${p.name}”` : `Project ${i + 1}`;
    if (!p || typeof p !== 'object') return out.push(`${who} is not valid.`);
    if (!SLUG.test(p.slug || '')) out.push(`${who} has an invalid web address (slug).`);
    if (slugs.has(p.slug)) out.push(`Two projects share the address “${p.slug}”.`);
    slugs.add(p.slug);
    if (!String(p.name || '').trim()) out.push(`Project ${i + 1} needs a name.`);
    if (!YEAR.test(String(p.year || ''))) out.push(`${who}: the year must be four digits, like 2026.`);
    if (p.github && !/^https:\/\/github\.com\/[\w.-]+(\/[\w.-]+)?\/?$/i.test(p.github)) {
      out.push(`${who}: the GitHub link must look like https://github.com/you/repo.`);
    }
    if (p.accent && !HEX.test(p.accent)) out.push(`${who}: the colour must be a hex colour like #E63946.`);
    if (!Number.isInteger(p.shots) || p.shots < 0) out.push(`${who}: the screenshot count is not valid.`);
  });

  const live = projects.filter((p) => !p.hidden).length;
  if (!live) out.push('At least one project has to be shown on the site.');
  const n = home?.showcase;
  if (!Number.isInteger(n) || n < 1) out.push('The home page has to show at least one project.');
  else if (live && n > live) out.push(`The home page can show at most ${live} project${live === 1 ? '' : 's'} (the ones shown on the site).`);

  const m = data.maintenance;
  if (m !== undefined) {
    const text = (v, max) => typeof v === 'string' && v.length <= max;
    if (!m || typeof m !== 'object' || typeof m.on !== 'boolean') out.push('The maintenance setting is not valid.');
    else {
      if (!text(m.title, 80) || !m.title.trim()) out.push('The maintenance page needs a heading (80 characters at most).');
      if (!text(m.message ?? '', 400)) out.push('The maintenance message can be 400 characters at most.');
      if (!text(m.back ?? '', 80)) out.push('“Back by” can be 80 characters at most.');
    }
  }

  const list = (x) => Array.isArray(x) && x.every((s) => typeof s === 'string');
  if (!about?.offer || !list(about.offer.items)) out.push('The Offer’s list is not valid.');
  if (!about?.work || !Array.isArray(about.work.kinds)) out.push('The Work’s list is not valid.');
  else about.work.kinds.forEach((k, i) => {
    if (!String(k?.name || '').trim()) out.push(`The Work: kind ${i + 1} needs a name.`);
    if (!list(k?.items)) out.push(`The Work: “${k?.name || i + 1}” has an invalid list.`);
  });
  return out;
}

/** Rebuild the site's pages from the content (the dev server reloads). */
export function regenerate() {
  return new Promise((resolve, reject) => {
    execFile(process.execPath, ['scripts/generate-pages.mjs'], { cwd: ROOT }, (err, stdout, stderr) => {
      if (err) reject(new Error(`Rebuilding the pages failed: ${stderr || err.message}`));
      else resolve(stdout.trim());
    });
  });
}
