import { TextureLoader, Texture, LinearFilter, SRGBColorSpace, RepeatWrapping } from 'three';

/** Shared texture cache. Every mesh pulls from here so nothing decodes twice. */
class Assets {
  constructor() {
    this.loader = new TextureLoader();
    this.loader.setCrossOrigin('anonymous');
    this.cache = new Map();
    this.pending = new Map();
    this.renderer = null;
  }

  setRenderer(renderer) { this.renderer = renderer; }

  has(url) { return this.cache.has(url); }
  get(url) { return this.cache.get(url) || null; }

  configure(texture, { srgb = true, wrap = false } = {}) {
    texture.generateMipmaps = false;
    texture.minFilter = LinearFilter;
    texture.magFilter = LinearFilter;
    if (srgb) texture.colorSpace = SRGBColorSpace;
    if (wrap) { texture.wrapS = RepeatWrapping; texture.wrapT = RepeatWrapping; }
    texture.needsUpdate = true;
    return texture;
  }

  load(url, opts = {}) {
    if (!url) return Promise.resolve(null);

    const hit = this.cache.get(url);
    if (hit) return Promise.resolve(hit);

    const inFlight = this.pending.get(url);
    if (inFlight) return inFlight;

    const promise = new Promise((resolve) => {
      this.loader.load(
        url,
        (texture) => {
          this.configure(texture, opts);
          const entry = {
            texture,
            width: texture.image?.width || 1,
            height: texture.image?.height || 1
          };
          this.cache.set(url, entry);
          try { this.renderer?.initTexture(texture); } catch { /* non-fatal */ }
          resolve(entry);
        },
        undefined,
        () => {
          /* Never let a missing file stall the loader — hand back a 1px stand-in. */
          const fallback = new Texture();
          this.configure(fallback, opts);
          const entry = { texture: fallback, width: 1, height: 1, failed: true };
          this.cache.set(url, entry);
          resolve(entry);
        }
      );
    });

    this.pending.set(url, promise);
    promise.then(() => this.pending.delete(url));
    return promise;
  }

  /** Every media source referenced by the current document. */
  collectFromDOM(root = document) {
    const urls = new Set();
    root.querySelectorAll('[data-media] .media').forEach((img) => {
      const src = img.getAttribute('src');
      if (src) urls.add(src);
    });
    return [...urls];
  }
}

export default new Assets();
