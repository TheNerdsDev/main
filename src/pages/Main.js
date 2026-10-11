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
import PlanetShower from '../fx/PlanetShower.js';
import { PALETTE } from '../gl/World.js';
import { clamp } from '../fx/particles.js';
import { REACH } from '../content/astronauts.js';

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
 *   About          two spaceship portholes slide in, shutters shut,
 *                  asking for a scroll. Now your scroll drives everything,
 *                  both ways: the shutters iris open on the two of us,
 *                  cartoon astronauts in our cabins; we reach out to each
 *                  other in a 20-shot burst; the text unfolds.
 *   About → Home   scroll back into the collision and it plays in reverse
 *                  on its own, then glides you home again.
 *
 * Below About, the work gets its own pinned reel: the scroll pulls the
 * projects sideways past you, then lets go to the footer.
 */
const GLIDE = 1.3;
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
   (BURST s), a beat, then the two portholes slide in, shutters shut, with
   "Scroll down" on them (FRAMES s). The scroll is handed back there — the
   windows open only for it. Scrolling back into that stretch plays it in reverse
   (UNSMASH s) and glides home. */
const LEAD = 0.35;
const DRAW_IN = 0.5;
const BURST = 0.55;
const BEAT = 0.25;
const FRAMES = 1.1;
const UNSMASH = 1.1;
/* How closely the scrubbed sequences follow the scroll (per 60fps frame).
   Lenis already smooths the scroll; this only takes the edge off. */
const FOLLOW = 0.16;

/* The About brief's own clock (timeline seconds, scrubbed by the scroll):
   the portholes are in, shut, by HAND_BACK; their shutters iris open from
   IRIS; from ROLL_AT, over ROLL, each of us reaches out in SHOTS steps —
   a burst, not a glide. */
