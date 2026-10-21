import gsap from 'gsap';
import store from './Store.js';

/*
 * The screen's refresh rate, and a steady 60 fps for the canvases that
 * don't need more on a phone.
 *
 * Many phones refresh at 90 or 120 Hz, and the browser runs every frame
 * callback at that rate: the sky, the planets and the floating rocks were
 * redrawn 120 times a second on such a phone — twice a 60 Hz phone's work
 * for the GPU, for motion (twinkling stars, drifting clouds, spinning
 * planets) that looks no different at 60. With that work halved, the GPU
 * has room for what does need every frame. Only on a phone, and only from
 * 100 Hz up; and always a whole number of the screen's frames apart (every
 * other one at 120 or 144 Hz), so the pace stays even. The page's
 * scrolling, and anything placed from it, still moves every frame.
 */

/* The screen's frame interval (ms): the short end of recent frame times
   (a frame that took longer was a missed frame, not the screen's rate). */
let interval = 1000 / 60;
const recent = [];
let count = 0;
gsap.ticker.add((time, delta) => {
  if (!(delta > 2 && delta < 50)) return;
  recent.push(delta);
  if (recent.length > 90) recent.shift();
  if (++count % 30 || recent.length < 30) return;
  const sorted = [...recent].sort((a, b) => a - b);
  interval = sorted[Math.floor(sorted.length * 0.25)];
});

/** Whether drawing is held to 60 fps here (a phone at 100 Hz or more). */
export const paced = () => store.isPhone && interval < 10;

/* How far apart a paced canvas's frames are (ms): a whole number of the
   screen's frames, as near 1/60 s as that allows. */
const beat = () => Math.max(1, Math.round(1000 / 60 / interval)) * interval;

/** How far apart a canvas drawn with a pacer draws (ms). */
export const drawInterval = () => (paced() ? beat() : interval);

/**
 * A pace for one canvas: call it each frame with the frame's delta (ms);
 * true when it should draw. Every frame, except on a fast phone screen,
 * where it's every so many of the screen's frames — as near 60 fps as an
 * even beat allows. (Counted in time, not frames: after a frame the page
 * missed, the next one draws at once.)
 */
export const pacer = () => {
  let due = 0;
  return (delta) => {
    if (!paced()) {
      due = 0;
      return true;
    }
    const step = beat();
    due += delta;
    if (due < step - interval / 2) return false;
    due = Math.max(-interval, Math.min(interval, due - step));
    return true;
  };
};
