import gsap from 'gsap';
import store from '../core/Store.js';
import SplitText from '../core/SplitText.js';
import Page from './Page.js';
import FxLayer from '../fx/FxLayer.js';
import Duo from '../fx/Duo.js';
import RockStage from '../fx/RockStage.js';
import Scatter from '../fx/Scatter.js';
import { Crumble } from '../fx/Zap.js';
import DropReveal from '../fx/DropReveal.js';
import { PALETTE } from '../gl/World.js';
import { clamp } from '../fx/particles.js';

/*
 * Two "pages", joined by a guided move rather than a free scroll:
 *
 *   Home → About   the first scroll takes over: the heading and subtext
 *                  fade away on their own, the page glides down to About,
 *                  and the four rocks come along with you, still circling
 *                  (clockwise, unevenly), now round the screen.
 *   About          now your scroll drives everything, both ways: the
 *                  photos and text unfold, and over the very same scroll
 *                  the rocks spiral in, collide in the centre and crumble,
 *                  their pieces swirling out across the page.
 *   About → Home   scroll back above About and it glides you home again.
 *
 * Below About, the work gets its own pinned reel: the scroll pulls the
 * projects sideways past you, then lets go to the footer.
 */
const GLIDE = 1.6;
const glideEase = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

/* The scroll through About (0 → 1), in order: the waiting rocks are
   drawn together and meet at COLLIDE, their pieces scatter and have
   spread across the page by SCATTERED, and only then does the About
   brief (photos, text, button) play out over the rest. */
const COLLIDE = 0.2;
const SCATTERED = 0.42;
/* How closely the scrubbed sequences follow the scroll (per 60fps frame).
   Lenis already smooths the scroll; this only takes the edge off. */
