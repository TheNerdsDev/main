import gsap from 'gsap';
import store from './Store.js';
import assets from './Assets.js';
import Scroll from './Scroll.js';
import Loader from './Loader.js';
import Router from './Router.js';
import World from '../gl/World.js';
import { createPage } from '../pages/index.js';
import { projects } from '../content/site.js';

export default class App {
  constructor() {
    this.canvas = document.querySelector('.canvas');
    this.pageEl = document.querySelector('.page');

    store.html.classList.add('webgl');

    this.scroll = new Scroll();
    this.scroll.stop();

    this.world = new World(this.canvas);
    this.loader = new Loader();

    this.bindEvents();
    this.createCurveToggle();
    this.bindCopyButtons(document);

    this.start();
  }

  /* ------------------------------------------------------------ boot */

  async start() {
    const urls = assets.collectFromDOM(document);
    /* Warm the index thumbnails too, so the first navigation is instant. */
    projects.forEach((p) => urls.push(`/media/${p.slug}/featured.jpg`));

    await this.loader.preload([...new Set(urls)]);
    await this.loader.finish();

    this.page = createPage({ el: this.pageEl, world: this.world, app: this });
    this.world.media.create(this.pageEl, this.page.id);

    gsap.ticker.add(this.loop);

    store.html.classList.remove('is-transitioning');
    store.html.classList.add('loaded');

    this.world.reveal();
    await this.loader.out();

    this.scroll.start();
    this.page.enter();

    this.router = new Router(this);
    this.router.prefetchAll(['/', '/work/', '/info/', ...projects.map((p) => `/work/${p.slug}/`)]);
  }

  /* ------------------------------------------------------ navigation */

  async transition(nextPageEl, title) {
    const outgoing = this.page;

    /* 1 — pull the current page apart. */
    await Promise.all([
      outgoing.leave().then(() => {}),
      this.world.media.leave(),
      this.world.fadeTo(0.25, 0.55).then(() => {})
    ]);

    /* 2 — swap the DOM. */
    outgoing.destroy();
    this.pageEl.replaceWith(nextPageEl);
    this.pageEl = nextPageEl;
    document.title = title;

    this.scroll.toTop(true);
    this.scroll.resize();
    this.bindCopyButtons(this.pageEl);

    /* 3 — build the incoming page. */
    this.page = createPage({ el: this.pageEl, world: this.world, app: this });
    store.pageId = this.page.id;
    this.world.media.create(this.pageEl, this.page.id);

    await new Promise((r) => requestAnimationFrame(r));

    this.world.fadeTo(1, 0.7);
    this.page.enter();
  }

  /* ---------------------------------------------------------- extras */

  createCurveToggle() {
    if (store.isMobile) return;

    const btn = document.createElement('button');
    btn.className = 'curve-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', 'Toggle curved view');
    btn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12h20M2 12c0-5 4.5-9 10-9s10 4 10 9" /></svg>';

    btn.addEventListener('click', () => {
      const next = !store.isCurveMode;
      this.world.setCurve(next);
      btn.classList.toggle('is-active', next);
      btn.setAttribute('aria-pressed', String(next));
    });

    document.body.appendChild(btn);
    this.curveToggle = btn;
  }

  bindCopyButtons(root) {
    root.querySelectorAll('[data-email]').forEach((btn) => {
      if (btn._bound) return;
      btn._bound = true;

      btn.addEventListener('click', async () => {
        const email = btn.getAttribute('data-email');
        const feedback = btn.parentElement?.querySelector('.copied')
          || btn.closest('.nav, .meta')?.querySelector('.copied');

        try {
          await navigator.clipboard.writeText(email);
          if (feedback) {
            gsap.killTweensOf(feedback);
            gsap.fromTo(feedback,
              { opacity: 0, y: 6 },
              { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' }
            );
            gsap.to(feedback, { opacity: 0, duration: 0.4, delay: 1.6, ease: 'power2.in' });
          }
        } catch {
          window.location.href = `mailto:${email}`;
        }
      });
    });
  }

  /* ------------------------------------------------------------ loop */

  bindEvents() {
    let t;
    this.onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        store.resize();
        this.world.resize();
        this.scroll.resize();
        this.page?.resize();
        this.world.media.resize();
      }, 150);
    };
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
  }

  loop = (time) => {
    /* The page moves the carousel's DOM boxes; the world reads them.
       Order matters — swap these and the planes lag a frame behind. */
    this.page?.loop();
    this.world.loop(time);
  };

  destroy() {
    gsap.ticker.remove(this.loop);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    this.router?.destroy();
    this.world.destroy();
    this.scroll.destroy();
  }
}
