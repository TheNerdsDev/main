import Page from './Page.js';
import store from '../core/Store.js';
import { PALETTE } from '../gl/World.js';
import Finale from '../fx/Finale.js';
import magnetic from '../fx/magnetic.js';

/** About: who we are, what we do, then the same closing screen as the welcome page. */
export default class Info extends Page {
  constructor(opts) {
    super(opts);
    this.world?.setAccent('#' + PALETTE.accent.getHexString());
    const finale = this.el.querySelector('.finale');
    this.finaleFx = finale ? new Finale(finale) : null;
    this.unmagnet = magnetic([this.el.querySelector('.finale-button')]);
    this.bindCards();
    this.bindWork();
  }

  /**
   * The Work: pointing at one of its kinds (or focusing it, or tapping it)
   * opens its panel. With a mouse on a wide screen the panel sits beside
   * the box, level with the row (pages.css), and closes a moment after the
   * pointer leaves both; otherwise it opens under the box, and a tap on
   * the open kind closes it again.
   */
  bindWork() {
    const work = this.el.querySelector('.info-work');
    if (!work) return;
    const card = work.querySelector('.info-card');
    const panel = work.querySelector('.info-work-panel');
    const kinds = [...work.querySelectorAll('.info-work-kind')];
    const details = [...work.querySelectorAll('.info-work-detail')];
    const side = window.matchMedia('(min-width: 1100px) and (hover: hover)');
    let open = -1;

    /* Beside the box: the panel's top a little above the row (kept within
       the box's height), and the hairline at the row's middle. */
    const place = (k) => {
      if (!side.matches) return;
      const top = work.getBoundingClientRect().top;
      const row = kinds[k].getBoundingClientRect();
      const mid = row.top + row.height / 2 - top;
      const y = Math.max(0, Math.min(mid - panel.offsetHeight * 0.22, card.offsetHeight - panel.offsetHeight));
      work.style.setProperty('--row-y', `${mid.toFixed(1)}px`);
      work.style.setProperty('--panel-y', `${y.toFixed(1)}px`);
    };

    const show = (k) => {
      clearTimeout(this.workShut);
      if (k === open) return;
      const was = open;
      open = k;
      kinds.forEach((b, i) => {
        b.classList.toggle('is-open', i === k);
        b.setAttribute('aria-expanded', String(i === k));
      });
      details.forEach((d, i) => d.classList.toggle('is-open', i === k));
      if (was < 0) {
        /* Opening: straight to the row (the slide-out hides the move). */
        panel.style.transition = 'none';
        place(k);
        void panel.offsetHeight;
        panel.style.transition = '';
        work.classList.add('is-open');
      } else {
        place(k);
      }
    };

    const hide = () => {
      clearTimeout(this.workShut);
      if (open < 0) return;
      open = -1;
      work.classList.remove('is-open');
      kinds.forEach((b) => {
        b.classList.remove('is-open');
        b.setAttribute('aria-expanded', 'false');
      });
      details.forEach((d) => d.classList.remove('is-open'));
    };
    const hideSoon = () => {
      clearTimeout(this.workShut);
      this.workShut = setTimeout(hide, 260);
    };

    kinds.forEach((b, k) => {
      b.addEventListener('pointerenter', (e) => {
        if (side.matches && e.pointerType !== 'touch') show(k);
      });
      b.addEventListener('focus', () => {
        if (side.matches) show(k);
      });
      b.addEventListener('click', () => {
        if (side.matches) show(k);
        else if (open === k) hide();
        else show(k);
      });
    });
    work.addEventListener('pointerenter', () => clearTimeout(this.workShut));
    work.addEventListener('pointerleave', (e) => {
      if (side.matches && e.pointerType !== 'touch') hideSoon();
    });
    work.addEventListener('focusout', (e) => {
      if (side.matches && !work.contains(e.relatedTarget)) hideSoon();
    });
    work.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || open < 0) return;
      const k = open;
      hide();
      kinds[k].focus({ preventScroll: true });
    });
    /* Between the two layouts (a window resized past the line): start shut. */
    this.onWorkMode = () => hide();
    side.addEventListener('change', this.onWorkMode);
    this.workMode = side;
  }

  /**
   * The two boxes draw themselves in (pages.css) each time they come into
   * view — once a third of them shows — and are set back, out of sight,
   * once they've gone, so the next visit plays it again. Watched by the
   * browser (no reading the page while it scrolls); the drawing itself is
   * CSS. With reduced motion they simply stay drawn.
   */
  bindCards() {
    const cards = this.el.querySelector('.info-cards');
    if (!cards || store.reducedMotion || !('IntersectionObserver' in window)) return;
    cards.classList.add('is-armed');
    this.cardsIo = new IntersectionObserver((entries) => {
      const e = entries[entries.length - 1];
      if (e.isIntersecting && e.intersectionRatio >= 0.3) cards.classList.add('is-in');
      else if (!e.isIntersecting) cards.classList.remove('is-in');
    }, { threshold: [0, 0.3] });
    this.cardsIo.observe(cards);
  }

  /* The boxes and the closing screen go with the rest of the page (as on
     the welcome page), rather than cutting out when it's swapped. */
  onLeave(tl) {
    const parts = this.el.querySelectorAll('.info-services, .finale');
    if (parts.length) tl.to(parts, { opacity: 0, duration: 0.45, ease: 'power2.in' }, 0);
  }

  resize() {
    super.resize();
    this.finaleFx?.resize();
  }

  destroy() {
    super.destroy();
    this.cardsIo?.disconnect();
    clearTimeout(this.workShut);
    this.workMode?.removeEventListener('change', this.onWorkMode);
    this.unmagnet?.();
    this.finaleFx?.destroy();
  }
}
