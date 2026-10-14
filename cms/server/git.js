/*
 * Publishing: the content and media the CMS changed, committed and pushed
 * on whatever branch is checked out. Only those paths — never code.
 */
import { execFile } from 'node:child_process';
import { ROOT } from './paths.js';

export const CONTENT_PATHS = ['src/content/cms.js', 'public/media', 'cms/originals'];

function git(args) {
  return new Promise((resolve, reject) => {
    execFile('git', args, { cwd: ROOT, maxBuffer: 8 * 1024 * 1024, windowsHide: true }, (err, stdout, stderr) => {
      if (err) reject(Object.assign(new Error((stderr || err.message).trim()), { status: 500 }));
      else resolve(String(stdout).trim());
    });
  });
}

/** The branch, and the content files changed since the last publish. */
export async function status() {
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']).catch(() => '?');
  const porcelain = await git(['status', '--porcelain', '--untracked-files=all', '--', ...CONTENT_PATHS]).catch(() => '');
  const changes = porcelain.split('\n').filter(Boolean).map((line) => {
    const code = line.slice(0, 2).trim();
    const path = line.slice(3).replace(/^"|"$/g, '');
    return { path, kind: code === '??' || code === 'A' ? 'added' : code === 'D' ? 'removed' : 'changed' };
  });
  const upstream = await git(['rev-parse', '--abbrev-ref', '@{u}']).catch(() => '');
  return { branch, upstream, changes };
}

/** Commit the content changes and push them. */
export async function publish(message) {
  const text = String(message || '').trim() || 'Content update (CMS)';
  await git(['add', '-A', '--', ...CONTENT_PATHS]);
  const staged = await git(['diff', '--cached', '--name-only', '--', ...CONTENT_PATHS]);
  if (!staged) throw Object.assign(new Error('Nothing to publish — no content has changed.'), { status: 400 });
  await git(['commit', '-m', text, '--', ...CONTENT_PATHS]);
  const branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const upstream = await git(['rev-parse', '--abbrev-ref', '@{u}']).catch(() => '');
  await git(upstream ? ['push'] : ['push', '-u', 'origin', branch]);
  return { branch, files: staged.split('\n').length };
}

/** Bring in what the other person published (only when nothing's pending here). */
export async function pull() {
  const { changes } = await status();
  if (changes.length) throw Object.assign(new Error('Publish (or undo) your own changes first, then get the latest.'), { status: 409 });
  return git(['pull', '--ff-only']);
}
