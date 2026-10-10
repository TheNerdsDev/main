import gsap from 'gsap';
import store from '../core/Store.js';
import { collectLines } from '../core/SplitText.js';

/** Shared enter / leave choreography for every route. */
export default class Page {
  constructor({ el, world, app }) {
    this.el = el;
    this.world = world;
    this.app = app;
    this.id = el.dataset.page;

    const { instances, lines } = collectLines(el);
    this.splits = instances;
    this.lines = lines;

    this.fades = [
      ...el.querySelectorAll('.label, .meta-list li, .capability-list li, .project-meta, .project-index, .copyright, .back, .nav, .logo, .social-list li, .service li')
    ];

    this.prepare();
  }

  prepare() {
    gsap.set(this.lines, { yPercent: 115 });
    gsap.set(this.fades, { opacity: 0, y: 12 });
  }

  enter() {
    const tl = gsap.timeline();

    tl.to(this.lines, {
      yPercent: 0,
      duration: 1.2,
      ease: 'power4.out',
      stagger: 0.055
    }, 0);

    tl.to(this.fades, {
      opacity: 1,
      y: 0,
      duration: 0.9,
      ease: 'power3.out',
      stagger: 0.025
    }, 0.25);

    this.world?.media.enter();
    this.onEnter?.(tl);
    return tl;
  }

  leave() {
    const tl = gsap.timeline();

    tl.to(this.lines, {
      yPercent: -115,
      duration: 0.55,
      ease: 'power3.in',
      stagger: 0.02
    }, 0);

    tl.to(this.fades, {
      opacity: 0,
      y: -10,
      duration: 0.4,
      ease: 'power2.in'
    }, 0);

    this.onLeave?.(tl);
    return tl;
  }

  resize() {
    this.splits.forEach((s) => s.resize());
    /* Re-collect, the DOM nodes were replaced by the re-split. */
    this.lines = [];
    this.splits.forEach((s) => this.lines.push(...s.lines));
    this.el.querySelectorAll('[data-split] .line-inner').forEach((el) => this.lines.push(el));
  }

  /** Back to the top: a link to this same page (the logo) was followed. */
  toTop() { this.app?.scroll?.lenis.scrollTo(0); }

  loop() {}
  destroy() { gsap.killTweensOf([...this.lines, ...this.fades]); }
}
