import gsap from 'gsap';
import store from '../core/Store.js';
import Page from './Page.js';

/* -------------------------------------------------------------------
   Card stack — one vertical column of cards travelling through a fixed
   focus line, like a strip of film. Every card's look is a pure
   function of its fractional distance from that line (`rel`), so the
   same scroll position always produces the same frame, in either
   direction, and no card ever jumps.

   Desktop pins the column and loops it endlessly. Tablets and phones
   keep the cards in the normal document flow and apply the same depth
   hierarchy around a focus line in the viewport.
   ------------------------------------------------------------------- */
const STACK = {
  desktop: {
    gap: 8,               // px between the card in focus and its neighbours
    focus: 0.5,           // focus line, × viewport height
    smoothing: 0.14,      // extra damping on top of Lenis, per 60fps frame (1 = none)
    scaleStep: 0.075,     // scale lost per card of distance → 0.925, 0.85, 0.775
    opacity: [1, 0.8, 0.36, 0.1],   // at distance 0, 1, 2, 3
    blur:    [0, 1.6, 4.5, 8],      // px, at distance 0, 1, 2, 3
    rotX: 3,              // deg per card — the column leans back above and below the focus
    rotY: -1.5,           // deg, a constant turn so the stack is never dead flat
    rotYStep: 0.6,        // deg per card
    rotZ: 0.5,            // deg per card — above rolls one way, below the other (kept small: the gap is tight)
    drift: 12,            // px sideways at distance 1, grows with distance^1.3
    cycles: 3             // full loops in the scroll runway
  },
  tablet: {
    pitch: 0.94,          // in flow: × the measured layout spacing
    focus: 0.5,
    smoothing: 1,         // in flow the layout already tracks the finger — never lag it
    scaleStep: 0.065,
    opacity: [1, 0.75, 0.35, 0.1],
    blur:    [0, 1.4, 3.5, 6],
    rotX: 1.8,
    rotY: -1,
    rotYStep: 0.4,
    rotZ: 0.8,
    drift: 6
  },
  mobile: {
    pitch: 0.94,
    focus: 0.55,
    smoothing: 1,
    scaleStep: 0.06,
    opacity: [1, 0.72, 0.32, 0.1],
    blur:    [0, 1.2, 3, 5],
    rotX: 1.2,
    rotY: 0,
    rotYStep: 0,
    rotZ: 0.5,
    drift: 0              // no sideways drift — full-width cards would overflow
  }
};

/* |rel| with the point at zero rounded off (a cubic that meets |rel|
   with matching slope at SOFT), so scale, fade and blur ease through the
   focus instead of turning around on a sharp corner. */
const SOFT = 0.35;
const softAbs = (v) => {
  const d = Math.abs(v);
  return d >= SOFT ? d : (2 * d * d) / SOFT - (d * d * d) / (SOFT * SOFT);
};

const DEG = Math.PI / 180;
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/** Piecewise-linear lookup into stops placed at distance 0, 1, 2, … */
const ramp = (stops, d) => {
  const last = stops.length - 1;
  if (d >= last) return stops[last];
  const i = Math.floor(d);
  return stops[i] + (stops[i + 1] - stops[i]) * (d - i);
};

/** Wrap into [-n/2, n/2) — the shortest way round the loop. */
const wrap = (v, n) => ((((v + n / 2) % n) + n) % n) - n / 2;

export default class Projects extends Page {
  constructor(opts) {
    super(opts);

    this.titles = [...this.el.querySelectorAll('.project-title')];
    this.cards  = [...this.el.querySelectorAll('.project-item')];
    this.work   = this.el.querySelector('.work');
    this.activeIndex = -1;
    this.hovering = false;

    /* One shared state per card, read by the WebGL plane every frame. */
    this.states = this.cards.map(() => ({
      cx: 0, cy: 0, w: 0, h: 0,
      scale: 1, rotX: 0, rotY: 0, rotZ: 0,
      opacity: 1, blur: 0, order: 50
    }));
    store.stack = this.states;

    this.measureStack();
    this.updateStack(true);

    this.bind();
  }

  /* ---------------------------------------------------------- stack */

