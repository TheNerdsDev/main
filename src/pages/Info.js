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
    this.unmagnet?.();
    this.finaleFx?.destroy();
  }
}
