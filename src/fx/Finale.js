/**
 * The closing "Ready for liftoff?" screen, on any page that ends with one
 * (the welcome page, About): a planet shower each time it scrolls into
 * view (from above), the heading and button arriving with it. Without
 * WebGL2 (or with reduced motion) the text simply shows as it comes in.
 *
 * The planets' code (their three.js scene and physics) is a chunk of its
 * own, fetched here — only the pages that end with them download it.
 */
export default class Finale {
  constructor(section) {
    this.section = section;
    /* The planets bring the heading in with them each time they fall… */
    const reveal = () => {
      /* (…unless it has come in already, waiting for them: see `early`.) */
      if (this.textEarly) {
        this.textEarly = false;
        return;
      }
      section.classList.remove('is-in');
      void section.offsetWidth;
      section.classList.add('is-in');
    };
    /* …but never waits on them. Their maps (~1.7 MB on a phone) may still
       be on their way the first time the section comes into view on a
       slow connection: the heading, text and button come in at once then,
       and the planets fall in when they're ready, without replaying it. */
    this.early = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      if (this.planets && !this.planets.dead && this.planets.scene?.warmed) return;
      if (section.classList.contains('is-in')) return;
      section.classList.add('is-in');
      this.textEarly = true;
    }, { threshold: 0.3 });
    this.early.observe(section);
    const canvas = section.querySelector('.planet-canvas');
    const plain = () => {
      if (this.destroyed || this.io) return;
      /* (Looked up again: the planets may have swapped in a canvas of their own.) */
      section.querySelector('.planet-canvas')?.remove();
      this.io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) section.classList.add('is-in');
      }, { threshold: 0.3 });
      this.io.observe(section);
    };
    if (!canvas) {
      plain();
      return;
    }
    import('./PlanetShower.js')
      .then(({ default: PlanetShower }) => {
        if (this.destroyed) return;
        if (PlanetShower.supported()) this.planets = new PlanetShower(section, canvas, { onShower: reveal });
        if (!this.planets || this.planets.dead) plain();
      })
      .catch((err) => {
        console.warn('[gpu] planets: their code failed to load, showing the text alone', err);
        plain();
      });
  }

  resize() { this.planets?.resize(); }

  destroy() {
    this.destroyed = true;
    this.planets?.destroy();
    this.io?.disconnect();
    this.early.disconnect();
  }
}
