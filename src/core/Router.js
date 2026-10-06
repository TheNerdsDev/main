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
      if (url.pathname === window.location.pathname) return;
      this.go(url.pathname);
    };

    this.onHover = (e) => {
      const link = e.target.closest('a[data-link]');
      if (!link) return;
      const url = new URL(link.href, window.location.origin);
      if (url.origin === window.location.origin) this.prefetch(url.pathname);
    };

    this.onPop = () => this.go(window.location.pathname, false);

    document.addEventListener('click', this.onClick);
    document.addEventListener('pointerover', this.onHover, { passive: true });
    window.addEventListener('popstate', this.onPop);
  }

  async prefetch(path) {
    if (this.cache.has(path)) return this.cache.get(path);
    const promise = fetch(path, { credentials: 'same-origin' })
      .then((r) => (r.ok ? r.text() : null))
      .catch(() => null);
    this.cache.set(path, promise);
    return promise;
  }

  /** Warm every route in the background once the site is idle. */
  prefetchAll(paths) {
    const run = () => paths.forEach((p) => this.prefetch(p));
    if ('requestIdleCallback' in window) requestIdleCallback(run, { timeout: 3000 });
    else setTimeout(run, 1200);
  }

  async go(path, push = true) {
    if (store.isTransitioning || path === this.current) return;

    const html = await this.prefetch(path);
    if (!html) { window.location.href = path; return; }

    store.isTransitioning = true;
    store.html.classList.add('is-transitioning');

    const doc = new DOMParser().parseFromString(html, 'text/html');
    const nextPage = doc.querySelector('.page');
    if (!nextPage) { window.location.href = path; return; }

    if (push) history.pushState({ path }, '', path);
    this.current = path;

    await this.app.transition(nextPage, doc.title);

    store.isTransitioning = false;
    store.html.classList.remove('is-transitioning');
  }

  destroy() {
    document.removeEventListener('click', this.onClick);
    document.removeEventListener('pointerover', this.onHover);
    window.removeEventListener('popstate', this.onPop);
  }
}