  /** Reads the untransformed layout once — nothing is read while scrolling. */
  measureStack() {
    if (!this.cards.length) return;

    this.mode = store.isDesktop ? 'desktop' : store.isMobile ? 'mobile' : 'tablet';
    this.cfg = STACK[this.mode];
    this.pinned = this.mode === 'desktop';
    /* The pinned stack has no labels — the index rail names the card in focus. */
    this.el.classList.toggle('is-pinned', this.pinned);

    this.cards.forEach((card) => { card.style.transform = 'none'; });

    this.items = this.cards.map((card) => {
      const r = card.querySelector('.media-wrapper').getBoundingClientRect();
      /* Pinned boxes are already viewport-relative; flow boxes live in the document. */
      const top = this.pinned ? r.top : r.top + store.scroll;
      card.style.transformOrigin = `50% ${(r.height / 2).toFixed(1)}px`;
      return { card, cx: r.left + r.width / 2, cy: top + r.height / 2, w: r.width, h: r.height, last: '' };
    });

    const first = this.items[0];

    if (this.pinned) {
      /* Distance from the focused card's centre to its neighbour's. */
      this.pitch = first.h * (1 - this.cfg.scaleStep / 2) + this.cfg.gap;
      /* One card per pitch of scroll, so the card in focus moves with the wheel. */
      const runway = this.pitch * this.cards.length * this.cfg.cycles;
      if (this.work) this.work.style.height = `${runway + store.height}px`;
      this.app?.scroll?.setInfinite(true);
      this.app?.scroll?.resize();
    } else {
      if (this.work) this.work.style.height = '';
      this.app?.scroll?.setInfinite(false);
      const second = this.items[1];
      this.layoutPitch = second ? second.cy - first.cy : first.h * 1.4;
      this.pitch = this.layoutPitch * this.cfg.pitch;
    }

    /* Units differ between modes (cards vs px), so restart from the scroll. */
    this.rawPrev = null;
    this.target = undefined;
    this.current = undefined;
  }

  /** Scroll → position along the stack, in cards (pinned) or px (flow). */
  readScroll() {
    if (!this.pinned) return store.scroll;

    /* Lenis wraps the scroll at its limit; unwrap it so progress stays
       continuous and the loop never shows a seam. */
    const raw = store.scroll / this.pitch;
    if (this.rawPrev === null) this.rawPrev = raw;
    const limit = this.app?.scroll?.lenis?.limit;
    const span = limit ? limit / this.pitch : this.cards.length * this.cfg.cycles;

    let delta = raw - this.rawPrev;
    if (delta > span / 2) delta -= span;
    else if (delta < -span / 2) delta += span;
    this.rawPrev = raw;

    return (this.target ?? raw) + delta;
  }

  updateStack(immediate = false) {
    if (!this.items?.length) return;

    this.target = this.readScroll();
    if (immediate || this.current === undefined) {
      this.current = this.target;
    } else {
      const k = 1 - Math.pow(1 - this.cfg.smoothing, gsap.ticker.deltaRatio(60));
      this.current += (this.target - this.current) * k;
      if (Math.abs(this.target - this.current) < 1e-4) this.current = this.target;
    }

    const n = this.items.length;
    const focusY = store.height * this.cfg.focus;
    let nearest = 0;
    let nearestD = Infinity;

    this.rels ||= new Array(n);

    for (let i = 0; i < n; i++) {
      const item = this.items[i];
      const rel = this.pinned
        ? wrap(i - this.current, n)
        : (item.cy - this.current - focusY) / this.layoutPitch;

      this.rels[i] = rel;
      this.updateCard(this.states[i], item, rel, focusY);

      /* Fade out before the loop seam so the jump from top to bottom
         always happens on an invisible card. */
      if (this.pinned) this.states[i].opacity *= clamp((n / 2 - Math.abs(rel)) / 0.6, 0, 1);

      if (Math.abs(rel) < nearestD) { nearestD = Math.abs(rel); nearest = i; }
    }

    if (this.pinned) this.stackUp(focusY);
    for (let i = 0; i < n; i++) this.applyDom(this.items[i], this.states[i]);

    this.nearest = nearest;
  }

  /**
   * Pinned layout: place the cards edge to edge, `gap` px apart at their
   * actual scaled sizes, so the spacing never opens up mid-transition.
   * The two cards straddling the focus share it in proportion to `rel`,
   * which keeps every position continuous as the focus passes from one
   * card to the next.
   */
  stackUp(focusY) {
    const n = this.items.length;
    const rels = this.rels;
    const st = this.states;
    const g = this.cfg.gap;
    const span = (a, b) => (st[a].h * st[a].scale + st[b].h * st[b].scale) / 2 + g;

    const order = (this.order ||= [...Array(n).keys()]);
    order.sort((a, b) => rels[a] - rels[b]);

    /* Anchor on the last card at or above the focus. */
    const j = order.findIndex((k) => rels[k] > 0);
    let anchor;
    if (j > 0) {
      anchor = j - 1;
      const above = order[anchor];
      st[above].cy = focusY + rels[above] * span(above, order[j]);
    } else {
      /* Every card on one side of the focus (only with one or two cards). */
      anchor = j === -1 ? n - 1 : 0;
      const k = order[anchor];
      st[k].cy = focusY + rels[k] * (st[k].h + g);
    }

    for (let m = anchor - 1; m >= 0; m--) {
      st[order[m]].cy = st[order[m + 1]].cy - span(order[m], order[m + 1]);
    }
    for (let m = anchor + 1; m < n; m++) {
      st[order[m]].cy = st[order[m - 1]].cy + span(order[m - 1], order[m]);
    }
  }

