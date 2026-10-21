import store from './Store.js';

/*
 * Every WebGL context the site makes, in one place.
 *
 * A phone gives a page only so much graphics memory, and only so many live
 * contexts; past either, the browser takes contexts away (the oldest
 * first), and whatever drew into them goes blank. So:
 *
 *  - each context is registered here (track) and logged when it's lost
 *    or given back, with what it was drawing;
 *  - one that's done with is let go at once (release): disposing a
 *    three.js renderer frees what it put on the GPU but leaves the
 *    context itself alive until the garbage collector gets to it;
 *  - the renderers a page keeps for the next visit (the thrown rock, the
 *    floating rocks, the planets) are, on a phone, only kept as far as the
 *    next page: if it doesn't take them up, they're let go (sweep).
 *
 * `live()` lists what's open, for checking.
 */

const contexts = new Map();
let serial = 0;

/** A warning in the console, for anything the visitor would otherwise only see as a blank. */
export const warn = (what, detail) => {
  console.warn(`[gpu] ${what}`, ...(detail === undefined ? [] : [detail]));
};

/**
 * Watch a canvas's context: logs its loss and return, and calls
 * onLost / onRestored. (Each caller still decides whether to take the
 * restore: preventDefault on the loss is what lets the browser give it back.)
 * Returns a function that stops watching.
 */
export const track = (name, canvas, { onLost, onRestored } = {}) => {
  const id = ++serial;
  const entry = { id, name, canvas, lost: false };
  contexts.set(id, entry);
  const lost = (e) => {
    entry.lost = true;
    warn(`WebGL context lost: ${name} (${live().length} live)`);
    onLost?.(e);
  };
  const restored = (e) => {
    entry.lost = false;
    warn(`WebGL context restored: ${name}, rebuilding`);
    onRestored?.(e);
  };
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  return () => {
    contexts.delete(id);
    canvas.removeEventListener('webglcontextlost', lost);
    canvas.removeEventListener('webglcontextrestored', restored);
  };
};

/**
 * A three.js renderer as the site uses it: without its check of each
 * shader's compile log on first use (outside development). Reading the log
 * makes the page wait for the GPU to finish everything it was given — on a
 * phone, a freeze each time a new shader is first drawn with (the loading
 * screen, the first planets). It only ever reports a broken shader, which
 * development would show first.
 */
export const lean = (renderer) => {
  renderer.debug.checkShaderErrors = !!import.meta.env.DEV;
  return renderer;
};

/** Let a three.js renderer's context go now, not whenever it's collected. */
export const release = (renderer) => {
  if (!renderer) return;
  try {
    renderer.dispose();
    if (!renderer.getContext().isContextLost()) renderer.forceContextLoss();
  } catch { /* already gone */ }
};

/** What's open: [{ name, lost }]. */
export const live = () => [...contexts.values()].map(({ name, lost }) => ({ name, lost }));

/* Kept renderers: the function that lets each go → the page change it was kept in. */
const keepers = new Map();
let turn = 0;

/**
 * A renderer kept for the next page. `drop` lets it go; the returned
 * function is called by whoever takes it up again (so it isn't dropped).
 */
export const keep = (drop) => {
  keepers.set(drop, turn);
  return () => keepers.delete(drop);
};

/**
 * A page change is under way (App.transition): returns a function that, on
 * a phone, lets go of whatever was kept during it and still hasn't been
 * taken up — kept, it would sit on the GPU through every page without one,
 * crowding out the contexts that are drawing. (Called a while after the
 * next page is up — a quick trip back finds them still there — and some of
 * its parts, the planets, arrive a moment late anyway. Anything kept in a
 * later change is left for that change to settle.)
 */
export const changing = () => {
  const mine = ++turn;
  return () => {
    if (!store.isPhone) return;
    keepers.forEach((at, drop) => {
      if (at > mine) return;
      keepers.delete(drop);
      try { drop(); } catch { /* already gone */ }
    });
  };
};

export default { warn, track, lean, release, live, keep, changing };
