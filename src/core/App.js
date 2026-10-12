import gsap from 'gsap';
import store from './Store.js';
import assets from './Assets.js';
import Scroll from './Scroll.js';
import Loader from './Loader.js';
import Router from './Router.js';
import World from '../gl/World.js';
import Cursor from './Cursor.js';
import LogoRocket from '../fx/LogoRocket.js';
import ContactForm from './ContactForm.js';
import { buildPage, createPage, loadPage, warmPages } from '../pages/index.js';
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
    this.bindLogo();

    this.world = new World(this.canvas);
    this.loader = new Loader();

    this.bindEvents();
    this.bindCopyButtons(document);
    this.bindForms(document);
    if (Cursor.supported()) this.cursor = new Cursor();

    this.start();
  }

  /* ------------------------------------------------------------ boot */

  async start() {
    /* Only what this page shows. (The work index's thumbnails used to be
       loaded here too, on every page — ~0.9 MB the loader waited for; they
       are now fetched once the page is up, see below.) */
    const urls = assets.collectFromDOM(document);
    /* This page's code, fetched while the loader loads its pictures. */
    const pageCode = loadPage(this.pageEl.dataset.page);

    await this.loader.preload([...new Set(urls)]);
    await pageCode;

    /* Build the page now, while the loader's rocket is still on its way:
       this is the heaviest stretch of work (a long block of the main
       thread), and the loader animates on the compositor, so it can't stall
       it. The landing then plays on a quiet main thread. */
    this.page = await createPage({ el: this.pageEl, world: this.world, app: this });
    this.world.media.create(this.pageEl, this.page.id);

    await this.loader.finish();

    gsap.ticker.add(this.loop);

    store.html.classList.remove('is-transitioning');
    store.html.classList.add('loaded');

    this.world.reveal();
    await this.loader.out();

    this.scroll.start();
    this.page.enter();

    this.router = new Router(this);
    this.router.prefetchAll(['/', '/work/', '/info/', ...projects.map((p) => `/work/${p.slug}/`)]);

    /* Warm the work index's thumbnails in idle moments, one at a time, so
       the first trip there is still instant — without the loader waiting
       on them. */
    const thumbs = projects.map((p) => `/media/${p.slug}/featured.jpg`);
    const later = (fn) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 400));
    const next = () => {
      const url = thumbs.shift();
      /* Then the other pages' code (pages/index.js). */
      if (!url) return warmPages();
      Promise.resolve(assets.load(url, { srgb: true })).catch(() => {}).finally(() => later(next));
    };
    later(next);
  }

  /* ------------------------------------------------------ navigation */

  async transition(nextPageEl, title) {
    const outgoing = this.page;

    /* 1 — pull the current page apart, and meanwhile fetch the next page's
       code: it has to be in hand before its markup goes in, or the markup
       shows raw (text at full opacity, nothing hidden for its entrance)
       while the code is still on the way. */
    const code = loadPage(nextPageEl.dataset.page);
    /* The exit animations, waited for — but never past 2.5s: an animation
       cut short by another never reports done, and a page change left
       waiting on it would freeze the site. */
    await Promise.race([
      Promise.all([
        outgoing.leave().then(() => {}),
        this.world.media.leave(),
        this.world.fadeTo(0.25, 0.55).then(() => {})
      ]),
      new Promise((r) => setTimeout(r, 2500))
    ]);
    const pageCode = await code;

    /* 2 — swap the DOM. (No page until the next is built: the loop mustn't
       run a destroyed one.) */
    outgoing.destroy();
    this.page = null;
    this.hoistHeader(nextPageEl);
    this.pageEl.replaceWith(nextPageEl);
    this.pageEl = nextPageEl;
    document.title = title;

    this.scroll.toTop();
    this.scroll.resize();
    this.bindCopyButtons(this.pageEl);
    this.bindForms(this.pageEl);

    /* 3 — build the incoming page, in the same task as the swap: it hides
       what its entrance reveals before the browser can paint it raw. */
    this.page = buildPage(pageCode, { el: this.pageEl, world: this.world, app: this });
    store.pageId = this.page.id;
    this.world.media.create(this.pageEl, this.page.id);

    await new Promise((r) => requestAnimationFrame(r));

    this.world.fadeTo(1, 0.7);
    this.page.enter();
  }

  /** A link to the page already showing: back to its top, the page's own way. */
  toTop() {
    if (store.isTransitioning) return;
    this.page?.toTop();
  }

  /* ---------------------------------------------------------- extras */

  /**
   * The header lives outside the page: one bar for the whole visit, so it
   * doesn't flicker between pages — and so its frosted glass can see (and
   * blur) the page beneath it. Inside a page's own stacking layer, the
   * backdrop blur has nothing to work with and text shows through.
   * Each incoming page's header only tells us which link is current (and
   * whether we're inside its section — a project, under Work).
   */
  hoistHeader(pageEl) {
    const incoming = pageEl.querySelector('.site-header');
    if (!incoming) return;
    if (!this.header) {
      this.header = incoming;
      document.body.insertBefore(incoming, document.body.firstChild);
      return;
    }
    const links = [...incoming.querySelectorAll('a')];
    const current = links.map((a) => a.classList.contains('is-current'));
    const inside = links.map((a) => a.classList.contains('is-inside'));
    [...this.header.querySelectorAll('a')].forEach((a, i) => {
      a.classList.toggle('is-current', !!current[i]);
      a.classList.toggle('is-inside', !!inside[i]);
      if (current[i]) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    incoming.remove();
  }

  /**
   * The header logo: hover (or tap, or keyboard focus) and its letters jump
   * one by one while the rocket flies a lap and settles back in the R.
   * Clicked on the page it links to (the router ignores a link to where you
   * already are), it glides you back up to the top.
   */
  bindLogo() {
    const mark = this.header?.querySelector('.logo-mark');
    if (!mark) return;
    this.logoRocket = new LogoRocket(mark);
    const link = mark.closest('a');
    link.addEventListener('pointerenter', () => this.logoRocket.play());
    link.addEventListener('focus', () => {
      if (link.matches(':focus-visible')) this.logoRocket.play();
    });
    link.addEventListener('click', (e) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      if (new URL(link.href).pathname !== window.location.pathname || !this.page?.goTop) return;
      e.preventDefault();
      /* Close the phone menu first: closing it hands the scroll back, which
         would cut the glide short. */
      this.setMenu?.(false);
      this.page.goTop();
    });
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

  /** The contact page's enquiry form (core/ContactForm.js). */
  bindForms(root) {
    root.querySelectorAll('[data-contact-form]').forEach((form) => {
      if (!form._contact) form._contact = new ContactForm(form);
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
