import store from './Store.js';

/**
 * Base for anything bound to a DOM element.
 * Mirrors the element's box into the GL world via `bounds`.
 */
export default class Component {
  constructor({ el } = {}) {
    this.el = el;
    this.destroyed = false;
    this.isVisible = false;
    if (this.el) this.getBounds();
  }

  getBounds() {
    if (!this.el) return;
    const r = this.el.getBoundingClientRect();
    this.bounds = {
      top: r.top + store.scroll,
      left: r.left,
      width: r.width,
      height: r.height
    };
    return this.bounds;
  }

  /** Is the element within `margin` px of the viewport? */
  checkVisible(margin = 300) {
    if (!this.bounds) return false;
    const top = this.bounds.top - store.scroll;
    this.isVisible = top < store.height + margin && top + this.bounds.height > -margin;
    return this.isVisible;
  }

  resize() { this.getBounds(); }
  loop() {}
  destroy() { this.destroyed = true; }
}
