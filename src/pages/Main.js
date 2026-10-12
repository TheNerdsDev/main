import gsap from 'gsap';
import store from '../core/Store.js';
import SplitText from '../core/SplitText.js';
import Page from './Page.js';
import FxLayer from '../fx/FxLayer.js';
import Duo from '../fx/Duo.js';
import RockStage from '../fx/RockStage.js';
import Scatter from '../fx/Scatter.js';
import { Crumble } from '../fx/Zap.js';
import WaterReveal from '../fx/WaterReveal.js';
import Finale from '../fx/Finale.js';
import magnetic from '../fx/magnetic.js';
import { PALETTE } from '../gl/World.js';
import { clamp } from '../fx/particles.js';

/*
 * Two "pages", joined by a guided move rather than a free scroll:
 *
 *   Home → About   the first scroll takes over: the heading and subtext
 *                  fade away on their own, the page glides down to About,
 *                  and the four rocks come along with you, still circling
 *                  (clockwise, unevenly), now round the screen. Without
 *                  handing the scroll back, it carries on: the rocks spiral
 *                  in, collide in the centre and crumble, their pieces
 *                  swirling out across the page.
 *   About          two square frames rise in, empty, asking for a scroll.
 *                  The next one plays the rest on its own: a photo of each
 *                  of us cuts into its frame with a camera flash; the text
 *                  and button unfold.
 *   …and back      one scroll up out of the work reel glides back up to
 *                  About, text and all. From there each part plays in
 *                  reverse at the pace it played forwards: the next scroll
 *                  takes the text and photos back to the empty frames, the
 *                  one after the frames, the collision and the glide
 *                  back home.
 *
 * One scroll, one step: after each, the scroll is handed back only once
 * the gesture is over (QUIET s without a wheel or touch), so the tail of a
 * flick, or a trackpad's glide, can't carry on into the next.
 *
 * Below About, the work gets its own pinned reel: the scroll pulls the
 * projects sideways past you, then lets go to the footer.
 */
const GLIDE = 1.3;
const QUIET = 0.2;
const glideEase = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/* The header logo's way home (goTop): the view is yanked away (PULL s),
   then the welcome screen drops in and springs to rest (DROP s). */
const PULL = 0.5;
const DROP = 0.95;

/* The scroll through About (0 → 1), in order: the waiting rocks are
   drawn together and meet at COLLIDE, their pieces scatter and have
   spread across the page by SCATTERED, and only then does the About
   brief (photos, text, button) play out over the rest. */
const COLLIDE = 0.2;
const SCATTERED = 0.42;
/* The first scroll doesn't stop at About: the page carries itself on.
   The rocks start closing in LEAD s before the glide lands (no settling
   in first), are drawn in (DRAW_IN s) and collide, the pieces burst out
   (BURST s), a beat, then the two frames rise in, empty, with "Scroll
   down" in them (FRAMES s). The scroll is handed back there; the next one
   plays the rest of About (TEXT_IN s). Going back, each plays in reverse
   at the same pace — the way home is the way in, backwards. */
const LEAD = 0.35;
const DRAW_IN = 0.5;
const BURST = 0.55;
const BEAT = 0.25;
const FRAMES = 1.1;
const TEXT_IN = 3.2;
/* How closely the scrubbed sequences follow the scroll (per 60fps frame).
   Lenis already smooths the scroll; this only takes the edge off. */
const FOLLOW = 0.16;

/* The About brief's own clock (timeline seconds, scrubbed by the scroll):
   the frames are in, empty, by HAND_BACK; the photos cut in from REVEAL,
   and settle for a moment before the text follows. */
