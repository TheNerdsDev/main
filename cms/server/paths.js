/* Where everything the CMS touches lives. */
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const CONTENT_FILE = join(ROOT, 'src', 'content', 'cms.js');
export const MEDIA = join(ROOT, 'public', 'media');
/* The pictures as they were uploaded, before fitting — kept (in git) so a
   screenshot moved to a differently shaped slot is redone from the
   original, not from an already fitted copy. */
export const ORIGINALS = join(ROOT, 'cms', 'originals');
/* Deleted projects and replaced files go here, never straight away. */
export const TRASH = join(ROOT, '.cms-trash');
export const TMP = join(ROOT, '.cms-tmp');

export const mediaDir = (slug) => join(MEDIA, slug);
export const originalsDir = (slug) => join(ORIGINALS, slug);