const FOLLOW = 0.16;

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
    this.buttonWrap = q('.about-cta');
    this.buttonText = q('.about-button-text');
    this.show = q('.showcase');
    this.showTrack = q('.showcase-track');
    this.showCards = [...this.el.querySelectorAll('.show-card')];
    this.showImgs = this.showCards.map((c) => c.querySelector('.show-card-img'));
    this.showNow = q('.showcase-count-now');
    this.showBar = q('.showcase-progress-bar');
    this.showX = 0;
    this.showIn = -1;
    /* Hovering a card rains water drops on it, each one uncovering a little
       more of the project's video. */
    const showStage = q('.showcase-stage');
    if (showStage && DropReveal.supported()) this.drops = new DropReveal(showStage, this.showCards);

    this.fx = new FxLayer();
    this.stage = new RockStage();
    this.duo = this.duoEl ? new Duo(this.duoEl, this.fx, this.stage) : null;
    this.scatter = new Scatter(this.stage);

    /* Split here rather than through Page, so the About copy follows the
       scroll instead of revealing with the hero. */
    this.aboutSplit = this.aboutText ? new SplitText(this.aboutText) : null;
    this.aboutP = 0;
    this.rockP = 0;
    this.buildAbout();
    this.buildShowcase();

    /* Where we are: 'home' | 'toAbout' | 'about' | 'toHome'. */
    this.state = 'home';
    this.journey = { f: 0 };

    /* Hidden until the page enters — they power on in onEnter(). */
    gsap.set(this.el.querySelectorAll('.sketch-svg, .sketch-name'), { opacity: 0 });
    gsap.set(this.el.querySelectorAll('.duo-action-rock'), { opacity: 0, scale: 0.3 });
    gsap.set(this.el.querySelectorAll('.scroll-cue-track'), { scaleY: 0 });
    gsap.set(this.el.querySelectorAll('.scroll-cue-head, .scroll-cue-label'), { opacity: 0 });

    this.onCue = (e) => {
      e.preventDefault();
      if (this.state === 'home') this.goAbout();
    };
    this.cue?.addEventListener('click', this.onCue);
    this.bindButtonShake();

    this.measure();
  }

  /**
   * About Us is magnetic: once the cursor comes within reach, the button
   * leans after it — following its movement, but never more than PULL px
   * from home — and eases back when the cursor leaves. (Hover also grows
   * it; see the CSS.)
   */
  bindButtonShake() {
    const btn = this.button;
    if (!btn || !window.matchMedia('(hover: hover)').matches) return;
    const PULL = 22;
    const s = { x: 0, y: 0, tx: 0, ty: 0, on: false };
    this.onButtonMove = (e) => {
      const r = btn.getBoundingClientRect();
      if (!r.width) return;
      /* Where it sits without the lean, so the pull doesn't feed on itself. */
      const cx = r.left + r.width / 2 - s.x;
      const cy = r.top + r.height / 2 - s.y;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const reach = r.width / 2 + 70;
      const d = Math.hypot(dx, dy);
      if (d < reach) {
        /* Follows the cursor, softly capped at the edge of its radius. */
        const k = (PULL * Math.tanh(d / (reach * 0.5))) / Math.max(d, 1);
        s.tx = dx * k;
        s.ty = dy * k;
      } else {
        s.tx = 0;
        s.ty = 0;
      }
      if (!s.on && (s.tx || s.ty)) {
        s.on = true;
        gsap.ticker.add(this.buttonSpring);
      }
    };
    this.buttonSpring = () => {
      const k = 1 - Math.pow(1 - 0.16, gsap.ticker.deltaRatio(60));
      s.x += (s.tx - s.x) * k;
      s.y += (s.ty - s.y) * k;
      btn.style.setProperty('--nx', `${s.x.toFixed(2)}px`);
      btn.style.setProperty('--ny', `${s.y.toFixed(2)}px`);
      if (!s.tx && !s.ty && Math.abs(s.x) + Math.abs(s.y) < 0.05) {
        s.x = s.y = 0;
        btn.style.removeProperty('--nx');
        btn.style.removeProperty('--ny');
        gsap.ticker.remove(this.buttonSpring);
        s.on = false;
      }
    };
    window.addEventListener('pointermove', this.onButtonMove, { passive: true });
  }

  get lenis() { return this.app?.scroll?.lenis; }

  /* ------------------------------------------------------ the glides */

  heroLines() {
    return [...this.el.querySelectorAll('.hero .title .line, .hero-intro .line')];
  }

  /** First scroll down: take the wheel and carry the viewer to About. */
  goAbout() {
    if (!this.lenis) return;
    this.state = 'toAbout';
    this.lenis.stop();

    /* The heading and subtext drift up, blur and fade — on their own time. */
    gsap.to(this.heroLines(), {
      y: -70, opacity: 0, filter: 'blur(12px)',
      duration: 0.85, ease: 'power2.in', stagger: 0.06, overwrite: 'auto'
    });
    if (this.cue) gsap.to(this.cue, { opacity: 0, y: 14, duration: 0.5, ease: 'power2.in', overwrite: 'auto' });

    /* The rocks let go of the sketches and come along with the viewer. */
    gsap.to(this.journey, { f: 1, duration: GLIDE * 0.95, delay: 0.08, ease: 'power2.inOut', overwrite: 'auto' });

    this.lenis.scrollTo(this.aboutTop, {
      duration: GLIDE,
      easing: glideEase,
      force: true,
      onComplete: () => {
        this.state = 'about';
        this.lenis.start();
      }
    });
  }

  /** Scrolled back above About: carry the viewer home. */
  goHome() {
    if (!this.lenis) return;
    this.state = 'toHome';
    this.lenis.stop();

    /* The rocks return to orbit as the sketches come back into view. */
    gsap.to(this.journey, { f: 0, duration: GLIDE * 0.95, ease: 'power2.inOut', overwrite: 'auto' });

    /* The heading settles back in as the page arrives. */
    gsap.to(this.heroLines(), {
      y: 0, opacity: 1, filter: 'blur(0px)',
      duration: 1, ease: 'power3.out', stagger: 0.07, delay: GLIDE * 0.55, overwrite: 'auto'
    });
    if (this.cue) gsap.to(this.cue, { opacity: 1, y: 0, duration: 0.9, ease: 'power2.out', delay: GLIDE * 0.8, overwrite: 'auto' });

    this.lenis.scrollTo(0, {
      duration: GLIDE,
      easing: glideEase,
      force: true,
      onComplete: () => {
        this.state = 'home';
        this.lenis.start();
      }
    });
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
      /* Reveal the wrapper, never the button: the button's own scale and
         translate belong to the hover. */
      tl.fromTo(this.buttonWrap || this.button, { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out' }, buttonAt);
      /* The label draws together from wide tracking as it arrives. */
      tl.fromTo(this.buttonText, { letterSpacing: '0.7em', opacity: 0 }, { letterSpacing: '0.22em', opacity: 1, duration: 0.7, ease: 'power3.out' }, buttonAt + 0.1);
    }

    /* A short hold so the finished section sits still before the page moves on. */
    tl.to({}, { duration: 0.6 });

    tl.progress(this.aboutP);
    this.aboutTl = tl;
  }

  /**
   * The work reel: heading and cards rise in as the section arrives (scrubbed,
   * so it reverses too). The sideways travel is driven from loop().
   */
  buildShowcase() {
    if (!this.show) return;
    const lines = this.show.querySelectorAll('.showcase-title .line-inner');
    const bits = this.show.querySelectorAll('.showcase-all, .showcase-count, .showcase-progress');
    const tl = gsap.timeline({ paused: true, defaults: { ease: 'none' } });
    tl.fromTo(lines, { yPercent: 115 }, { yPercent: 0, duration: 0.5, stagger: 0.12, ease: 'power3.out' }, 0)
      .fromTo(bits, { opacity: 0 }, { opacity: 1, duration: 0.4, stagger: 0.08 }, 0.15)
      .fromTo(this.showCards, { y: 90, opacity: 0 }, { y: 0, opacity: 1, duration: 0.55, stagger: 0.07, ease: 'power3.out' }, 0.2);
    this.showTl = tl;
    this.showP = -1;
  }

  measure() {
    if (this.show) {
      /* Pinned reel on wider screens: the runway is the sideways distance,
         plus a short hold on the last card. */
      this.showPinned = store.html.classList.contains('webgl') && window.innerWidth >= 768;
      this.showTravel = this.showPinned ? Math.max(0, this.showTrack.scrollWidth - window.innerWidth) : 0;
      this.show.style.height = this.showPinned ? `${Math.round(window.innerHeight * 1.25 + this.showTravel)}px` : '';
      if (!this.showPinned) this.showTrack.style.transform = '';
    }
    if (!this.about) return;
    this.aboutTop = this.about.getBoundingClientRect().top + store.scroll;
    this.aboutH = this.about.offsetHeight;
    if (this.show) this.showTop = this.show.getBoundingClientRect().top + store.scroll;
  }

  /** Scroll-driven reel: reveal, sideways travel, counter, progress, parallax. */
  updateShowcase(scroll, vh, ease) {
    if (!this.show || this.showTop == null) return;
    const reveal = clamp((scroll + vh - this.showTop) / (vh * 0.75), 0, 1);
    const p = ease(Math.max(this.showP, 0), reveal);
    if (p !== this.showP) {
      this.showP = p;
      this.showTl.progress(p);
    }
    if (!this.showPinned) return;

    const q = clamp((scroll - this.showTop) / Math.max(1, this.showTravel), 0, 1);
    this.showX = ease(this.showX, -q * this.showTravel);
    this.showTrack.style.transform = `translate3d(${this.showX.toFixed(1)}px, 0, 0)`;
    this.showBar.style.transform = `scaleX(${q.toFixed(4)})`;

    const n = this.showCards.length;
    const now = Math.min(n, Math.floor(q * n) + 1);
    if (now !== this.showIn) {
      this.showIn = now;
      this.showNow.textContent = String(now).padStart(2, '0');
    }

    /* Each photo drifts against the travel, so the reel has depth. */
    const vw = window.innerWidth;
    this.showCards.forEach((card, i) => {
      const img = this.showImgs[i];
      if (!img) return;
      const c = card.offsetLeft + card.offsetWidth / 2 + this.showX;
      if (c < -vw * 0.5 || c > vw * 1.5) return;
      img.style.transform = `translate3d(${(((c - vw / 2) / vw) * -7).toFixed(2)}%, 0, 0) scale(1.14)`;
    });
  }

  /* ----------------------------------------------------------- loop */

  loop() {
    if (!this.aboutH) return;
    const vh = store.height;
    const scroll = store.scroll;
    const follow = 1 - Math.pow(1 - FOLLOW, gsap.ticker.deltaRatio(60));
    const ease = (from, to) => (Math.abs(to - from) < 0.0005 ? to : from + (to - from) * follow);

    /* The guided moves between the two pages. */
    if (this.state === 'home' && scroll > 3) this.goAbout();
    else if (this.state === 'about' && scroll < this.aboutTop - 3) this.goHome();

    const end = this.aboutTop + this.aboutH - vh;

    /* One progress for the whole scroll through About. */
    this.rockP = ease(this.rockP, clamp((scroll - this.aboutTop) / Math.max(1, end - this.aboutTop), 0, 1));

    /* About brief: only once the rocks have scattered. */
    const aboutNext = clamp((this.rockP - SCATTERED) / (1 - SCATTERED), 0, 1);
    if (aboutNext !== this.aboutP) {
      this.aboutP = aboutNext;
      this.aboutTl.progress(aboutNext);
    }

    /* The rocks: drawn together, collide, scatter across the page. */
    if (this.duo) {
      const k = clamp(this.rockP / COLLIDE, 0, 1);
      const broken = this.rockP >= COLLIDE;
      this.duo.setJourney(this.journey.f, k, broken);

      const meet = this.duo.meeting();
      /* The moment they meet, going forwards: a cloud of pulverised rock. */
      if (broken && !this.broken) this.fx.add(new Crumble({ ...meet, scale: clamp(store.width / 1400, 0.6, 1.2) }));
      this.broken = broken;
      /* Once About is released the debris scrolls away with it. */
      const release = Math.max(0, scroll - end);
      this.scatter.update(clamp((this.rockP - COLLIDE) / (SCATTERED - COLLIDE), 0, 1), meet, this.duo.rockRadius(), -release);
      /* Once broken, the debris is drawn behind the page — it floats behind
         the text and photos, never over them. A thrown rock stays in front. */
      const behind = broken ? '2' : '';
      if (this.stage.canvas.style.zIndex !== behind) this.stage.canvas.style.zIndex = behind;
    }

    this.updateShowcase(scroll, vh, ease);
  }

  resize() {
    super.resize();
    if (this.aboutSplit) {
      this.aboutSplit.resize();
      this.buildAbout();
    }
    this.measure();
    /* Keep the viewer on About if a resize moved where it starts. */
    if (this.state === 'about' && store.scroll < this.aboutTop) {
      this.lenis?.scrollTo(this.aboutTop, { immediate: true, force: true });
    }
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
    tl.to([this.duoEl, this.about, this.show].filter(Boolean), { opacity: 0, duration: 0.45, ease: 'power2.in' }, 0);
  }

  destroy() {
    super.destroy();
    /* Never leave the scroll locked behind us. */
    if (this.state === 'toAbout' || this.state === 'toHome') this.lenis?.start();
    this.cue?.removeEventListener('click', this.onCue);
    if (this.onButtonMove) window.removeEventListener('pointermove', this.onButtonMove);
    if (this.buttonSpring) gsap.ticker.remove(this.buttonSpring);
    gsap.killTweensOf([this.cue, this.journey, ...this.heroLines()]);
    this.aboutTl?.kill();
    this.showTl?.kill();
    this.drops?.destroy();
    this.scatter.destroy();
    this.duo?.destroy();
    this.fx.destroy();
    this.stage.destroy();
  }
}
