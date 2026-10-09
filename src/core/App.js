import gsap from 'gsap';
import store from './Store.js';
import assets from './Assets.js';
import Scroll from './Scroll.js';
import Loader from './Loader.js';
import Router from './Router.js';
import World from '../gl/World.js';
import Cursor from './Cursor.js';
import { createPage } from '../pages/index.js';
import { projects } from '../content/site.js';

/**
 * Copy text to the clipboard. The async Clipboard API only exists on
 * secure origins (https / localhost) — on a LAN address like
 * http://192.168.x.x it's missing, so fall back to the older
 * execCommand route instead of giving up.
 */
const copyText = async (text) => {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.appendChild(ta);
  ta.select();
  const ok = document.execCommand('copy');
  ta.remove();
  if (!ok) throw new Error('copy failed');
};

export default class App {
  constructor() {
    this.canvas = document.querySelector('.canvas');
    this.pageEl = document.querySelector('.page');
    this.hoistHeader(this.pageEl);

    store.html.classList.add('webgl');

    this.scroll = new Scroll();
    this.scroll.stop();
    this.bindMenu();

    this.world = new World(this.canvas);
    this.loader = new Loader();

    this.bindEvents();
    this.bindCopyButtons(document);
    if (Cursor.supported()) this.cursor = new Cursor();

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
    this.hoistHeader(nextPageEl);
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

  /**
   * The header lives outside the page: one bar for the whole visit, so it
   * doesn't flicker between pages — and so its frosted glass can see (and
   * blur) the page beneath it. Inside a page's own stacking layer, the
   * backdrop blur has nothing to work with and text shows through.
   * Each incoming page's header only tells us which link is current.
   */
  hoistHeader(pageEl) {
    const incoming = pageEl.querySelector('.site-header');
    if (!incoming) return;
    if (!this.header) {
      this.header = incoming;
      document.body.insertBefore(incoming, document.body.firstChild);
      return;
    }
    const current = [...incoming.querySelectorAll('a')].map((a) => a.classList.contains('is-current'));
    [...this.header.querySelectorAll('a')].forEach((a, i) => {
      a.classList.toggle('is-current', !!current[i]);
      if (current[i]) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    incoming.remove();
  }

  /**
   * Phones: the three-line button opens the links as a panel under the
   * bar. Following a link, Escape, or widening past the phone layout
   * closes it; the page doesn't scroll underneath while it's open.
   */
  bindMenu() {
    const header = this.header;
    const btn = header?.querySelector('.menu-toggle');
    if (!btn) return;
    this.setMenu = (open) => {
      if (open === header.classList.contains('is-open')) return;
      header.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
      /* Only hand scrolling back if the menu was what stopped it. */
      if (open && store.html.classList.contains('loaded')) {
        this.scroll.stop();
        this.menuHeldScroll = true;
      } else if (!open && this.menuHeldScroll) {
        this.menuHeldScroll = false;
        this.scroll.start();
      }
    };
    btn.addEventListener('click', () => this.setMenu(!header.classList.contains('is-open')));
    header.addEventListener('click', (e) => {
      if (e.target.closest('a')) this.setMenu(false);
    });
    window.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !header.classList.contains('is-open')) return;
      this.setMenu(false);
      btn.focus();
    });
    window.matchMedia('(max-width: 767px)').addEventListener('change', (e) => {
      if (!e.matches) this.setMenu(false);
    });
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
          await copyText(email);
          if (feedback) {
            gsap.killTweensOf(feedback);
            gsap.fromTo(feedback,
              { opacity: 0, y: 6 },
              { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' }
            );
            gsap.to(feedback, { opacity: 0, duration: 0.4, delay: 1.6, ease: 'power2.in' });
          }
        } catch {
          /* Copying is blocked entirely — select the address so it can be copied by hand. */
          const text = btn.querySelector('.contact-address-text, .line-inner');
          if (text) window.getSelection()?.selectAllChildren(text);
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
