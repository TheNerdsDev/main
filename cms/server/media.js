/*
 * Turning uploads into exactly what the site expects (sizes measured from
 * the site's own frames):
 *
 *   thumbnail   featured.jpg 1600 × 1200 (the 4:3 cards) + featured-960.webp
 *   video       preview.mp4  1200 × 900, H.264, 25 fps, no sound, starts
 *               playing before it's fully loaded (faststart), ~1 MB
 *   shots       01 is wide (2.1 : 1, 1600 × 762), the rest 1.62 : 1
 *               (1200 × 741) — as NN.webp, with NN.jpg beside it
 *
 * Pictures are fitted one of two ways:
 *   fit   kept whole, on a dark backdrop with room round it (the site's
 *         hover zoom then only ever crops backdrop) — for screenshots
 *   fill  cropped to fill the frame — for photos and designed images
 */
import sharp from 'sharp';
import { execFile, spawn } from 'node:child_process';

/* No cache: it keeps files open, and Windows won't move or delete an
   open file (an upload is moved into place right after it's read). */
sharp.cache(false);

export const SIZES = {
  thumb: { w: 1600, h: 1200, small: 960 },
  video: { w: 1200, h: 900, fps: 25, maxSeconds: 90 },
  wide: { w: 1600, h: 762 },
  shot: { w: 1200, h: 741 }
};

export const IMAGE_TYPES = ['jpeg', 'png', 'webp', 'avif', 'tiff', 'gif'];
export const VIDEO_EXT = ['mp4', 'mov', 'm4v', 'webm', 'mkv', 'avi'];

/* ---------------------------------------------------------- pictures */

/** What sharp makes of a file — or a plain-words error. */
export async function inspectImage(file) {
  let meta;
  try {
    meta = await sharp(file, { animated: false }).metadata();
  } catch {
    throw Object.assign(new Error('That file isn’t a picture this can read. Use PNG, JPG or WebP.'), { status: 415 });
  }
  if (!IMAGE_TYPES.includes(meta.format)) {
    throw Object.assign(new Error(`${meta.format?.toUpperCase() || 'That'} pictures aren’t supported. Use PNG, JPG or WebP.`), { status: 415 });
  }
  const turned = meta.orientation >= 5;
  return { width: turned ? meta.height : meta.width, height: turned ? meta.width : meta.height, format: meta.format };
}