const HAND_BACK = 1;
const IRIS = 1.1;
const ROLL_AT = 1.75;
const ROLL = 3.2;
const SHOTS = 20;

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
    this.stageEl = q('.about-stage');
    this.pair = q('.about-pair');
    this.portholes = [...this.el.querySelectorAll('.porthole')];
    /* Each astronaut's reaching arm: shoulder and elbow, posed by roll(). */
    this.arms = this.portholes.map((p) => {
      const joint = (s) => {
        const el = p.querySelector(s);
        return el ? { el, pivot: el.dataset.pivot } : null;
      };
      return { arm: joint('.astro-arm'), fore: joint('.astro-fore') };
    });
    this.shotAt = -1;
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

    /* Where we are: 'home' | 'toAbout' | 'about' | 'toHome'. Nothing glides
       until the page has entered (see onEnter). */
    this.state = 'home';
    this.journey = { f: 0 };
    this.entered = false;

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
    this.bindButtonShake();
    this.bindTilt();
    this.buildFinale();

    this.measure();
  }

  /**
   * The About Us and Contact us buttons are magnetic: once the cursor comes
   * within reach, a button leans after it — following its movement, but
   * never more than PULL px from home — and eases back when the cursor
   * leaves. (Hover also grows it; see the CSS.)
   */
  bindButtonShake() {
    if (!window.matchMedia('(hover: hover)').matches) return;
    const PULL = 22;
    const springs = [this.button, this.finaleButton].filter(Boolean).map((btn) => ({
      btn, x: 0, y: 0, tx: 0, ty: 0
    }));
    if (!springs.length) return;
    let on = false;
    this.onButtonMove = (e) => {
      for (const s of springs) {
        const r = s.btn.getBoundingClientRect();
        if (!r.width) continue;
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
      }
      if (!on && springs.some((s) => s.tx || s.ty)) {
        on = true;
        gsap.ticker.add(this.buttonSpring);
      }
    };
    this.buttonSpring = () => {
      const k = 1 - Math.pow(1 - 0.16, gsap.ticker.deltaRatio(60));
      let busy = false;
      for (const s of springs) {
        s.x += (s.tx - s.x) * k;
        s.y += (s.ty - s.y) * k;
        if (!s.tx && !s.ty && Math.abs(s.x) + Math.abs(s.y) < 0.05) {
          if (s.x || s.y) {
            s.x = s.y = 0;
            s.btn.style.removeProperty('--nx');
            s.btn.style.removeProperty('--ny');
          }
          continue;
        }
        busy = true;
        s.btn.style.setProperty('--nx', `${s.x.toFixed(2)}px`);
        s.btn.style.setProperty('--ny', `${s.y.toFixed(2)}px`);
      }
      if (!busy) {
        gsap.ticker.remove(this.buttonSpring);
        on = false;
      }
    };
    window.addEventListener('pointermove', this.onButtonMove, { passive: true });
  }

  /**
   * The closing section: a planet shower each time it scrolls into view
   * (from above), and the heading and button arriving with it. Without
   * WebGL2 (or with reduced motion) the text simply shows.
   */
  buildFinale() {
    if (!this.finale) return;
    const reveal = () => {
      this.finale.classList.remove('is-in');
      void this.finale.offsetWidth;
      this.finale.classList.add('is-in');
    };
    const canvas = this.finale.querySelector('.planet-canvas');
    if (canvas && PlanetShower.supported()) {
      this.planets = new PlanetShower(this.finale, canvas, { onShower: reveal });
    }
    if (!this.planets || this.planets.dead) {
      canvas?.remove();
      this.finaleIO = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) this.finale.classList.add('is-in');
      }, { threshold: 0.3 });
      this.finaleIO.observe(this.finale);
    }
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

  /** Where the frames have arrived and wait for the photos: the scroll is
      handed back here. */
  get handBack() {
    return this.aboutAt(SCATTERED + (1 - SCATTERED) * this.briefAuto);
  }

  /**
   * Keep the wheel and play About on without waiting for a scroll: the
   * rocks are drawn together and collide, the pieces burst out, a beat,
   * then the frames arrive, empty, asking for a scroll. The scroll is
   * handed back there: the photos roll only as you scroll.
   *
   * It runs on its own clock rather than the scroll's, so it can begin
   * (after `delay`) while the glide is still landing. Once landed, the
   * scroll keeps pace — the stage is sticky, so that moves nothing.
   */
  smash(delay = 0) {
    if (!this.lenis) return;
    this.state = 'toAbout';
    this.lenis.stop();
    this.autoTl?.kill();

    const auto = { p: Math.max(this.rockP, this.aboutProgress(store.scroll)) };
    this.auto = auto;
    const follow = () => {
      this.rockP = auto.p;
      if (store.scroll >= this.aboutTop - 1) this.lenis.scrollTo(this.aboutAt(auto.p), { immediate: true, force: true });
    };
    const tl = gsap.timeline({
      delay,
      onUpdate: follow,
      onComplete: () => {
        this.auto = null;
        this.lenis.scrollTo(this.handBack, { immediate: true, force: true });
        this.state = 'about';
        this.lenis.start();
      }
    });
    /* Straight in (the rocks' own pull already gathers speed into the hit),
       then flung apart. */
    if (auto.p < COLLIDE) tl.to(auto, { p: COLLIDE, duration: DRAW_IN, ease: 'none' });
    if (auto.p < SCATTERED) tl.to(auto, { p: SCATTERED, duration: BURST, ease: 'power2.out' });
    tl.to(auto, { p: SCATTERED + (1 - SCATTERED) * this.briefAuto, duration: FRAMES, ease: 'none' }, tl.duration() ? `+=${BEAT}` : 0);

    this.glideEnd = performance.now() + (delay + tl.duration() + 0.6) * 1000;
    this.autoTl = tl;
  }

  /** Stop playing About on its own (the scroll drives it again). */
  stopAuto() {
    this.autoTl?.kill();
    this.auto = null;
  }

  /** The logo, from anywhere down the page: all the way back to the welcome. */
  toTop() {
    if (this.state === 'about' || this.state === 'toAbout') this.goHome();
  }

  /**
   * Scrolled back above the text, or the logo: carry the viewer home —
   * back up through the photos and the collision first (the pieces
   * gather, the rocks come apart), then the glide. From further down
   * (the work, the finale) that rewind runs a little longer.
   */
  goHome() {
    if (!this.lenis) return;
    this.stopAuto();
    this.state = 'toHome';
    const back = store.scroll - this.aboutTop;
    const span = Math.max(1, this.handBack - this.aboutTop);
    const wait = back > 3 ? Math.min(UNSMASH * Math.sqrt(Math.max(1, back / span)), UNSMASH * 1.8) : 0;
    this.glideEnd = performance.now() + (wait + GLIDE + 0.6) * 1000;
    this.lenis.stop();

    /* The rocks return to orbit as the sketches come back into view.
       (Timed, not chained to the scroll, so they still play if a glide is
       cut short — see finishGlide.) */
    gsap.to(this.journey, { f: 0, duration: GLIDE * 0.95, delay: wait, ease: 'power2.inOut', overwrite: 'auto' });

    /* The heading settles back in as the page arrives. */
    gsap.to(this.heroLines(), {
      y: 0, opacity: 1, filter: 'blur(0px)',
      duration: 1, ease: 'power3.out', stagger: 0.07, delay: wait + GLIDE * 0.55, overwrite: 'auto'
    });
    if (this.cue) gsap.to(this.cue, { opacity: 1, y: 0, duration: 0.9, ease: 'power2.out', delay: wait + GLIDE * 0.8, overwrite: 'auto' });

    const glide = () => this.lenis.scrollTo(0, {
      duration: GLIDE,
      easing: glideEase,
      force: true,
      onComplete: () => {
        this.state = 'home';
        this.lenis.start();
      }
    });
    if (!wait) glide();
    else this.lenis.scrollTo(this.aboutTop, { duration: wait, easing: glideEase, force: true, onComplete: glide });
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
      this.lenis.start();
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
  }

  /**
   * A glide that never reported back — something restarted the scroll
   * mid-way, which cancels Lenis's animation and its onComplete. Finish
   * it so the page can't stay stuck between states (welcome copy gone,
   * rocks on the travelling orbit, no way home).
   */
  finishGlide() {
    const toAbout = this.state === 'toAbout';
    this.stopAuto();
    this.lenis?.scrollTo(toAbout ? this.handBack : 0, { immediate: true, force: true });
    this.state = toAbout ? 'about' : 'home';
    this.lenis?.start();
  }

  /* ---------------------------------------------------------- about */

  /**
   * One paused timeline for the whole About sequence; scroll sets its
   * position. The portholes slide in from either side, shutters shut,
   * "Scroll down" on them (that much plays on its own — see smash). Then,
   * only as you scroll: the prompt goes, the shutters iris open on each of
   * us in our cabin; we reach out to each other, shot by shot (roll()); the
   * text rises line by line, then the button. Scrolling back plays it
   * exactly in reverse.
   */
  buildAbout() {
    this.aboutTl?.kill();
    const tl = gsap.timeline({ paused: true });
    const [left, right] = this.portholes;
    const all = (s) => this.portholes.flatMap((p) => [...p.querySelectorAll(s)]);

    if (left) tl.fromTo(left, { opacity: 0, x: -140 }, { opacity: 1, x: 0, duration: 0.8, ease: 'power3.out' }, 0);
    if (right) tl.fromTo(right, { opacity: 0, x: 140 }, { opacity: 1, x: 0, duration: 0.8, ease: 'power3.out' }, 0.08);
    const hints = all('.porthole-hint, .porthole-hint-arrow');
    tl.fromTo(hints, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' }, 0.5)
      /* …held until the scroll comes, then gone as the shutters open. */
      .to(hints, { opacity: 0, y: -8, duration: 0.2, ease: 'power2.in' }, HAND_BACK + 0.02);

    /* The iris: the view grows out from the middle as the blades turn away. */
    tl.fromTo(all('.porthole-view'), { '--iris': '0%' }, { '--iris': '75%', duration: 0.85, ease: 'power2.inOut', stagger: 0.08 }, IRIS)
      .fromTo(all('.porthole-shutter'), { rotate: 0 }, { rotate: 60, duration: 0.85, ease: 'power2.inOut', stagger: 0.08 }, IRIS);
    /* …and there they are, leaning in towards each other. */
    const [crewL, crewR] = this.portholes.map((p) => p.querySelector('.porthole-crew'));
    if (crewL) tl.fromTo(crewL, { xPercent: -6 }, { xPercent: 0, duration: 0.9, ease: 'power2.out' }, IRIS + 0.2);
    if (crewR) tl.fromTo(crewR, { xPercent: 6 }, { xPercent: 0, duration: 0.9, ease: 'power2.out' }, IRIS + 0.28);

    /* The burst: from ROLL_AT, over ROLL, they reach out (roll()). */
    tl.to({}, { duration: 0 }, ROLL_AT + ROLL);

    let textAt = ROLL_AT + ROLL + 0.2;
    /* On a phone the windows are stacked: they draw back and up together,
       to make room for the text at the foot of the screen. */
    const shrink = this.pairShrink();
    if (shrink) {
      tl.fromTo(this.pair, { scale: 1, y: 0 }, { scale: shrink.s, y: shrink.y, duration: 0.6, ease: 'power2.inOut' }, textAt);
      textAt += 0.5;
    }
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

    /* Up to the shut portholes, it plays on its own (see smash). */
    this.briefAuto = HAND_BACK / tl.duration();

    tl.progress(this.aboutP);
    this.aboutTl = tl;
    this.roll(this.aboutP);
  }

  /**
   * The burst: which of the SHOTS poses the reaching arms are in, at About
   * progress p — a straight cut from one to the next, like a burst of
   * photos. The shoulder swings the arm up from the side to straight out;
   * the elbow bends a little more on the way, then straightens.
   */
  roll(p) {
    if (!this.aboutTl || !this.arms.length) return;
    const t = p * this.aboutTl.duration();
    const i = clamp(Math.floor(((t - ROLL_AT) / ROLL) * SHOTS), 0, SHOTS - 1);
    if (i === this.shotAt) return;
    this.shotAt = i;
    const k = i / (SHOTS - 1);
    const e = k * k * (3 - 2 * k);
    const shoulder = REACH.rest + (REACH.out - REACH.rest) * e;
    const elbow = REACH.bendRest * (1 - e) + REACH.bendMid * Math.sin(Math.PI * e);
    for (const { arm, fore } of this.arms) {
      arm?.el.setAttribute('transform', `rotate(${shoulder.toFixed(2)} ${arm.pivot})`);
      fore?.el.setAttribute('transform', `rotate(${elbow.toFixed(2)} ${fore.pivot})`);
    }
  }

  /**
   * Phones, with the windows stacked: how far the pair must draw back (s)
   * and rise (y, px) for the text at the foot of the screen to fit under
   * it. Null where it fits as it is (side by side, wider screens).
   */
  pairShrink() {
    const body = this.el.querySelector('.about-body');
    if (!this.pair || !body || getComputedStyle(this.pair).display === 'contents') return null;
    gsap.set(this.pair, { clearProps: 'transform' });
    if (getComputedStyle(body).position !== 'absolute') return null;
    const header = document.querySelector('.site-header');
    const top = (header?.offsetHeight || 0) + 12;
    const gap = 18;
    const pairTop = this.pair.offsetTop;
    const h = this.pair.offsetHeight;
    const bottom = body.offsetTop - gap;
    if (pairTop >= top && pairTop + h <= bottom) return null;
    return { s: Math.min(1, (bottom - top) / h), y: top - pairTop };
  }

  /**
   * The portholes lean after the cursor — or, on a phone, the tilt of the
   * phone, where the browser gives it without asking (iOS asks, so there
   * they hold still). main-page.css turns --px/--py into the lean and each
   * layer's own shift (see updateTilt).
   */
  bindTilt() {
    this.tilt = { x: 0, y: 0, tx: 0, ty: 0 };
    if (!this.portholes.length || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
      this.tiltEvent = 'pointermove';
      this.onTilt = (e) => {
        this.tilt.tx = (e.clientX / window.innerWidth) * 2 - 1;
        this.tilt.ty = (e.clientY / window.innerHeight) * 2 - 1;
      };
    } else if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function') {
      this.tiltEvent = 'deviceorientation';
      this.onTilt = (e) => {
        if (e.gamma == null || e.beta == null) return;
        this.tilt.tx = clamp(e.gamma / 30, -1, 1);
        this.tilt.ty = clamp((e.beta - 50) / 30, -1, 1);
      };
    } else {
      return;
    }
    window.addEventListener(this.tiltEvent, this.onTilt, { passive: true });
  }

  /** Ease the lean after the pointer — only while the windows are on screen. */
  updateTilt(scroll, vh) {
    const t = this.tilt;
    if (!this.onTilt || !this.aboutH) return;
    const near = scroll > this.aboutTop - vh && scroll < this.aboutTop + this.aboutH;
    const k = 1 - Math.pow(1 - 0.08, gsap.ticker.deltaRatio(60));
    const x = t.x + ((near ? t.tx : 0) - t.x) * k;
    const y = t.y + ((near ? t.ty : 0) - t.y) * k;
    if (Math.abs(x - t.x) < 0.0005 && Math.abs(y - t.y) < 0.0005) return;
    t.x = x;
    t.y = y;
    for (const p of this.portholes) {
      p.style.setProperty('--px', x.toFixed(3));
      p.style.setProperty('--py', y.toFixed(3));
    }
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

    const q = clamp((scroll - this.showTop) / Math.max(1, this.showTravel), 0, 1);
    const x = ease(this.showX, -q * this.showTravel);
    /* At rest (or off screen, where it rests at either end) nothing is
       written, so there's no style work at all. */
    if (x === this.showX && q === this.showQ) return;
    this.showX = x;
    this.showQ = q;
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
      if (this.state === 'home' && scroll > 3) {
        if (scroll >= this.aboutTop - 3) this.atAbout();
        else this.goAbout();
      } else if (this.state === 'about' && scroll < this.handBack - 3) this.goHome();
      else if ((this.state === 'toAbout' || this.state === 'toHome') && performance.now() > this.glideEnd) this.finishGlide();
    }

    const end = this.aboutTop + this.aboutH - vh;

    /* One progress for the whole scroll through About — unless it's playing
       out on its own (see smash). */
    if (!this.auto) this.rockP = ease(this.rockP, clamp((scroll - this.aboutTop) / Math.max(1, end - this.aboutTop), 0, 1));

    /* About brief: only once the rocks have scattered. */
    const aboutNext = clamp((this.rockP - SCATTERED) / (1 - SCATTERED), 0, 1);
    if (aboutNext !== this.aboutP) {
      this.aboutP = aboutNext;
      this.aboutTl.progress(aboutNext);
      this.roll(aboutNext);
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
    this.updateTilt(scroll, vh);
  }

  resize() {
    super.resize();
    if (this.aboutSplit) {
      this.aboutSplit.resize();
      this.buildAbout();
    }
    this.measure();
    /* Keep the viewer at the text if a resize moved where it starts. */
    if (this.state === 'about' && store.scroll < this.handBack) {
      this.lenis?.scrollTo(this.handBack, { immediate: true, force: true });
    }
    this.fx.resize();
    this.stage.resize();
    this.duo?.resize();
    this.planets?.resize();
  }

  /* ------------------------------------------------------ enter/leave */

  onEnter(tl) {
    this.entered = true;
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
    if (this.state === 'toAbout' || this.state === 'toHome') this.lenis?.start();
    this.cue?.removeEventListener('click', this.onCue);
    if (this.onButtonMove) window.removeEventListener('pointermove', this.onButtonMove);
    if (this.onTilt) window.removeEventListener(this.tiltEvent, this.onTilt);
    if (this.buttonSpring) gsap.ticker.remove(this.buttonSpring);
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
    this.planets?.destroy();
    this.finaleIO?.disconnect();
    this.scatter.destroy();
    this.duo?.destroy();
    this.fx.destroy();
    this.stage.destroy();
  }
}
