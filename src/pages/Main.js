import gsap from 'gsap';
import store from '../core/Store.js';
import SplitText from '../core/SplitText.js';
import Page from './Page.js';
import FxLayer from '../fx/FxLayer.js';
import Duo from '../fx/Duo.js';
import RockStage from '../fx/RockStage.js';
import { PALETTE } from '../gl/World.js';
import { clamp } from '../fx/particles.js';

/* The About sequence is scrubbed by scroll. It starts while the section is
   still this far (in viewport heights) below the top of the screen, and
   finishes as the pinned stage is released. */
const ABOUT_LEAD = 0.6;
/* How closely the sequence follows the scroll position (per 60fps frame).
   Lenis already smooths the scroll; this only takes the edge off. */
const ABOUT_FOLLOW = 0.16;
/* The scroll cue fades once you're this far down (× viewport height) and
   only comes back when you're right at the top again. */
const CUE_HIDE_AT = 0.12;

/** Each photo cuts in from a different edge. */
const CUTS = ['inset(100% 0% 0% 0%)', 'inset(0% 0% 0% 100%)', 'inset(0% 0% 100% 0%)'];

/** The landing page: welcome, the two of us in neon, and a short hello. */
export default class Main extends Page {
  constructor(opts) {
    super(opts);
    this.world?.setAccent('#' + PALETTE.accent.getHexString());

    const q = (s) => this.el.querySelector(s);
    this.cue = q('.scroll-cue');
    this.duoEl = q('[data-duo]');
    this.about = q('.about');
    this.aboutText = q('.about-text');
    this.frames = [...this.el.querySelectorAll('.about-frame')];
    this.button = q('.about-button');
    this.buttonText = q('.about-button-text');

    this.fx = new FxLayer();
    this.stage = new RockStage();
    this.duo = this.duoEl ? new Duo(this.duoEl, this.fx, this.stage) : null;

    /* Split here rather than through Page, so the About copy follows the
       scroll instead of revealing with the hero. */
    this.aboutSplit = this.aboutText ? new SplitText(this.aboutText) : null;
    this.aboutP = 0;
    this.buildAbout();

    /* Hidden until the page enters — they power on in onEnter(). */
    gsap.set(this.el.querySelectorAll('.sketch-svg, .sketch-name'), { opacity: 0 });
    gsap.set(this.el.querySelectorAll('.duo-action-rock'), { opacity: 0, scale: 0.3 });
    gsap.set(this.el.querySelectorAll('.scroll-cue-track'), { scaleY: 0 });
    gsap.set(this.el.querySelectorAll('.scroll-cue-head, .scroll-cue-label'), { opacity: 0 });
    this.cueShown = true;

    this.onCue = (e) => {
      e.preventDefault();
      this.app?.scroll?.lenis.scrollTo(this.about, { duration: 1.8, easing: (t) => 1 - Math.pow(1 - t, 4) });
    };
    this.cue?.addEventListener('click', this.onCue);

    this.measure();
  }

  /* ---------------------------------------------------------- about */

