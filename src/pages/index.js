import Main from './Main.js';
import Projects from './Projects.js';
import Work from './Work.js';
import Info from './Info.js';
import Page from './Page.js';

const MAP = { main: Main, projects: Projects, work: Work, info: Info };

export const createPage = (opts) => {
  const Ctor = MAP[opts.el.dataset.page] || Page;
  return new Ctor(opts);
};
