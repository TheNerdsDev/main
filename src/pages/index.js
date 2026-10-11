import Page from './Page.js';

/* Each page's own code loads only where it's needed — the welcome page's
   rocks, reel and portholes stay out of every other page's download. App
   starts the current page's load at boot, alongside the loader, and warms
   the rest once the page is up, so a navigation never waits on one. */
const LOADERS = {
  main: () => import('./Main.js'),
  projects: () => import('./Projects.js'),
  work: () => import('./Work.js'),
  info: () => import('./Info.js')
};

export const loadPage = (id) => (LOADERS[id] ? LOADERS[id]() : Promise.resolve(null));

export const createPage = async (opts) => {
  const mod = await loadPage(opts.el.dataset.page);
  const Ctor = mod?.default || Page;
  return new Ctor(opts);
};

export const warmPages = () => Object.values(LOADERS).forEach((load) => load().catch(() => {}));
