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
    const reveal = () => {
      section.classList.remove('is-in');
      void section.offsetWidth;
      section.classList.add('is-in');
    };
    const canvas = section.querySelector('.planet-canvas');
    const plain = () => {
      if (this.destroyed || this.io) return;
      canvas?.remove();
      this.io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) section.classList.add('is-in');
      }, { threshold: 0.3 });
      this.io.observe(section);
    };
    if (!canvas) {
      plain();
      return;
    }
    import('./PlanetShower.js').then(({ default: PlanetShower }) => {
      if (this.destroyed) return;
      if (PlanetShower.supported()) this.planets = new PlanetShower(section, canvas, { onShower: reveal });
      if (!this.planets || this.planets.dead) plain();
    }).catch(plain);
  }

  resize() { this.planets?.resize(); }

  destroy() {
    this.destroyed = true;
    this.planets?.destroy();
    this.io?.disconnect();
  }
}