  /**
   * The whole motion model: everything a card looks like is derived from
   * `rel`, its signed distance from the focus in cards (+ is below).
   */
  updateCard(s, item, rel, focusY) {
    const c = this.cfg;
    const d = Math.abs(rel);
    const ds = softAbs(rel);
    const r = clamp(rel, -3, 3);

    s.w = item.w;
    s.h = item.h;
    s.cx = item.cx + c.drift * Math.pow(ds, 1.3);

    /* In flow, spacing tightens as the cards shrink so the gaps read
       evenly. The pinned stack is laid out edge to edge in stackUp(). */
    if (!this.pinned) {
      s.cy = focusY + Math.sign(rel) * this.pitch * (d - (c.scaleStep / 2) * d * d);
    }
    s.scale = 1 - c.scaleStep * Math.min(ds, 4);
    s.opacity = ramp(c.opacity, ds);
    s.blur = ramp(c.blur, ds);
    s.rotX = c.rotX * r * DEG;
    s.rotY = (c.rotY + c.rotYStep * r) * DEG;
    s.rotZ = -c.rotZ * r * DEG;
    /* Nearest the focus draws on top; all of it stays under the index previews (60). */
    s.order = Math.max(11, 50 - Math.round(d * 10));
  }

  /** Mirrors the plane into the DOM so the label and hit area travel with it. */
  applyDom(item, s) {
    const baseY = this.pinned ? item.cy : item.cy - store.scroll;
    const tx = s.cx - item.cx;
    const ty = s.cy - baseY;
    const blur = s.blur > 0.05 ? `blur(${s.blur.toFixed(2)}px)` : 'none';
    /* CSS rotates clockwise, GL counter-clockwise. */
    const key = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) rotate(${(-s.rotZ / DEG).toFixed(3)}deg) scale(${s.scale.toFixed(4)})|${s.opacity.toFixed(3)}|${blur}|${s.order}`;
    if (key === item.last) return;
    item.last = key;

    const [transform, opacity] = key.split('|');
    const st = item.card.style;
    st.transform = transform;
    st.opacity = opacity;
    st.filter = blur;
    st.zIndex = s.order;
  }

  /* ---------------------------------------------------------- index */

  bind() {
    this.offHover = store.emitter.on('project:hover', (i) => {
      this.hovering = i !== -1;
      if (i !== -1) this.setActive(i);
      else this.syncToScroll(true);
    });

    if (!store.isTouch) {
      this.titleHandlers = this.titles.map((title, i) => {
        const over = () => {
          this.hovering = true;
          this.setActive(i);
          this.world?.media.hoverIndex(i);
        };
        const out = () => {
          this.hovering = false;
          this.world?.media.hoverIndex(-1);
          this.syncToScroll(true);
        };
        title.addEventListener('pointerenter', over);
        title.addEventListener('pointerleave', out);
        return { title, over, out };
      });
    }
  }

  setActive(index) {
    if (index === this.activeIndex) return;
    this.activeIndex = index;
    this.titles.forEach((t, i) => t.classList.toggle('is-active', i === index));
    this.world?.media.showPreview(index);
  }

  /** Whichever card is nearest the focus line stays lit. */
  syncToScroll(force = false) {
    if (store.isTouch || !this.cards.length) return;
    if (this.hovering && !force) return;
    this.setActive(this.nearest ?? -1);
  }

  /* ----------------------------------------------------------- loop */

  loop() {
    this.updateStack();
    if (!this.hovering) this.syncToScroll();
  }

  resize() {
    super.resize();
    this.measureStack();
    this.updateStack(true);
  }

  onEnter(tl) {
    const index = this.el.querySelector('.project-index');
    /* Opacity is already faded in by Page — only slide here. A `from` on
       opacity would capture the hidden 0 as its end value and keep the
       index invisible. */
    if (index) tl.fromTo(index, { x: 20 }, { x: 0, duration: 1, ease: 'power3.out' }, 0.4);
  }

  destroy() {
    super.destroy();
    if (store.stack === this.states) store.stack = null;
    this.app?.scroll?.setInfinite(false);
    this.offHover?.();
    this.titleHandlers?.forEach(({ title, over, out }) => {
      title.removeEventListener('pointerenter', over);
      title.removeEventListener('pointerleave', out);
    });
  }
}