const HAND_BACK = 1;
const REVEAL = 1.1;

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
    /* Decoded ahead, so a photo never cuts in half-drawn. */
    this.frames.forEach((f) => f.querySelector('.about-photo')?.decode?.().catch(() => {}));
    this.button = q('.about-button');
    this.finale = q('.finale');
    this.finaleButton = q('.finale-button');
    this.buttonWrap = q('.about-cta');
    this.buttonText = q('.about-button-text');
    this.show = q('.showcase');
    this.showTrack = q('.showcase-track');
    this.showCards = [...this.el.querySelectorAll('.show-card')];
    /* (A screenshot card's image stays still — no drift.) */
    this.showImgs = this.showCards.map((c) => (c.classList.contains('is-still') ? null : c.querySelector('.show-card-img')));
    this.showNow = q('.showcase-count-now');
    this.showBar = q('.showcase-progress-bar');
    this.showX = 0;
    this.showIn = -1;
    /* Hovering a card floods it with water from the pointer outwards, and
       the project's video plays under it. */
    const showStage = q('.showcase-stage');
    if (showStage && WaterReveal.supported()) this.water = new WaterReveal(showStage, this.showCards);

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

    /* Where we are: 'home', 'about' (the frames in, empty) or 'text' (About
       played through) — or on the way to one, the wheel held: 'toAbout',
       'toText', 'toPhotos' (back to the empty frames), 'toHome'. Nothing glides
       until the page has entered (see onEnter). Arrived, the wheel stays
       held until the gesture that got us there is over (`held`, see
       release). */
    this.state = 'home';
    this.journey = { f: 0 };
    this.entered = false;
    this.held = false;
    this.inputAt = 0;
    this.lastScroll = 0;
    this.onInput = () => { this.inputAt = performance.now(); };
    for (const type of ['wheel', 'touchmove', 'keydown']) {
      window.addEventListener(type, this.onInput, { passive: true, capture: true });
    }

    /* Hidden until the page enters — they power on in onEnter(). */
    gsap.set(this.el.querySelectorAll('.sketch-svg'), { opacity: 0 });
    gsap.set(this.el.querySelectorAll('.duo-action-rock'), { opacity: 0, scale: 0.3 });
    gsap.set(this.el.querySelectorAll('.scroll-cue-track'), { scaleY: 0 });
    gsap.set(this.el.querySelectorAll('.scroll-cue-head, .scroll-cue-label'), { opacity: 0 });

    this.onCue = (e) => {
      e.preventDefault();
      if (this.state === 'home') this.goAbout();
    };
    this.cue?.addEventListener('click', this.onCue);
    /* The About Us and Contact us buttons lean after the cursor. */
    this.unmagnet = magnetic([this.button, this.finaleButton]);
    this.finaleFx = this.finale ? new Finale(this.finale) : null;

    this.measure();
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
    this.glideEnd = performance.now() + (GLIDE + 0.6) * 1000;
    this.lenis.stop();

    /* The heading and subtext drift up, blur and fade — on their own time. */
    gsap.to(this.heroLines(), {
      y: -70, opacity: 0, filter: 'blur(12px)',
      duration: 0.85, ease: 'power2.in', stagger: 0.06, overwrite: 'auto'
    });
    if (this.cue) gsap.to(this.cue, { opacity: 0, y: 14, duration: 0.5, ease: 'power2.in', overwrite: 'auto' });

    /* The rocks let go of the sketches and come along with the viewer. */
    gsap.to(this.journey, { f: 1, duration: GLIDE * 0.95, delay: 0.08, ease: 'power2.inOut', overwrite: 'auto' });

    this.lenis.scrollTo(this.aboutTop, { duration: GLIDE, easing: glideEase, force: true });
    /* …and closing in on each other before it lands, so there's no pause
       between arriving and the hit. */
    this.smash(GLIDE - LEAD);
  }

  /** The scroll position at progress p (0 → 1) through About… */
  aboutAt(p) {
    return this.aboutTop + Math.max(0, this.aboutH - store.height) * p;
  }

  /** …and the progress at scroll position y. */
  aboutProgress(y) {
    return clamp((y - this.aboutTop) / Math.max(1, this.aboutH - store.height), 0, 1);
  }

  /** About's progress with the frames in, still empty: the scroll is handed
      back there, the first time. */
  get photosP() {
    return SCATTERED + (1 - SCATTERED) * this.briefAuto;
  }

  get handBack() {
    return this.aboutAt(this.photosP);
  }

  /**
   * Play About on its own clock, holding the wheel (as `state`): from
   * progress `from`, `steps` move it on one after another — { p, duration,
   * ease, gap } — and then `done`. The scroll keeps pace whenever keepPace()
   * says so (the stage is sticky, so that moves nothing), so a later scroll
   * picks up exactly where it stops. Returns the timeline.
   */
  autoplay(from, steps, { state, delay = 0, keepPace = () => true, done }) {
    this.state = state;
    this.lenis.stop();
    this.autoTl?.kill();
    const auto = { p: from };
    this.auto = auto;
    const tl = gsap.timeline({
      delay,
      onUpdate: () => {
        this.rockP = auto.p;
        if (keepPace()) this.lenis.scrollTo(this.aboutAt(auto.p), { immediate: true, force: true });
      },
      onComplete: () => {
        this.auto = null;
        done?.();
      }
    });
    for (const s of steps) tl.to(auto, { p: s.p, duration: s.duration, ease: s.ease || 'none' }, s.gap ? `+=${s.gap}` : '>');
    this.glideEnd = performance.now() + (delay + tl.duration() + 0.6) * 1000;
    this.autoTl = tl;
    return tl;
  }

  /** Arrived: at scroll position y, in `state`. */
  settle(state, y) {
    this.lenis.scrollTo(y, { immediate: true, force: true });
    this.state = state;
    this.release();
  }

  /** Hand the wheel back — as soon as the scroll that brought us here has
      stopped coming in (loop() lets go). */
  release() {
    this.held = true;
  }

  /**
   * Scrolling back up out of the work reel: one scroll carries the viewer
   * all the way back up to About, text and all — the next one is what
   * takes the text away.
   */
  backToText() {
    if (!this.lenis) return;
    const to = this.aboutAt(1);
    const d = clamp(0.5 + ((store.scroll - to) / store.height) * 0.8, 0.5, GLIDE);
    this.state = 'toText';
    this.lenis.stop();
    this.glideEnd = performance.now() + (d + 0.6) * 1000;
    this.lenis.scrollTo(to, { duration: d, easing: glideEase, force: true, onComplete: () => this.settle('text', to) });
  }

  /**
   * The rest of the first scroll: the rocks are drawn together and
   * collide, the pieces burst out, a beat, then the frames rise in,
   * empty, asking for the next scroll. It can begin (after `delay`) while
   * the glide is still landing; until it lands, the glide moves the page.
   */
  smash(delay = 0) {
    if (!this.lenis) return;
    const from = Math.max(this.rockP, this.aboutProgress(store.scroll));
    const steps = [];
    /* Straight in (the rocks' own pull already gathers speed into the
       hit), then flung apart. */
    if (from < COLLIDE) steps.push({ p: COLLIDE, duration: DRAW_IN });
    if (from < SCATTERED) steps.push({ p: SCATTERED, duration: BURST, ease: 'power2.out' });
    steps.push({ p: this.photosP, duration: FRAMES, gap: steps.length ? BEAT : 0 });
    this.autoplay(from, steps, {
      state: 'toAbout',
      delay,
      keepPace: () => store.scroll >= this.aboutTop - 1,
      done: () => this.settle('about', this.handBack)
    });
  }

  /**
   * The next scroll, past the empty frames: the rest of About plays on
   * its own — the photos cut in, the text and the button follow — and
   * the wheel comes back at its end, the reel next.
   */
  goText() {
    if (!this.lenis) return;
    /* Jumped past it (End key, the scrollbar): just be there. */
    if (store.scroll >= this.aboutAt(1) - 3) {
      this.state = 'text';
      return;
    }
    const from = this.rockP;
    const duration = TEXT_IN * clamp((1 - from) / Math.max(0.001, 1 - this.photosP), 0.2, 1);
    this.autoplay(from, [{ p: 1, duration }], {
      state: 'toText',
      done: () => this.settle('text', this.aboutAt(1))
    });
  }

  /** Scrolled back up into About from below: the same, in reverse and at
      the same pace, back to the empty frames. */
  goPhotos() {
    if (!this.lenis) return;
    const from = this.rockP;
    const duration = TEXT_IN * clamp((from - this.photosP) / Math.max(0.001, 1 - this.photosP), 0.2, 1);
    this.autoplay(from, [{ p: this.photosP, duration }], {
      state: 'toPhotos',
      done: () => this.settle('about', this.handBack)
    });
  }

  /** Stop playing About on its own (the scroll drives it again). */
  stopAuto() {
    this.autoTl?.kill();
    this.auto = null;
  }

  /** The logo, from anywhere down the page: all the way back to the welcome. */
  toTop() {
    if (['about', 'text', 'toAbout', 'toText', 'toPhotos'].includes(this.state)) this.goHome();
  }

  /**
   * Scrolled back above the frames (or the logo): the way in, played
   * backwards at the same pace. The frames sink away, a beat, the
   * pieces gather back into the rocks and the rocks come apart; the glide
   * home starts LEAD s before they're done, as the way in lands LEAD s
   * after the rocks start closing. From further down (the text, the
   * reel), first a quick climb back to the frames.
   */
  goHome() {
    if (!this.lenis) return;
    this.stopAuto();
    if (store.scroll > this.handBack + 3) {
      this.state = 'toHome';
      this.lenis.stop();
      const d = Math.min(1.4, 0.5 + ((store.scroll - this.handBack) / store.height) * 0.25);
      this.glideEnd = performance.now() + (d + 0.6) * 1000;
      this.lenis.scrollTo(this.handBack, { duration: d, easing: glideEase, force: true, onComplete: () => this.rewind() });
      return;
    }
    this.rewind();
  }

  rewind() {
    const from = Math.min(this.rockP, this.photosP);
    const steps = [];
    if (from > SCATTERED) {
      steps.push({ p: SCATTERED, duration: FRAMES * clamp((from - SCATTERED) / Math.max(0.001, this.photosP - SCATTERED), 0.2, 1) });
    }
    if (from > COLLIDE) steps.push({ p: COLLIDE, duration: BURST, ease: 'power2.in', gap: steps.length ? BEAT : 0 });
    if (from > 0) steps.push({ p: 0, duration: DRAW_IN });

    /* (Above About already — the Home key — the rocks rewind where they are.) */
    let gliding = false;
    const tl = this.autoplay(from, steps, { state: 'toHome', keepPace: () => !gliding && store.scroll >= this.aboutTop - 1 });
    const glideAt = Math.max(0, tl.duration() - LEAD);
    tl.call(() => {
      gliding = true;
      this.glideHome();
    }, null, glideAt);
    this.glideEnd = performance.now() + (glideAt + GLIDE + 0.6) * 1000;
  }

  /** The glide home itself: the rocks return to their orbit round the
      sketches, and the heading settles back in as the page arrives. */
  glideHome() {
    gsap.to(this.journey, { f: 0, duration: GLIDE * 0.95, ease: 'power2.inOut', overwrite: 'auto' });
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
        this.release();
      }
    });
  }

  /**
   * The header logo, clicked from anywhere down the page: straight back to
   * the welcome screen, without replaying everything in between. The view
   * is yanked down and away, speed lines streaming past, as if the page
   * were hauled back up in one pull. Behind that it cuts to the top, and
   * the welcome screen drops in from above and springs to rest; the
   * heading settles in after it, and the rocks fade back into orbit last.
   */
  goTop() {
    if (!this.lenis || !this.entered || this.state === 'toHome') return;
    if (this.state === 'home' && store.scroll < 3) return;
    const content = this.el.querySelector('.page-content');
    if (!content) return;
    this.stopAuto();
    this.pullTl?.kill();
    gsap.killTweensOf([this.journey, this.cue, ...this.heroLines()].filter(Boolean));
    this.state = 'toHome';
    this.lenis.stop();
    this.glideEnd = performance.now() + (PULL + DROP + 0.6) * 1000;

    const vh = store.height;
    /* The rocks' layer is fixed but inside the page, so moving the page
       would carry it off; the canvases are outside it and wouldn't move.
       All of them step out for the pull and come back once it's done. */
    const rocks = this.duoEl?.querySelector('.duo-actions');
    const canvases = [this.stage.canvas, this.fx.canvas];
    const streaks = this.pullStreaks();
    const lines = [...streaks.children];
    const rain = () => lines.forEach((l) => {
      const h = l.offsetHeight;
      gsap.fromTo(l, { y: -h }, {
        y: vh + h, duration: gsap.utils.random(0.26, 0.48), ease: 'none',
        repeat: -1, delay: gsap.utils.random(0, 0.25)
      });
    });
    const home = () => {
      this.state = 'home';
      this.release();
    };

    const tl = gsap.timeline({
      onComplete: () => {
        gsap.killTweensOf(lines);
        gsap.set([rocks, ...canvases].filter(Boolean), { clearProps: 'opacity' });
        this.pullTl = null;
      }
    });
    this.pullTl = tl;

    /* 1 — pulled: everything in view rushes down and out of sight. */
    if (rocks) tl.set(rocks, { opacity: 0 }, 0);
    tl.to(canvases, { opacity: 0, duration: 0.2, ease: 'power1.in' }, 0)
      .add(rain, 0)
      .to(streaks, { opacity: 1, duration: 0.25, ease: 'power1.out' }, 0.04)
      .to(content, { y: vh * 0.32, opacity: 0, duration: PULL, ease: 'power3.in' }, 0)
      .add(() => this.world?.fadeTo(0.6, PULL), 0)

      /* 2 — out of sight, straight to the top: the welcome screen as it
         was, the rocks back home and About rewound (loop() follows). */
      .add(() => {
        this.lenis.scrollTo(0, { immediate: true, force: true });
        this.journey.f = 0;
        this.rockP = 0;
        gsap.set(content, { y: -vh * 0.22 });
        gsap.set(this.heroLines(), { y: -70, opacity: 0, filter: 'blur(12px)' });
      }, PULL)

      /* 3 — it drops in from above, overshoots a touch and springs back. */
      .to(content, { y: 0, duration: DROP, ease: 'back.out(1.5)' }, PULL)
      .to(content, { opacity: 1, duration: 0.35, ease: 'power1.out' }, PULL)
      .to(streaks, { opacity: 0, duration: 0.45, ease: 'power2.out' }, PULL + 0.1)
      .add(() => this.world?.fadeTo(1, 0.8), PULL)
      .to(this.heroLines(), {
        y: 0, opacity: 1, filter: 'blur(0px)',
        duration: 0.9, ease: 'power3.out', stagger: 0.06
      }, PULL + 0.2)
      .set(content, { clearProps: 'transform,opacity' }, PULL + DROP)
      .add(home, PULL + DROP)
      .to(canvases, { opacity: 1, duration: 0.3, ease: 'power1.out' }, PULL + DROP);
    if (this.cue) tl.to(this.cue, { opacity: 1, y: 0, duration: 0.8, ease: 'power2.out' }, PULL + 0.5);
    if (rocks) tl.to(rocks, { opacity: 1, duration: 0.55, ease: 'power2.out' }, PULL + DROP);
  }

  /** Speed lines for goTop: thin streaks raining past, made once. */
  pullStreaks() {
    if (this.streakEl) return this.streakEl;
    const el = document.createElement('div');
    el.className = 'pull-streaks';
    el.setAttribute('aria-hidden', 'true');
    const n = 18;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('i');
      s.style.left = `${((i + Math.random() * 0.8) / n) * 100}%`;
      s.style.height = `${16 + Math.random() * 26}vh`;
      s.style.opacity = (0.35 + Math.random() * 0.65).toFixed(2);
      el.appendChild(s);
    }
    document.body.appendChild(el);
    this.streakEl = el;
    return el;
  }

  /**
   * Already at (or past) About without gliding there — the page loaded
   * mid-scroll (the browser restores the position on reload), or the
   * scroll jumped (End key, scrollbar): settle straight into the About
   * state, the welcome copy away and the rocks travelling with the viewer.
   * Short of the text, the rest plays out on its own from there.
   */
  atAbout() {
    gsap.killTweensOf([this.journey, ...this.heroLines()]);
    this.state = 'about';
    this.journey.f = 1;
    gsap.set(this.heroLines(), { y: -70, opacity: 0, filter: 'blur(12px)' });
    if (this.cue) gsap.set(this.cue, { opacity: 0, y: 14 });
    if (store.scroll < this.handBack - 3) this.smash();
    else {
      this.rockP = this.aboutProgress(store.scroll);
      this.goText();
    }
  }

  /**
   * A glide that never reported back — something restarted the scroll
   * mid-way, which cancels Lenis's animation and its onComplete. Finish
   * it so the page can't stay stuck between states (welcome copy gone,
   * rocks on the travelling orbit, no way home).
   */
  finishGlide() {
    const to = this.state;
    this.stopAuto();
    if (to === 'toText') this.settle('text', this.aboutAt(1));
    else if (to === 'toAbout' || to === 'toPhotos') this.settle('about', this.handBack);
    else {
      this.settle('home', 0);
      this.journey.f = 0;
      gsap.to(this.heroLines(), { y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.6, ease: 'power2.out', overwrite: 'auto' });
      if (this.cue) gsap.to(this.cue, { opacity: 1, y: 0, duration: 0.6, ease: 'power2.out', overwrite: 'auto' });
    }
  }

  /* ---------------------------------------------------------- about */

  /**
   * One paused timeline for the whole About sequence; scroll sets its
   * position. The frames rise in, empty, "Scroll down" in them (that much
   * plays on its own — see smash). Then, with the next scroll (goText):
   * the prompt goes, each photo cuts in from below with a camera flash and
   * settles, the text rises line by line, then the button. Going back plays
   * it exactly in reverse (goPhotos).
   */
  buildAbout() {
    this.aboutTl?.kill();
    const tl = gsap.timeline({ paused: true });

    this.frames.forEach((f, fi) => {
      tl.fromTo(f, { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.7, ease: 'power2.out' }, fi * 0.1);
    });
    const hints = this.frames.map((f) => f.querySelector('.about-hint')).filter(Boolean);
    tl.fromTo(hints, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.4, ease: 'power2.out' }, 0.5)
      /* …held until the scroll comes, then gone as the photos arrive. */
      .to(hints, { opacity: 0, y: -10, duration: 0.25, ease: 'power2.in' }, HAND_BACK + 0.02);

    this.frames.forEach((f, fi) => {
      const photo = f.querySelector('.about-photo');
      const flash = f.querySelector('.about-flash');
      if (!photo) return;
      const at = REVEAL + fi * 0.08;
      tl.fromTo(photo, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 0.55, ease: 'power2.out' }, at)
        .fromTo(photo, { scale: 1.14 }, { scale: 1, duration: 1.3, ease: 'power2.out' }, at);
      if (flash) {
        tl.fromTo(flash, { opacity: 0 }, { opacity: 0.45, duration: 0.08, ease: 'none', immediateRender: false }, at)
          .fromTo(flash, { opacity: 0.45 }, { opacity: 0, duration: 0.35, ease: 'power2.out', immediateRender: false }, at + 0.08);
      }
    });

    const textAt = REVEAL + 1.2;
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

    /* Up to the empty frames, it plays on its own (see smash). */
    this.briefAuto = HAND_BACK / tl.duration();

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
      /* Where each card's centre sits along the track. Read once here, not
         every frame: reading layout right after writing the track's
         transform forced a style recalculation per card per frame. */
      this.showCentres = this.showCards.map((c) => c.offsetLeft + c.offsetWidth / 2);
      this.showQ = null;
    }
    if (!this.about) return;
    /* The page's real scroll, not store.scroll: on a reload the browser
       restores the position before Lenis has reported it. */
    const y = window.scrollY;
    this.aboutTop = this.about.getBoundingClientRect().top + y;
    this.aboutH = this.about.offsetHeight;
    if (this.show) this.showTop = this.show.getBoundingClientRect().top + y;
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

    /* Cards sliding under a still pointer would each flood with water,
       start their video and dim the rest, one after another, all the way
       along — so while the reel moves they don't take the pointer
       (main-page.css); it settles on whichever is under it once it stops. */
    if (this.showMoving && performance.now() - this.showMovedAt > 220) {
      this.showMoving = false;
      this.show.classList.remove('is-moving');
    }

    /* Straight from the scroll, which is smoothed already — easing it
       again left the reel trailing behind. */
    const q = clamp((scroll - this.showTop) / Math.max(1, this.showTravel), 0, 1);
    const x = -q * this.showTravel;
    /* At rest (or off screen, where it rests at either end) nothing is
       written, so there's no style work at all. */
    if (Math.abs(x - this.showX) < 0.05 && q === this.showQ) return;
    this.showX = x;
    this.showQ = q;
    this.showMovedAt = performance.now();
    if (!this.showMoving) {
      this.showMoving = true;
      this.show.classList.add('is-moving');
    }
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
      const c = this.showCentres[i] + this.showX;
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

    /* The guided moves between the two pages — only once the page has
       entered and the scroll is live (a glide started earlier would be
       cancelled when the app starts the scroll). Arriving already at or
       past About (a reload mid-page, a jump) skips the glide. */
    if (this.entered) {
      const s = this.state;
      const now = performance.now();
      const text = this.aboutAt(1);
      const up = scroll < this.lastScroll - 0.5;
      if (this.held && !s.startsWith('to') && now - this.inputAt > QUIET * 1000) {
        this.held = false;
        this.lenis?.start();
      }
      if (s === 'home' && scroll > 3) {
        if (scroll >= this.aboutTop - 3) this.atAbout();
        else this.goAbout();
      } else if ((s === 'about' || s === 'text') && scroll < this.handBack - 3) this.goHome();
      else if (s === 'about' && scroll > this.handBack + 3) this.goText();
      else if (s === 'text' && scroll < text - 3) this.goPhotos();
      /* Out of the reel and up towards About: the rest of the way in one go. */
      else if (s === 'text' && up && this.show && scroll > text + 3 && scroll < this.showTop - 3) this.backToText();
      else if (s.startsWith('to') && now > this.glideEnd) this.finishGlide();
    }
    this.lastScroll = scroll;

    const end = this.aboutTop + this.aboutH - vh;

    /* One progress for the whole scroll through About — unless it's playing
       out on its own (see smash). */
    if (!this.auto) this.rockP = ease(this.rockP, clamp((scroll - this.aboutTop) / Math.max(1, end - this.aboutTop), 0, 1));

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

    /* The "Scroll down" arrows' bob rests while About is out of sight. */
    const away = scroll < this.aboutTop - vh || scroll > this.aboutTop + this.aboutH;
    if (away !== this.aboutAway) {
      this.aboutAway = away;
      this.about?.classList.toggle('is-away', away);
    }
  }

  resize() {
    super.resize();
    if (this.aboutSplit) {
      this.aboutSplit.resize();
      this.buildAbout();
    }
    this.measure();
    /* Keep the viewer where they were if a resize moved it. */
    if (this.state === 'about' && Math.abs(store.scroll - this.handBack) > 1) {
      this.lenis?.scrollTo(this.handBack, { immediate: true, force: true });
    } else if (this.state === 'text' && store.scroll < this.aboutAt(1)) {
      this.lenis?.scrollTo(this.aboutAt(1), { immediate: true, force: true });
    }
    this.fx.resize();
    this.stage.resize();
    this.duo?.resize();
    this.finaleFx?.resize();
  }

  /* ------------------------------------------------------ enter/leave */

  onEnter(tl) {
    this.entered = true;
    this.duo?.loadLate();
    /* The scroll cue draws itself downward. */
    tl.to(this.el.querySelectorAll('.scroll-cue-track'), { scaleY: 1, duration: 1.6, ease: 'expo.out' }, 0.7)
      .to(this.el.querySelectorAll('.scroll-cue-head, .scroll-cue-label'), { opacity: 1, duration: 0.8, ease: 'power2.out', stagger: 0.1 }, 1.2);

    /* Each sketch powers on like a neon tube: a few failed strikes, then on. */
    this.el.querySelectorAll('.sketch').forEach((s, i) => {
      const svg = s.querySelector('.sketch-svg');
      const at = 0.6 + i * 0.35;
      tl.to(svg, {
        keyframes: [
          { opacity: 0.6, duration: 0.05 }, { opacity: 0, duration: 0.08 },
          { opacity: 0.9, duration: 0.04 }, { opacity: 0.1, duration: 0.12 },
          { opacity: 1, duration: 0.05 }, { opacity: 0.45, duration: 0.05 },
          { opacity: 1, duration: 0.3 }
        ]
      }, at);
    });

    /* The rocks drift in out of the dark; their transform is handed back
       to CSS afterwards so the hover grow still works. */
    tl.to(this.el.querySelectorAll('.duo-action-rock'), {
      opacity: 1, scale: 1, duration: 1.4, ease: 'expo.out', stagger: 0.14, clearProps: 'transform'
    }, 1.4);
  }

  onLeave(tl) {
    tl.to([this.duoEl, this.about, this.show, this.finale].filter(Boolean), { opacity: 0, duration: 0.45, ease: 'power2.in' }, 0);
  }

  destroy() {
    super.destroy();
    /* Never leave the scroll locked behind us. */
    if (this.state.startsWith('to') || this.held) this.lenis?.start();
    for (const type of ['wheel', 'touchmove', 'keydown']) {
      window.removeEventListener(type, this.onInput, { capture: true });
    }
    this.cue?.removeEventListener('click', this.onCue);
    this.unmagnet?.();
    gsap.killTweensOf([this.cue, this.journey, ...this.heroLines()]);
    this.pullTl?.kill();
    if (this.streakEl) {
      gsap.killTweensOf(this.streakEl.children);
      this.streakEl.remove();
    }
    this.stopAuto();
    this.aboutTl?.kill();
    this.showTl?.kill();
    this.water?.destroy();
    this.finaleFx?.destroy();
    this.scatter.destroy();
    this.duo?.destroy();
    this.fx.destroy();
    this.stage.destroy();
  }
}
