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
import gpu from './gpu.js';
import plainSite from './plain.js';
import { pacer } from './pace.js';
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

/**
 * The page's photos on its first screen and a half, fetched now (not
 * lazily) and decoded — never waited on for more than 4s.
 */
/*
 * A page's own code (pages/index.js). If it doesn't come — a dropped
 * connection on a phone, or a new release has replaced its file — on a
 * page change the router loads the page in full instead (Router.go); at
 * boot the page is reloaded once, and failing that runs as plain HTML
 * (App.rescue). (Not simply asked for again: the browser remembers a
 * module that failed, and hands back the same failure.)
 */
const pageCodeFor = (id) => loadPage(id).catch((err) => {
  gpu.warn(`page code for "${id}" failed to load`, err);
  throw err;
});

const decodeFirst = (root) => {
  const near = window.innerHeight * 1.5;
  /* (Shown ones only: one in a hidden box — the desktop index rail's
     previews, on a phone — measures as being at the top.) */
  const imgs = [...root.querySelectorAll('[data-media] img')].filter((img) => {
    const r = img.getBoundingClientRect();
    return r.width > 0 && r.top < near;
  });
  imgs.forEach((img) => { img.loading = 'eager'; });
  return Promise.race([
    Promise.all(imgs.map((img) => img.decode().catch(() => {
      if (img.complete && !img.naturalWidth) gpu.warn(`image failed to load: ${img.currentSrc || img.src}`);
    }))),
    new Promise((r) => setTimeout(r, 4000))
  ]);
};

export default class App {
  constructor() {
    this.canvas = document.querySelector('.canvas');
    this.pageEl = document.querySelector('.page');
    this.hoistHeader(this.pageEl);

    store.html.classList.add('webgl');
    /* Phones: photos as plain images (core/Store.js isPhone). */
    store.html.classList.toggle('flat-media', store.isPhone);

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

    /* Whatever goes wrong on the way up, never a page stuck behind the loader. */
    this.start().catch((err) => this.rescue(err));
  }

  /**
   * The site couldn't start. Reload once (a release may have replaced the
   * files this copy of the page asks for); if it fails again, the page as
   * plain HTML — readable, its links working.
   */
  rescue(err) {
    console.error('[app] start failed', err);
    let again = false;
    try {
      again = sessionStorage.getItem('rescued') === location.pathname;
      sessionStorage.setItem('rescued', location.pathname);
    } catch { again = true; }
    if (!again) {
      location.reload();
      return;
    }
    gsap.ticker.remove(this.loop);
    try { this.scroll.destroy(); } catch { /* not started */ }
    try { this.world.destroy(); } catch { /* not started */ }
    /* (Undo the entrance's starting point: text and photos hidden, waiting for it.) */
    document.querySelectorAll('.page [style]').forEach((el) => {
      el.style.removeProperty('opacity');
      el.style.removeProperty('transform');
      el.style.removeProperty('translate');
      el.style.removeProperty('visibility');
    });
    plainSite();
  }

  /* ------------------------------------------------------------ boot */

