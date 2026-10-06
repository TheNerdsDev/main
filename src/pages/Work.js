import gsap from 'gsap';
import Page from './Page.js';

export default class Work extends Page {
  constructor(opts) {
    super(opts);
    this.accent = this.el.dataset.accent;
    if (this.accent) this.world?.setAccent(this.accent);
  }

  onEnter(tl) {
    const next = this.el.querySelector('.next-project');
    if (next) tl.from(next, { opacity: 0, y: 24, duration: 0.9, ease: 'power3.out' }, 0.5);
  }
}
