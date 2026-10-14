import gsap from 'gsap';
import Page from './Page.js';
import { clamp } from '../fx/particles.js';

/* The pinned certificates hang like pendulums from their pins. Only a
   cursor passing through one moves it: brushed along the way it's going,
   harder the further below the pin it catches the paper; then it swings
   back and forth a little and settles. */
const SWING = { stiff: 0.03, damp: 0.055, push: 0.012, max: 12 };

/** Where the segment (x0, y0)→(x1, y1) passes through the box r: the middle
    of the stretch inside it, as a fraction along the segment — or -1. */
const crossing = (x0, y0, x1, y1, r) => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const p = [-dx, dx, -dy, dy];
  const q = [x0 - r.left, r.right - x0, y0 - r.top, r.bottom - y0];
  let t0 = 0;
  let t1 = 1;
  for (let i = 0; i < 4; i++) {
    if (p[i] === 0) {
      if (q[i] < 0) return -1;
      continue;
    }
    const t = q[i] / p[i];
    if (p[i] < 0) {
      if (t > t1) return -1;
      t0 = Math.max(t0, t);
    } else {
      if (t < t0) return -1;
      t1 = Math.min(t1, t);
    }
  }
  return (t0 + t1) / 2;
};

export default class Work extends Page {
  constructor(opts) {
    super(opts);
    this.accent = this.el.dataset.accent;
    if (this.accent) this.world?.setAccent(this.accent);

    /* Hidden from the moment it's built, like the rest of the page: the
       video and the previous/next project links rise in, the certificates drop onto
       their pins (onEnter). Hidden only by the entrance, they'd show for a
       frame first. */
    const q = (s) => [...this.el.querySelectorAll(s)];
    this.film = this.el.querySelector('.work-film');
    this.certEls = q('.cert');
    this.steps = q('.project-step');
    gsap.set([this.film, ...this.steps].filter(Boolean), { opacity: 0, y: 32 });
    if (this.certEls.length) gsap.set(this.certEls, { opacity: 0, y: -24 });

    this.bindCerts();
  }

  /* ---------------------------------------------------- certificates */

  /**
   * Swing a pinned certificate when the cursor passes through it — moving
   * right swings it right — and open one whole on a click.
   */
  bindCerts() {
    this.certs = [...this.el.querySelectorAll('.cert')].map((el, i) => {
      const base = i ? 2 : -2;
      return {
        el,
        hang: el.querySelector('.cert-hang'),
        paper: el.querySelector('.cert-paper'),
        pin: el.querySelector('.cert-pin'),
        base, a: base, v: 0, shown: null
      };
    });
    if (!this.certs.length) return;

    /* The swing only runs while something's swinging: asleep once both have
       settled, woken by the next brush. */
    const wake = () => {
      if (this.certAwake) return;
      this.certAwake = true;
      gsap.ticker.add(this.certTick);
    };

    let last = null;
    this.onCertMove = (e) => {
      const x = e.clientX;
      const y = e.clientY;
      if (last) {
        for (const c of this.certs) {
          const r = c.paper.getBoundingClientRect();
          /* The whole step from the last event, so a quick flick across
             still catches it. */
          const t = crossing(last.x, last.y, x, y, r);
          if (t < 0) continue;
          const pin = c.pin.getBoundingClientRect();
          const hitY = last.y + (y - last.y) * t;
          /* A push low on the paper turns it more than one by the pin. */
          const lever = clamp((hitY - (pin.top + pin.height / 2)) / Math.max(1, r.height), 0.15, 1);
          /* Rotating the other way from the push puts the bottom where it went. */
          c.v -= clamp(x - last.x, -80, 80) * SWING.push * lever;
          wake();
        }
      }
      last = { x, y };
    };
    window.addEventListener('pointermove', this.onCertMove, { passive: true });

    this.certTick = () => {
      const dt = Math.min(gsap.ticker.deltaRatio(60), 3);
      for (const c of this.certs) {
        c.v += (-(c.a - c.base) * SWING.stiff - c.v * SWING.damp) * dt;
        c.a += c.v * dt;
        /* A flung one meets its limit softly, bouncing back a little. */
        if (Math.abs(c.a) > SWING.max) {
          c.a = Math.sign(c.a) * SWING.max;
          c.v *= -0.3;
        }
        if (c.shown === null || Math.abs(c.a - c.shown) > 0.01) {
          c.hang.style.rotate = `${c.a.toFixed(2)}deg`;
          c.shown = c.a;
        }
      }
      if (this.certs.every((c) => Math.abs(c.a - c.base) < 0.02 && Math.abs(c.v) < 0.002)) {
        this.certAwake = false;
        gsap.ticker.remove(this.certTick);
      }
    };
    wake();

    for (const c of this.certs) {
      c.hang.addEventListener('click', (e) => {
        e.preventDefault();
        this.openCert(c);
      });
    }
  }