  async start() {
    /* Only what this page shows. (The work index's thumbnails used to be
       loaded here too, on every page — ~0.9 MB the loader waited for; they
       are now fetched once the page is up, see below.) */
    /* (Phones show the photos as images, not textures — Store isPhone:
       the ones on the first screen and a half are fetched and decoded
       instead, so none of them pops in once the loader lifts.) */
    const urls = store.isPhone ? [] : assets.collectFromDOM(document);
    const firstImages = store.isPhone ? decodeFirst(document) : Promise.resolve();
    /* This page's code, fetched while the loader loads its pictures. */
    const pageCode = pageCodeFor(this.pageEl.dataset.page);
    /* …and the subtext's font: the page measures its lines when it's built,
       so they must break where the real font breaks them. (Never waited on
       for more than 2s — a font that won't come leaves the fallback.) */
    const subtextFont = Promise.race([
      Promise.all(['400', '700'].map((w) => document.fonts?.load(`${w} 1em "Atkinson Hyperlegible"`))),
      new Promise((r) => setTimeout(r, 2000))
    ]).catch(() => {});

    await this.loader.preload([...new Set(urls)]);
    await firstImages;
    await pageCode;
    await subtextFont;

    /* Build the page now, while the loader's rocket is still on its way:
       this is the heaviest stretch of work (a long block of the main
       thread), and the loader animates on the compositor, so it can't stall
       it. The landing then plays on a quiet main thread. */
    this.page = await createPage({ el: this.pageEl, world: this.world, app: this });
    this.world.media.create(this.pageEl, this.page.id);
    /* …and its shaders, in parallel, while the rocket comes in to land. */
    const warmed = this.world.warm();

    await this.loader.finish();
    await Promise.race([warmed, new Promise((r) => setTimeout(r, 600))]);

    gsap.ticker.add(this.loop);

    store.html.classList.remove('is-transitioning');
    store.html.classList.add('loaded');
    try { sessionStorage.removeItem('rescued'); } catch { /* storage off */ }

    this.world.reveal();
    await this.loader.out();

    this.scroll.start();
    this.page.enter();

    this.router = new Router(this);
    this.router.prefetchAll(['/', '/work/', '/info/', ...projects.map((p) => `/work/${p.slug}/`)]);

    /* Warm the About page's photo and the work index's thumbnails in idle
       moments, one at a time, so the first trip to either is still instant
       (decoded and on the GPU already) — without the loader waiting on them. */
    /* (Phones: the images they actually show — the thumbnails' 960px WebP —
       fetched and decoded, not made into textures.) */
    /* (Phones also get the menu's moons decoded ahead: left to the first
       tap, decoding them held up the first frame of its opening.) */
    const moons = [1, 2, 3, 4].map((i) => `/media/menu/moon-${i}.webp`);
    const thumbs = store.isPhone
      ? [...moons, '/media/studio/portrait.jpg', ...projects.map((p) => `/media/${p.slug}/featured-960.webp`)]
      : ['/media/studio/portrait.jpg', ...projects.map((p) => `/media/${p.slug}/featured.jpg`)];
    const warm = (url) => {
      if (!store.isPhone) return assets.load(url, { srgb: true });
      const img = new Image();
      img.src = url;
      return img.decode();
    };
    const later = (fn) => ('requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 3000 }) : setTimeout(fn, 400));
    const next = () => {
      const url = thumbs.shift();
      /* Then the other pages' code (pages/index.js). */
      if (!url) return warmPages();
      Promise.resolve().then(() => warm(url)).catch(() => {}).finally(() => later(next));
    };
    later(next);
  }

  /* ------------------------------------------------------ navigation */

  async transition(nextPageEl, title) {
    const outgoing = this.page;
    /* (Renderers the old page keeps for later are let go, on a phone, if
       the next page hasn't taken them up after a while there: gpu.js. Not
       at once: straight back to the page that had them, they're taken up
       again — no new renderer and shaders to build mid page change.) */
    const settle = gpu.changing();

    /* 1 — pull the current page apart, and meanwhile fetch the next page's
       code: it has to be in hand before its markup goes in, or the markup
       shows raw (text at full opacity, nothing hidden for its entrance)
       while the code is still on the way. */
    const code = pageCodeFor(nextPageEl.dataset.page);
    /* (Not here at all: Router.go loads the page in full. Caught for now,
       so it isn't reported as unhandled while the exit plays.) */
    code.catch(() => {});
    /* Followed from the phone menu, the panel is over the page: there's no
       exit to see, so none is waited for — straight to the next page, and
       the panel opens onto it (step 3). */
    const covered = this.header?.classList.contains('is-open');
    /* The exit animations, waited for — but never past 2.5s: an animation
       cut short by another never reports done, and a page change left
       waiting on it would freeze the site. */
    if (!covered) {
      await Promise.race([
        Promise.all([
          outgoing.leave().then(() => {}),
          this.world.media.leave(),
          this.world.fadeTo(0.25, 0.55).then(() => {})
        ]),
        new Promise((r) => setTimeout(r, 2500))
      ]);
    }
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
    /* Phones: its first photos decoded before it fades in (a moment at
       most — they were fetched ahead in idle time). */
    if (store.isPhone) await Promise.race([decodeFirst(this.pageEl), new Promise((r) => setTimeout(r, 700))]);

    if (covered) this.setMenu?.(false);
    this.world.fadeTo(1, 0.7);
    this.page.enter();
    setTimeout(settle, 12000);
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
    const nav = header.querySelector('.nav');
    this.setMenu = (open) => {
      if (open === header.classList.contains('is-open')) return;
      /* The panel opens as an iris from the button itself (base.css), just
         wide enough to reach the farthest corner: any wider and closing
         would spend its first moments shrinking where nothing shows. */
      if (open && nav) {
        const b = btn.getBoundingClientRect();
        const n = nav.getBoundingClientRect();
        const x = b.left + b.width / 2 - n.left;
        const y = b.top + b.height / 2 - n.top;
        const r = Math.hypot(Math.max(x, n.width - x), Math.max(y, n.height - y));
        nav.style.setProperty('--iris-x', `${x}px`);
        nav.style.setProperty('--iris-y', `${y}px`);
        nav.style.setProperty('--iris-r', `${Math.ceil(r) + 24}px`);
      }
      /* From the tap, the sky, the rocks and the page beneath stop being
         drawn (store.covered): each canvas holds its last frame, so what
         shows round the opening iris is the page as it was, still for the
         moment it takes — and the phone has nothing to do but open the
         menu (whose own movement all runs on the compositor: base.css).
         Closing, they draw again from the first frame. The page is shut
         off once the iris is fully open (lock): turning the whole page
         inert and stopping its scroll (a class on <html>) made the browser
         restyle and lay out every element on the page — at the tap, frames
         lost just as the iris began to open. (Meanwhile the panel itself
         doesn't pass a drag on to the page: base.css.) */
      clearTimeout(this.menuCovering);
      if (open) {
        store.covered = true;
        this.menuCovering = setTimeout(() => lock(true), 900);
      } else {
        store.covered = false;
        lock(false);
      }
      /* Closing, the moons keep flying until the iris has shut over them. */
      clearTimeout(this.menuClosing);
      header.classList.toggle('is-closing', !open);
      if (!open) this.menuClosing = setTimeout(() => header.classList.remove('is-closing'), 600);
      header.classList.toggle('is-open', open);
      btn.setAttribute('aria-expanded', String(open));
      btn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    };
    /* The page under the panel can't be reached — not by Tab, not by a
       screen reader — while it's covered; the header (logo, button, links)
       is all there is. Escape or the button closes it. And it doesn't
       scroll. (Only hand scrolling back if the menu was what stopped it.) */
    const lock = (on) => {
      if (this.pageEl && this.pageEl.inert !== on) this.pageEl.inert = on;
      if (on && store.html.classList.contains('loaded') && !this.menuHeldScroll) {
        this.scroll.stop();
        this.menuHeldScroll = true;
      } else if (!on && this.menuHeldScroll) {
        this.menuHeldScroll = false;
        this.scroll.start();
      }
    };
    btn.addEventListener('click', () => this.setMenu(!header.classList.contains('is-open')));
    header.addEventListener('click', (e) => {
      const a = e.target.closest('a');
      if (!a) return;
      /* A link to another of our pages: the panel stays over this one while
         it changes, and opens onto the next (transition). Anything else
         (mail, a new tab, this same page) closes it now. */
      const away = a.matches('[data-link]') && a.target !== '_blank' && this.router &&
        e.button === 0 && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) &&
        new URL(a.href, window.location.origin).pathname !== window.location.pathname;
      if (!away) this.setMenu(false);
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
    /* Everything re-measured and redrawn for the viewport and resolution
       in the store (a resize, or a step down in quality: watch). */
    this.refit = () => {
      this.world.resize();
      this.scroll.resize();
      this.page?.resize();
      this.world.media.resize();
    };
    this.onResize = () => {
      clearTimeout(t);
      t = setTimeout(() => {
        /* On a phone, most resizes are just the address bar sliding in or
           out: the viewport the site draws against doesn't change (Store),
           so nothing is re-measured, re-split or reallocated mid-scroll. */
        if (store.resize()) this.refit();
      }, 150);
    };
    window.addEventListener('resize', this.onResize);
    window.addEventListener('orientationchange', this.onResize);
  }

  /* (The sky at a steady 60 fps on a phone with a faster screen: core/pace.js.) */
  skyPace = pacer();

  loop = (time, deltaMs) => {
    /* Hidden under the open phone menu: nothing to draw. */
    if (store.covered) return;
    /* The page moves the carousel's DOM boxes; the world reads them.
       Order matters — swap these and the planes lag a frame behind. */
    this.page?.loop();
    if (this.skyPace(deltaMs)) this.world.loop(time);
    this.watch(deltaMs);
  };

  /**
   * A device that can't keep up steps down to drawing lighter (fewer
   * pixels in every canvas: store.setDpr) — and, if that's not enough,
   * once more. Judged on the typical frame over two seconds or so: when a
   * third of them miss the screen's refresh, it's slow. Hitches (a page
   * being built, a tab coming back) don't count, nor anything while the
   * page is hidden or changing.
   */
  watch(dt) {
    if (store.quality >= 2 || document.hidden || store.isTransitioning || !(dt < 100)) return;
    const f = (this.frames ||= []);
    f.push(dt);
    if (f.length < 120) return;
    f.sort((a, b) => a - b);
    const slow = f[80] > 21;
    f.length = 0;
    if (!slow) return;
    store.quality += 1;
    store.setDpr();
    this.refit();
  }

  destroy() {
    gsap.ticker.remove(this.loop);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('orientationchange', this.onResize);
    this.router?.destroy();
    this.world.destroy();
    this.scroll.destroy();
  }
}
