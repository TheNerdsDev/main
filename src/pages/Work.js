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

    /* The project's video, if it leads with one: rises in and plays. */
    const film = this.el.querySelector('.work-film');
    if (film) {
      tl.from(film, { opacity: 0, y: 40, duration: 1.1, ease: 'power3.out' }, 0.3);
      this.playFilm(film);
    }
  }

  /**
   * Arriving by the router, this page was parsed off-screen before being
   * swapped in, and a video made there can sit unloaded for good (it
   * depends on the browser; play() won't wake it). If it hasn't started,
   * swap in a fresh one made here, in the live page.
   */
  playFilm(film) {
    let video = film.querySelector('video');
    if (!video) return;
    if (video.readyState === 0) {
      const fresh = document.createElement('video');
      for (const { name, value } of video.attributes) fresh.setAttribute(name, value);
      fresh.muted = true;   // on a made element the attribute alone doesn't mute it
      video.replaceWith(fresh);
      video = fresh;
    }
    video.play().catch(() => {});
  }
}