/** The average colour round a picture's edge, for its backdrop. */
async function edgeColour(input) {
  const { data, info } = await sharp(input).rotate().resize(48, 48, { fit: 'fill' }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const px = (x, y) => (y * info.width + x) * info.channels;
  const sum = [0, 0, 0];
  let n = 0;
  for (let y = 0; y < info.height; y++) {
    for (let x = 0; x < info.width; x++) {
      if (x > 2 && x < info.width - 3 && y > 2 && y < info.height - 3) continue;
      const i = px(x, y);
      sum[0] += data[i]; sum[1] += data[i + 1]; sum[2] += data[i + 2];
      n++;
    }
  }
  return sum.map((v) => v / n);
}

const rgb = (c) => `rgb(${c.map((v) => Math.round(Math.max(0, Math.min(255, v)))).join(',')})`;

/**
 * The picture whole, centred on a backdrop of its own edge colour (lighter
 * in the middle), with a soft shadow and slightly rounded corners — the
 * look of the TaskPilot shots.
 */
async function fitOnBackdrop(input, W, H) {
  const MARGIN = 0.065;
  const meta = await sharp(input).rotate().metadata();
  const sw = meta.orientation >= 5 ? meta.height : meta.width;
  const sh = meta.orientation >= 5 ? meta.width : meta.height;
  const scale = Math.min((W * (1 - 2 * MARGIN)) / sw, (H * (1 - 2 * MARGIN)) / sh);
  const cw = Math.round(sw * scale);
  const ch = Math.round(sh * scale);
  const x = Math.round((W - cw) / 2);
  const y = Math.round((H - ch) / 2);
  const r = Math.max(4, Math.round(cw * 0.011));

  const edge = await edgeColour(input);
  /* Dark, but tinted like the picture: brighter in the middle. */
  const mid = edge.map((v) => v * 0.9 + 8);
  const out = edge.map((v) => v * 0.3 + 2);
  const backdrop = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><radialGradient id="g" cx="50%" cy="50%" r="72%"><stop offset="0" stop-color="${rgb(mid)}"/><stop offset="1" stop-color="${rgb(out)}"/></radialGradient></defs>
    <rect width="100%" height="100%" fill="url(#g)"/></svg>`);
  const blur = Math.round(W * 0.018);
  const shadow = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs><filter id="b" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs>
    <rect x="${x}" y="${y + Math.round(ch * 0.015)}" width="${cw}" height="${ch}" rx="${r}" fill="#000" fill-opacity="0.7" filter="url(#b)"/></svg>`);
  const corners = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${ch}"><rect width="${cw}" height="${ch}" rx="${r}" fill="#fff"/></svg>`);
  const picture = await sharp(input).rotate().resize(cw, ch, { fit: 'fill' }).ensureAlpha()
    .composite([{ input: corners, blend: 'dest-in' }]).png().toBuffer();
  const rim = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect x="${x + 0.5}" y="${y + 0.5}" width="${cw - 1}" height="${ch - 1}" rx="${r}" fill="none" stroke="#fff" stroke-opacity="0.07"/></svg>`);

  return sharp(backdrop)
    .composite([{ input: shadow }, { input: picture, left: x, top: y }, { input: rim }])
    .flatten()
    .toBuffer();
}

/** The picture fitted to W × H the chosen way, as a lossless buffer. */
export async function fitPicture(input, W, H, mode) {
  if (mode === 'fit') return sharp(await fitOnBackdrop(input, W, H)).png().toBuffer();
  return sharp(input).rotate().resize(W, H, { fit: 'cover', position: 'attention' }).flatten({ background: '#05060f' }).png().toBuffer();
}

/** A detail shot, at its slot's shape: NN.webp + NN.jpg. */
export async function writeShot(input, base, wide, mode) {
  const { w, h } = wide ? SIZES.wide : SIZES.shot;
  const png = await fitPicture(input, w, h, mode);
  await sharp(png).webp({ quality: 86, effort: 5 }).toFile(`${base}.webp`);
  await sharp(png).jpeg({ quality: 86, mozjpeg: true }).toFile(`${base}.jpg`);
}

/** The thumbnail: featured.jpg and the smaller featured-960.webp. */
export async function writeThumb(input, dir, mode) {
  const { w, h, small } = SIZES.thumb;
  const png = await fitPicture(input, w, h, mode);
  await sharp(png).jpeg({ quality: 86, mozjpeg: true }).toFile(`${dir}/featured.jpg`);
  await sharp(png).resize(small, Math.round((small * h) / w)).webp({ quality: 82, effort: 5 }).toFile(`${dir}/featured-960.webp`);
}

/* ------------------------------------------------------------ video */

const FFMPEG = process.env.FFMPEG || 'ffmpeg';

/** Whether ffmpeg is here at all (videos need it). */
export function ffmpegVersion() {
  return new Promise((resolve) => {
    execFile(FFMPEG, ['-hide_banner', '-version'], (err, out) => resolve(err ? null : out.split('\n')[0].trim()));
  });
}

/** Length and size of a video, from ffmpeg's own report. */
export function inspectVideo(file) {
  return new Promise((resolve, reject) => {
    execFile(FFMPEG, ['-hide_banner', '-i', file], (err, stdout, stderr) => {
      const text = String(stderr);
      const dur = text.match(/Duration:\s*(\d+):(\d+):([\d.]+)/);
      const vid = text.match(/Stream #[^\n]*Video:[^\n]*?(\d{2,5})x(\d{2,5})/);
      if (!vid) return reject(Object.assign(new Error('That file has no video in it this can read. Use MP4, MOV or WebM.'), { status: 415 }));
      const seconds = dur ? Number(dur[1]) * 3600 + Number(dur[2]) * 60 + Number(dur[3]) : 0;
      /* (A still picture reads as a "video" with no length.) */
      if (seconds < 0.5) return reject(Object.assign(new Error('That isn’t a video — it has no length. Use MP4, MOV or WebM.'), { status: 415 }));
      resolve({ width: Number(vid[1]), height: Number(vid[2]), seconds });
    });
  });
}

/**
 * Re-encode to the site's video: 1200 × 900 H.264, 25 fps, no sound,
 * faststart. fit keeps the whole frame over a blurred, darkened copy of
 * itself; fill crops to 4:3. Longer than maxSeconds is cut there.
 * onProgress gets 0..1.
 */
export function encodeVideo(input, output, mode, seconds, onProgress) {
  const { w, h, fps, maxSeconds } = SIZES.video;
  const length = Math.min(seconds || maxSeconds, maxSeconds);
  const filter = mode === 'fit'
    ? `[0:v]scale=${w / 4}:${h / 4}:force_original_aspect_ratio=increase,crop=${w / 4}:${h / 4},boxblur=10:2,scale=${w}:${h},setsar=1,eq=brightness=-0.18:saturation=0.85[bg];`
      + `[0:v]scale=${w}:${h}:force_original_aspect_ratio=decrease,setsar=1[fg];`
      + `[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=${fps},format=yuv420p[v]`
    : `[0:v]scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=${fps},format=yuv420p[v]`;
  const args = [
    '-hide_banner', '-y', '-i', input, '-t', String(length),
    '-filter_complex', filter, '-map', '[v]', '-an',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '27', '-profile:v', 'high',
    '-maxrate', '1200k', '-bufsize', '2400k', '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', output
  ];
  return new Promise((resolve, reject) => {
    const run = spawn(FFMPEG, args, { windowsHide: true });
    let err = '';
    run.stdout.on('data', (chunk) => {
      const m = String(chunk).match(/out_time_us=(\d+)/g);
      if (m && length) onProgress?.(Math.min(0.99, Number(m[m.length - 1].split('=')[1]) / 1e6 / length));
    });
    run.stderr.on('data', (chunk) => { err = (err + chunk).slice(-4000); });
    run.on('error', () => reject(new Error('ffmpeg isn’t installed, so videos can’t be converted. Install it with: winget install Gyan.FFmpeg')));
    run.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`The video couldn’t be converted. ${err.split('\n').filter(Boolean).slice(-2).join(' ')}`))));
  });
}
