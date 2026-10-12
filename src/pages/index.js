import Page from './Page.js';

/* Each page's own code loads only where it's needed — the welcome page's
   rocks, reel and About frames stay out of every other page's download. App
   starts the current page's load at boot, alongside the loader, and warms
   the rest once the page is up, so a navigation never waits on one. */
const LOADERS = {
  main: () => import('./Main.js'),
  projects: () => import('./Projects.js'),
  work: () => import('./Work.js'),
  info: () => import('./Info.js')
};

export const loadPage = (id) => (LOADERS[id] ? LOADERS[id]() : Promise.resolve(null));

/** Build a page from its already-loaded code (loadPage), synchronously. */
export const buildPage = (mod, opts) => new (mod?.default || Page)(opts);

export const createPage = async (opts) => buildPage(await loadPage(opts.el.dataset.page), opts);

export const warmPages = () => Object.values(LOADERS).forEach((load) => load().catch(() => {}));
