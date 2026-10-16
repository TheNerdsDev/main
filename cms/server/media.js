/*
 * Turning uploads into exactly what the site expects (sizes measured from
 * the site's own frames):
 *
 *   thumbnail   featured.jpg 1600 × 1200 (the 4:3 cards) + featured-960.webp
 *   video       preview.mp4  1440 × 1080 (1080p at the cards' 4:3), H.264,
 *               30 fps, no sound, starts playing before it's fully loaded
 *               (faststart), a few MB
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
  video: { w: 1440, h: 1080, fps: 30, maxSeconds: 90 },
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
      /* HDR (a phone's recording, mostly): its colours need bringing down
         to the screen's range, or they come out washed out. */
      const hdr = /Video:[^\n]*(smpte2084|arib-std-b67)/.test(text);
      resolve({ width: Number(vid[1]), height: Number(vid[2]), seconds, hdr });
    });
  });
}

/**
 * Re-encode to the site's video: 1440 × 1080 H.264, 30 fps, no sound,
 * faststart. fit keeps the whole frame over a blurred, darkened copy of
 * itself; fill crops to 4:3. Longer than maxSeconds is cut there. An HDR
 * recording is tone-mapped to ordinary (BT.709) colour first, and every
 * video is tagged BT.709, so each browser shows the same colours.
 * onProgress gets 0..1.
 */
export async function encodeVideo(input, output, mode, seconds, onProgress, { hdr = false } = {}) {
  if (!hdr) return encode(input, output, mode, seconds, onProgress, false);
  /* An HDR file missing part of its colour description can't be tone-mapped:
     then it's converted as it is rather than not at all. */
  try {
    return await encode(input, output, mode, seconds, onProgress, true);
  } catch {
    return encode(input, output, mode, seconds, onProgress, false);
  }
}

/* (Every frame labelled as ordinary web colour, so browsers agree on it.) */
const BT709 = 'setparams=color_primaries=bt709:color_trc=bt709:colorspace=bt709:range=tv';

function encode(input, output, mode, seconds, onProgress, hdr) {
  const { w, h, fps, maxSeconds } = SIZES.video;
  const length = Math.min(seconds || maxSeconds, maxSeconds);
  const tone = hdr
    ? 'zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=mobius:param=0.3:desat=0,zscale=t=bt709:m=bt709:r=tv,format=yuv420p,'
    : '';
  const filter = mode === 'fit'
    ? `[0:v]${tone}split[src1][src2];`
      + `[src1]scale=${w / 4}:${h / 4}:force_original_aspect_ratio=increase,crop=${w / 4}:${h / 4},boxblur=10:2,scale=${w}:${h},setsar=1,eq=brightness=-0.18:saturation=0.85[bg];`
      + `[src2]scale=${w}:${h}:force_original_aspect_ratio=decrease,setsar=1[fg];`
      + `[bg][fg]overlay=(W-w)/2:(H-h)/2,fps=${fps},${BT709},format=yuv420p[v]`
    : `[0:v]${tone}scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h},setsar=1,fps=${fps},${BT709},format=yuv420p[v]`;
  const args = [
    '-hide_banner', '-y', '-i', input, '-t', String(length),
    '-filter_complex', filter, '-map', '[v]', '-an',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-profile:v', 'high',
    '-maxrate', '5000k', '-bufsize', '10000k', '-pix_fmt', 'yuv420p',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
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

/* How long a title's fade into (or out of) the app usually takes, s. */
const FADE_IN = 0.8;
const FADE_OUT = 0.6;

/** One frame at time t, tiny and grey, for telling two frames apart. */
function frameAt(file, t) {
  return new Promise((resolve) => {
    execFile(FFMPEG, ['-hide_banner', '-v', 'error', '-ss', String(Math.max(0, t)), '-i', file, '-frames:v', '1', '-vf', 'scale=64:48', '-f', 'rawvideo', '-pix_fmt', 'gray', '-'],
      { encoding: 'buffer', maxBuffer: 1 << 20, windowsHide: true }, (err, out) => resolve(err ? null : out));
  });
}

/**
 * The stretch of a converted video its card should play on hover (the
 * site's videoFrom / videoTo): past a still title screen it opens on — the
 * thumbnail already shows that — and short of the same title if it comes
 * back at the end. Found by ffmpeg's freezedetect (frames that don't change
 * for 0.6 s or more), with room for a fade either side. A still ending
 * that isn't the title (a last screen of the app) is kept a moment, then
 * it loops. { from, to } in seconds, either left out when there's nothing
 * to skip; {} when it can't tell.
 */
export async function detectStretch(file, seconds) {
  const found = await freezes(file);
  const round = (v) => Math.round(v * 10) / 10;
  const out = {};
  const opening = found.length && found[0].start <= 0.05 && found[0].end != null ? found[0] : null;
  if (opening && opening.end + FADE_IN < seconds - 3) out.from = round(opening.end + FADE_IN);
  const close = found[found.length - 1];
  if (close && close !== opening && close.start > 0.05 && (close.end == null || close.end >= seconds - 0.15)) {
    /* The title back again? (the same picture it opened on) */
    const [a, b] = opening ? await Promise.all([frameAt(file, opening.start + 0.1), frameAt(file, Math.min(seconds - 0.1, close.start + 0.3))]) : [];
    let same = false;
    if (a && b && a.length === b.length) {
      let d = 0;
      for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
      same = d / a.length < 6;
    }
    const to = same ? close.start - FADE_OUT : close.start + 1;
    if (to > (out.from || 0) + 3 && to < seconds - 0.2) out.to = round(to);
  }
  return out;
}

/** freezedetect's stills: [{ start, end }] (end null when it runs to the end). */
function freezes(file) {
  return new Promise((resolve) => {
    execFile(FFMPEG, ['-hide_banner', '-nostats', '-i', file, '-vf', 'scale=320:-2,freezedetect=n=-50dB:d=0.6', '-an', '-f', 'null', '-'],
      { maxBuffer: 1 << 24, windowsHide: true }, (err, stdout, stderr) => {
        if (err) return resolve([]);
        const text = String(stderr);
        const starts = [...text.matchAll(/freeze_start: ([\d.]+)/g)].map((m) => Number(m[1]));
        const ends = [...text.matchAll(/freeze_end: ([\d.]+)/g)].map((m) => Number(m[1]));
        resolve(starts.map((start, i) => ({ start, end: ends[i] ?? null })));
      });
  });
}