  /** The full-screen viewer, made the first time it's needed. */
  certViewer() {
    if (this.viewer) return this.viewer;
    const el = document.createElement('div');
    el.className = 'cert-viewer';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Certificate');
    el.setAttribute('data-cursor', 'Close');
    el.innerHTML = '<button class="cert-viewer-close" type="button" aria-label="Close">&times;</button><img class="cert-viewer-img" alt="" />';
    document.body.appendChild(el);
    const img = el.querySelector('.cert-viewer-img');
    const close = el.querySelector('.cert-viewer-close');
    /* The backdrop and the button close it; the certificate itself doesn't. */
    el.addEventListener('click', (e) => {
      if (e.target !== img) this.closeCert();
    });
    this.onCertKey = (e) => {
      if (el.hidden) return;
      if (e.key === 'Escape') this.closeCert();
      /* Keep the keyboard inside while it's open: the button is all there is. */
      if (e.key === 'Tab') {
        e.preventDefault();
        close.focus();
      }
    };
    window.addEventListener('keydown', this.onCertKey);
    this.viewer = { el, img, close, open: null };
    return this.viewer;
  }

  /**
   * Lift a certificate off the board into the middle of the screen: it
   * flies from where it hangs (and how it's tilted) to upright and whole,
   * over a dimmed, blurred page that doesn't scroll until it's closed.
   */
  openCert(c) {
    const v = this.certViewer();
    if (v.open) return;
    const thumb = c.hang.querySelector('.cert-img');
    v.open = c;
    /* Its own size up front, so it's laid out (and the flight measured)
       before the image has decoded. */
    v.img.width = thumb.naturalWidth || Number(thumb.getAttribute('width')) || 1055;
    v.img.height = thumb.naturalHeight || Number(thumb.getAttribute('height')) || 1491;
    v.img.src = thumb.currentSrc || thumb.src;
    v.img.alt = thumb.alt;
    v.el.hidden = false;
    this.app?.scroll?.stop();

    const from = thumb.getBoundingClientRect();
    const to = v.img.getBoundingClientRect();
    c.hang.classList.add('is-lifted');
    gsap.killTweensOf([v.el, v.img]);
    gsap.fromTo(v.el, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' });
    gsap.fromTo(v.img, {
      x: from.left + from.width / 2 - (to.left + to.width / 2),
      y: from.top + from.height / 2 - (to.top + to.height / 2),
      scale: thumb.offsetWidth / Math.max(1, to.width),
      rotate: c.a
    }, { x: 0, y: 0, scale: 1, rotate: 0, duration: 0.75, ease: 'expo.out' });
    v.close.focus({ preventScroll: true });
  }

  /** …and back onto its pin. */
  closeCert() {
    const v = this.viewer;
    const c = v?.open;
    if (!c) return;
    v.open = null;
    const thumb = c.hang.querySelector('.cert-img');
    const from = v.img.getBoundingClientRect();
    const to = thumb.getBoundingClientRect();
    gsap.killTweensOf([v.el, v.img]);
    gsap.to(v.img, {
      x: `+=${to.left + to.width / 2 - (from.left + from.width / 2)}`,
      y: `+=${to.top + to.height / 2 - (from.top + from.height / 2)}`,
      scale: thumb.offsetWidth / Math.max(1, v.img.offsetWidth),
      rotate: c.a,
      duration: 0.55,
      ease: 'power3.inOut'
    });
    gsap.to(v.el, {
      opacity: 0,
      duration: 0.35,
      delay: 0.25,
      ease: 'power2.in',
      onStart: () => c.hang.classList.remove('is-lifted'),   // back on its pin as the copy lands
      onComplete: () => {
        v.el.hidden = true;
        this.app?.scroll?.start();
        c.hang.focus({ preventScroll: true });
      }
    });
  }

  destroy() {
    super.destroy();
    if (this.certTick) gsap.ticker.remove(this.certTick);
    this.filmIO?.disconnect();
    if (this.onCertMove) window.removeEventListener('pointermove', this.onCertMove);
    if (this.onCertKey) window.removeEventListener('keydown', this.onCertKey);
    if (this.viewer) {
      gsap.killTweensOf([this.viewer.el, this.viewer.img]);
      if (this.viewer.open) this.app?.scroll?.start();
      this.viewer.el.remove();
    }
  }

  onEnter(tl) {
    if (this.steps.length) tl.to(this.steps, { opacity: 1, y: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08 }, 0.5);

    /* The project's video, if it leads with one: rises in and plays. */
    if (this.film) {
      tl.to(this.film, { opacity: 1, y: 0, duration: 1.1, ease: 'power3.out' }, 0.3);
      this.playFilm(this.film);
    }
    /* …and the certificates either side drop onto their pins. */
    if (this.certEls.length) {
      tl.to(this.certEls, { opacity: 1, y: 0, duration: 1, ease: 'back.out(1.6)', stagger: 0.12 }, 0.55);
    }
  }

  /* The video, the certificates and the project links go with the rest
     of the page, rather than staying on until it's swapped out. */
  onLeave(tl) {
    const parts = [this.film, ...this.certEls, ...this.steps].filter(Boolean);
    if (parts.length) tl.to(parts, { opacity: 0, y: -10, duration: 0.4, ease: 'power2.in' }, 0);
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
    /* Scrolled out of sight, it pauses (no decoding nobody sees); back in,
       it carries on. */
    this.filmIO?.disconnect();
    this.filmIO = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) video.play().catch(() => {});
      else video.pause();
    });
    this.filmIO.observe(film);
  }
}