  /**
   * One paused timeline for the whole About sequence; scroll sets its
   * position. The frames arrive, each runs through its three photos — a
   * cut from a new edge with a camera flash — then the text rises line by
   * line, then the button. Scrolling back plays it exactly in reverse:
   * the button goes, the lines sink from the bottom up, the photos unload
   * third to first.
   */
  buildAbout() {
    this.aboutTl?.kill();
    const tl = gsap.timeline({ paused: true });

    this.frames.forEach((f, fi) => {
      tl.fromTo(f, { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' }, fi * 0.1);
    });

    const PHOTO_AT = 0.55;
    const PHOTO_STEP = 0.9;
    for (let i = 0; i < 3; i++) {
      this.frames.forEach((f, fi) => {
        const photo = f.querySelectorAll('.about-photo')[i];
        const flash = f.querySelector('.about-flash');
        if (!photo) return;
        const at = PHOTO_AT + i * PHOTO_STEP + fi * 0.08;
        tl.fromTo(photo,
          { clipPath: CUTS[i], scale: 1.25 },
          { clipPath: 'inset(0% 0% 0% 0%)', scale: i === 2 ? 1 : 1.06, duration: 0.65, ease: 'power2.out' },
          at);
        tl.fromTo(flash, { opacity: 0 }, { opacity: 0.55, duration: 0.08, ease: 'none', immediateRender: false }, at)
          .fromTo(flash, { opacity: 0.55 }, { opacity: 0, duration: 0.35, ease: 'power2.out', immediateRender: false }, at + 0.08);
      });
    }

    const textAt = PHOTO_AT + 3 * PHOTO_STEP + 0.15;
    const lines = this.aboutSplit?.lines || [];
    const LINE_STEP = 0.42;
    if (lines.length) {
      tl.fromTo(lines,
        { yPercent: 115, opacity: 0 },
        { yPercent: 0, opacity: 1, duration: 0.6, ease: 'power3.out', stagger: LINE_STEP },
        textAt);
    }

    const buttonAt = textAt + Math.max(0, lines.length - 1) * LINE_STEP + 0.55;
    if (this.button) {
      tl.fromTo(this.button, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, buttonAt);
      /* The label draws together from wide tracking as it arrives. */
      tl.fromTo(this.buttonText, { letterSpacing: '0.7em', opacity: 0 }, { letterSpacing: '0.22em', opacity: 1, duration: 0.7, ease: 'power3.out' }, buttonAt + 0.1);
    }

    /* A short hold so the finished section sits still before the page moves on. */
    tl.to({}, { duration: 0.6 });

    tl.progress(this.aboutP);
    this.aboutTl = tl;
  }

  measure() {
    if (!this.about) return;
    this.aboutTop = this.about.getBoundingClientRect().top + store.scroll;
    this.aboutH = this.about.offsetHeight;
  }

  /* ----------------------------------------------------------- loop */

  loop() {
    const vh = store.height;
    const scroll = store.scroll;

    /* About: map the scroll position onto the timeline. */
    if (this.aboutTl && this.aboutH) {
      const start = this.aboutTop - vh * ABOUT_LEAD;
      const end = this.aboutTop + this.aboutH - vh;
      const target = clamp((scroll - start) / Math.max(1, end - start), 0, 1);
      const k = 1 - Math.pow(1 - ABOUT_FOLLOW, gsap.ticker.deltaRatio(60));
      const next = Math.abs(target - this.aboutP) < 0.0005 ? target : this.aboutP + (target - this.aboutP) * k;
      if (next !== this.aboutP) {
        this.aboutP = next;
        this.aboutTl.progress(next);
      }
    }

    /* Scroll cue: fade out once you've scrolled down, back only at the very top. */
    if (this.cue) {
      if (this.cueShown && scroll > vh * CUE_HIDE_AT) {
        this.cueShown = false;
        gsap.to(this.cue, { opacity: 0, y: 12, duration: 0.9, ease: 'power2.out', overwrite: 'auto' });
      } else if (!this.cueShown && scroll < 2) {
        this.cueShown = true;
        gsap.to(this.cue, { opacity: 1, y: 0, duration: 1, ease: 'power2.out', overwrite: 'auto' });
      }
    }
  }

  resize() {
    super.resize();
    if (this.aboutSplit) {
      this.aboutSplit.resize();
      this.buildAbout();
    }
    this.measure();
    this.fx.resize();
    this.stage.resize();
    this.duo?.resize();
  }

  /* ------------------------------------------------------ enter/leave */

  onEnter(tl) {
    /* The scroll cue draws itself downward. */
    tl.to(this.el.querySelectorAll('.scroll-cue-track'), { scaleY: 1, duration: 1.6, ease: 'expo.out' }, 0.7)
      .to(this.el.querySelectorAll('.scroll-cue-head, .scroll-cue-label'), { opacity: 1, duration: 0.8, ease: 'power2.out', stagger: 0.1 }, 1.2);

    /* Each sketch powers on like a neon tube: a few failed strikes, then on. */
    this.el.querySelectorAll('.sketch').forEach((s, i) => {
      const svg = s.querySelector('.sketch-svg');
      const name = s.querySelector('.sketch-name');
      const at = 0.6 + i * 0.35;
      tl.to(svg, {
        keyframes: [
          { opacity: 0.6, duration: 0.05 }, { opacity: 0, duration: 0.08 },
          { opacity: 0.9, duration: 0.04 }, { opacity: 0.1, duration: 0.12 },
          { opacity: 1, duration: 0.05 }, { opacity: 0.45, duration: 0.05 },
          { opacity: 1, duration: 0.3 }
        ]
      }, at);
      tl.to(name, { opacity: 1, duration: 0.6, ease: 'power2.out' }, at + 0.5);
    });

    /* The rocks drift in out of the dark; their transform is handed back
       to CSS afterwards so the hover grow still works. */
    tl.to(this.el.querySelectorAll('.duo-action-rock'), {
      opacity: 1, scale: 1, duration: 1.4, ease: 'expo.out', stagger: 0.14, clearProps: 'transform'
    }, 1.4);
  }

  onLeave(tl) {
    tl.to([this.duoEl, this.about].filter(Boolean), { opacity: 0, duration: 0.45, ease: 'power2.in' }, 0);
  }

  destroy() {
    super.destroy();
    this.cue?.removeEventListener('click', this.onCue);
    gsap.killTweensOf(this.cue);
    this.aboutTl?.kill();
    this.duo?.destroy();
    this.fx.destroy();
    this.stage.destroy();
  }
}
