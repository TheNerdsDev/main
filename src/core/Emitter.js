/** Minimal pub/sub. */
export default class Emitter {
  constructor() { this.map = new Map(); }
  on(event, cb) {
    if (!this.map.has(event)) this.map.set(event, new Set());
    this.map.get(event).add(cb);
    return () => this.off(event, cb);
  }
  off(event, cb) { this.map.get(event)?.delete(cb); }
  once(event, cb) {
    const un = this.on(event, (...a) => { un(); cb(...a); });
    return un;
  }
  emit(event, ...args) {
    this.map.get(event)?.forEach((cb) => cb(...args));
  }
}
