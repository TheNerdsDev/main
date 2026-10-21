import gsap from 'gsap';
import store from './Store.js';
import assets from './Assets.js';

/**
 * Client-side router that keeps the WebGL canvas alive across navigations.
 * Falls back to a normal page load on anything it cannot handle.
 */
export default class Router {
  constructor(app) {
    this.app = app;
    this.cache = new Map();
    this.current = window.location.pathname;
    /* Every page starts at its top (App.transition). Left to the browser,
       Back would put the old scroll position back as well — the next page
       then arrives scrolled deep into nothing. */
    if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

    this.bind();
  }

  bind() {
    this.onClick = (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const link = e.target.closest('a[data-link]');
      if (!link) return;

      const url = new URL(link.href, window.location.origin);
      if (url.origin !== window.location.origin) return;
      if (link.target === '_blank') return;

      e.preventDefault();
      /* A link to the page already showing (the logo, mostly): back to its top. */
      if (url.pathname === window.location.pathname) {
        if (!url.hash) this.app.toTop();
        return;
      }
      this.go(url.pathname);
    };

    this.onHover = (e) => {
      const link = e.target.closest('a[data-link]');
      if (!link) return;
      const url = new URL(link.href, window.location.origin);
      if (url.origin === window.location.origin) this.prefetch(url.pathname);
    };

    /* Back or forward while a page is still changing: go there as soon as
       it's done (ignored, the address and the page would disagree). */
    this.onPop = () => this.go(window.location.pathname, false);

    document.addEventListener('click', this.onClick);
    document.addEventListener('pointerover', this.onHover, { passive: true });
    window.addEventListener('popstate', this.onPop);
  }

  /**
   * The page's HTML (null if it can't be had: go() then loads the page in
   * full). Given 8s at most — on a phone with a poor connection a fetch
   * can hang far longer, and the site would sit waiting with every click
   * turned off. A failure isn't remembered: the next try asks again.
   */
  async prefetch(path) {
    if (this.cache.has(path)) return this.cache.get(path);
    const abort = 'AbortController' in window ? new AbortController() : null;
    const late = setTimeout(() => abort?.abort(), 8000);
    const promise = fetch(path, { credentials: 'same-origin', signal: abort?.signal })
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null)
      .then((html) => {
        clearTimeout(late);
        if (html === null) {
          console.warn(`[router] couldn't fetch ${path}, it will load in full`);
          if (this.cache.get(path) === promise) this.cache.delete(path);
        }
        return html;
      });
    this.cache.set(path, promise);
    return promise;
  }

  /** Warm every route in the background once the site is idle. */
  prefetchAll(paths) {
    const run = () => paths.forEach((p) => this.prefetch(p));
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 3000 });
    else setTimeout(run, 1200);
  }

  /**
   * Change to the page at `path`, one change at a time. Asked for another
   * while one is under way (a second click, Back), it goes there as soon as
   * this one's done: the last one asked for wins, none is dropped.
   */
  async go(path, push = true) {
    if (store.isTransitioning) {
      this.pending = { path, push };
      return;
    }
    /* (Nowhere to go: the phone menu, left open for the change, closes.) */
    if (path === this.current) { this.app.setMenu?.(false); return; }

    /* Claimed before the fetch: a click while the next page's HTML is on its
       way would otherwise start a second change alongside this one, the two
       fighting over the page. */
    store.isTransitioning = true;
    store.html.classList.add('is-transitioning');

    try {
      const html = await this.prefetch(path);
      const doc = html && new DOMParser().parseFromString(html, 'text/html');
      const nextPage = doc && doc.querySelector('.page');
      if (!nextPage) { window.location.href = path; return; }

      if (push) history.pushState({ path }, '', path);
      this.current = path;

      await this.app.transition(nextPage, doc.title);
    } catch (err) {
      /* A swap that fails halfway would otherwise leave the site frozen
         (is-transitioning turns every click off). Load the page properly
         instead. */
      console.error('[Router] page change failed, loading it in full', err);
      window.location.href = path;
    } finally {
      store.isTransitioning = false;
      store.html.classList.remove('is-transitioning');
    }

    const next = this.pending;
    this.pending = null;
    if (next && next.path !== this.current) this.go(next.path, next.push);
  }

  destroy() {
    document.removeEventListener('click', this.onClick);
    document.removeEventListener('pointerover', this.onHover);
    window.removeEventListener('popstate', this.onPop);
  }
}
