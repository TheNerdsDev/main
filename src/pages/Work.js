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

    /* The project's video, if it leads with one: rises in and plays (asked
       for here too, as arriving by the router doesn't always autoplay). */
    const film = this.el.querySelector('.work-film');
    if (film) {
      tl.from(film, { opacity: 0, y: 40, duration: 1.1, ease: 'power3.out' }, 0.3);
      film.querySelector('video')?.play().catch(() => {});
    }
  }
}
