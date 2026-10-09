import gsap from 'gsap';

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/*
 * A sheet of water spreading across the card from one point.
 *
 * The front is a distance field: a circle round the source whose radius is
 * broken up by slowly drifting lobes (so it advances unevenly, the way water
 * runs over a flat surface), smoothly joined with a second tongue that
 * reaches for the pointer. Just behind the front the water piles up into a
 * rounded rim (a capillary ridge); further in it's a thin, level film with
 * ripples running out from the source and a faint living shimmer.
 *
 * From that surface comes the light: the rim bends what's underneath like a
 * lens and catches a bright highlight, the contact line reads as a thin dark
 * edge, light gathered by the rim brightens a band behind it, and just
 * ahead of the front the dry surface looks a little damp. Under the rim you
 * still see the thumbnail (bent); behind it the thumbnail gives way to the
 * project's video.
 */
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform vec2 uSrc;
uniform float uR;
uniform vec2 uPtr;
uniform float uPR;
uniform float uTime;
uniform float uCalm;
uniform float uSeed;
uniform float uReady;
uniform float uRadius;
uniform sampler2D uVideo;
uniform vec2 uVideoSize;
uniform sampler2D uThumb;
uniform vec4 uThumbRect;
uniform vec2 uThumbSize;
uniform float uHasThumb;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0)), u.x), u.y);
}
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { s += a * noise(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}

/* Fit an image of \`size\` into a box (cover), returning uv for a point in it. */
vec2 cover(vec2 p, vec2 box, vec2 size) {
  vec2 k = box / size;
  float s = max(k.x, k.y);
  return (p / box - 0.5) * (box / (size * s)) + 0.5;
}

/* Signed distance to the water's edge, px: negative inside the water. */
float front(vec2 p) {
  vec2 q = p - uSrc;
  float d = length(q);
  vec2 dir = q / max(d, 1e-3);
  float lobes = (fbm(dir * 1.7 + vec2(uSeed, uTime * 0.22)) - 0.5) * 0.3
              + (noise(dir * 6.0 + vec2(uSeed * 2.0, uTime * 0.8)) - 0.5) * 0.06;
  float d1 = d - uR * (1.0 + lobes);
  float d2 = length(p - uPtr) - uPR;
  float k = 46.0;
  float h = clamp(0.5 + 0.5 * (d2 - d1) / k, 0.0, 1.0);
  return mix(d2, d1, h) - k * h * (1.0 - h);
}

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;   // px, from the top-left
  float f = front(p);
  float s = -f;                                // how far inside the water, px
  if (s < -16.0) discard;

  /* The outward direction of the front. */
  vec2 n = normalize(vec2(front(p + vec2(1.0, 0.0)) - f, front(p + vec2(0.0, 1.0)) - f) + 1e-6);

  /* The rim: water heaped up just behind the advancing edge. */
  float z = (s - 8.0) / 6.5;
  float ridge = exp(-z * z) * smoothstep(-1.0, 2.0, s);
  vec2 G = -n * ridge * (-2.0 * z / 6.5) * 2.0;   // slope of the surface

  /* Ripples running out from where the water started, settling once the
     card is covered, and a fine shimmer on the film. */
  vec2 q = p - uSrc;
  float d = length(q) + 1e-3;
  float amp = (1.0 - uCalm) * 0.9 + 0.06;
  float env = smoothstep(0.0, 60.0, s) * amp * exp(-d / 520.0);
  G += (q / d) * cos(d * 0.11 - uTime * 7.0) * 0.066 * env;
  vec2 nq = p / 38.0 + vec2(uTime * 0.25, -uTime * 0.18);
  float n0 = fbm(nq);
  vec2 ng = vec2(fbm(nq + vec2(0.07, 0.0)) - n0, fbm(nq + vec2(0.0, 0.07)) - n0) / 0.07;
  G += ng * 0.035 * (0.2 + 0.8 * (1.0 - uCalm)) * smoothstep(0.0, 30.0, s);

  vec3 N = normalize(vec3(-G * 2.2, 1.0));
  vec2 bend = G * 34.0;                          // refraction, px

  /* What's under the water: the thumbnail at the rim, then the video. */
  vec3 vid = texture2D(uVideo, clamp(cover(p - bend, uRes, uVideoSize), 0.001, 0.999)).rgb;
  vec3 thumb = texture2D(uThumb, clamp(cover(p - bend - uThumbRect.xy, uThumbRect.zw, uThumbSize), 0.001, 0.999)).rgb;
  thumb = mix(vid, thumb, uHasThumb);
  float reveal = smoothstep(6.0, 44.0, s) * uReady;
  vec3 under = mix(thumb, vid, reveal);

  /* The water itself: a touch cooler and darker in the rim, brighter in
     the band where the rim focuses light, a sharp highlight on top. */
  vec3 col = under * (0.95 - 0.2 * ridge) + vec3(0.02, 0.05, 0.07) * ridge;
  float caustic = exp(-pow((s - 21.0) / 7.0, 2.0)) * 0.11 * (1.0 - uCalm * 0.7);
  col += caustic;
  vec3 L = normalize(vec3(-0.45, -0.62, 0.64));
  vec3 R = reflect(-L, N);
  float spec = pow(max(R.z, 0.0), 44.0);
  float sky = pow(max(R.z, 0.0), 5.0) * 0.05;
  col += vec3(spec * 1.6 + sky);
  /* The meniscus: a thin bright line along the edge, strongest facing the light. */
  float lip = exp(-pow((s - 3.5) / 1.6, 2.0)) * (0.35 + 0.65 * max(0.0, dot(-n, normalize(L.xy))));
  col += lip * 0.35;
  /* The thin dark line where water meets the dry surface. */
  col *= 1.0 - 0.55 * exp(-pow(s / 2.2, 2.0));

  float inside = smoothstep(-0.8, 0.8, s);
  /* Just ahead of the front the surface looks damp. */
  float shade = smoothstep(-16.0, 0.0, s) * 0.16 * (1.0 - inside);

  vec2 c = abs(p - uRes * 0.5) - (uRes * 0.5 - uRadius);
  float corner = 1.0 - smoothstep(-0.5, 0.5, length(max(c, 0.0)) - uRadius);

  gl_FragColor = (vec4(col, 1.0) * inside + vec4(0.0, 0.0, 0.0, shade)) * corner;
}`;

/* How long the water takes to cover a card, and to drain back off it (s). */
const SPREAD = 2.1;
const DRAIN = 0.75;

/**
 * Hover a project card and water spreads across it from the point where
 * the pointer came in — an uneven, living front with a rim that bends the
 * thumbnail like a lens — and behind the front the thumbnail washes away
 * into the project's video, which starts playing as the water arrives.
 * Moving the pointer while it spreads draws a tongue of water after it.
 * It takes about two seconds to cross the card; once it's covered the
 * ripples settle to a clean, playing video.
 * Leave and the water drains back to where it started; the video pauses.
 *
 * One WebGL canvas covers the reel's stage and draws every wet card, so
 * sweeping across the cards is seamless. Cards name their video in
 * `data-video`; the thumbnail is the card's own image.
 */
export default class WaterReveal {
  static supported() {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  constructor(stage, cards) {
    this.stage = stage;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'water-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    stage.appendChild(this.canvas);

    const gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl || !this.build(gl)) {
      this.canvas.remove();
      this.dead = true;
      return;
    }
    this.gl = gl;
    this.canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.dead = true; this.stop(); });

    this.cards = cards
      .map((card) => ({
        card,
        media: card.querySelector('.show-card-media'),
        img: card.querySelector('.show-card-img'),
        url: card.dataset.video
      }))
      .filter((c) => c.media && c.url)
      .map((c) => ({ ...c, p: 0, target: 0, clock: 0, full: 0, seed: Math.random() * 40 }));

    this.handlers = [];
    this.cards.forEach((c) => {
      /* Positions are fractions of the card, so they hold while it grows into focus. */
      const local = (e) => {
        const r = c.media.getBoundingClientRect();
        return { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height };
      };
      const enter = (e) => this.enter(c, local(e));
      const move = (e) => { c.pointer = local(e); };
      const leave = () => { c.target = 0; c.pointer = null; };
      c.card.addEventListener('pointerenter', enter);
      c.card.addEventListener('pointermove', move);
      c.card.addEventListener('pointerleave', leave);
      this.handlers.push(() => {
        c.card.removeEventListener('pointerenter', enter);
        c.card.removeEventListener('pointermove', move);
        c.card.removeEventListener('pointerleave', leave);
      });
    });

    this.running = false;
    /* Get each thumbnail ready off the main thread while nothing's going
       on, so the first hover doesn't stall uploading a full-size photo. */
    const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
    this.cards.forEach((c) => idle(() => this.prepThumb(c)));
  }

  /**
   * The thumbnail as a bitmap no wider than the water ever needs (the card
   * is at most ~0.6k px wide, ×1.5 for the canvas's pixel ratio), decoded
   * and scaled by the browser off the main thread.
   */
  async prepThumb(c) {
    if (c.bitmap || c.prepping || this.dead || !c.img || !window.createImageBitmap) return;
    c.prepping = true;
    try {
      const img = c.img;
      if (!img.complete || !img.naturalWidth) {
        await new Promise((resolve, reject) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', reject, { once: true });
        });
      }
      /* (naturalWidth is density-corrected with srcset, so it can't say
         how many pixels there really are; the aspect ratio still holds.) */
      const w = 1024;
      c.bitmap = await createImageBitmap(c.img, {
        resizeWidth: w,
        resizeHeight: Math.round((c.img.naturalHeight * w) / c.img.naturalWidth),
        resizeQuality: 'high'
      });
    } catch { /* falls back to uploading the image itself */ }
    c.prepping = false;
  }

  build(gl) {
    const shader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('[WaterReveal]', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = shader(gl.VERTEX_SHADER, VERT);
    const fs = shader(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    this.u = {};
    ['uRes', 'uSrc', 'uR', 'uPtr', 'uPR', 'uTime', 'uCalm', 'uSeed', 'uReady', 'uRadius',
      'uVideo', 'uVideoSize', 'uThumb', 'uThumbRect', 'uThumbSize', 'uHasThumb'].forEach((n) => {
      this.u[n] = gl.getUniformLocation(prog, n);
    });
    gl.uniform1i(this.u.uVideo, 0);
    gl.uniform1i(this.u.uThumb, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.SCISSOR_TEST);
    return true;
  }

  enter(c, at) {
    if (this.dead) return;
    this.ensureVideo(c);
    this.prepThumb(c);
    /* Read once per hover, not every frame. */
    c.radius = parseFloat(getComputedStyle(c.media).borderTopLeftRadius) || 0;
    c.target = 1;
    c.pointer = at;
    /* A fresh pour starts where the pointer came in; if the water hasn't
       drained yet it simply flows back out from where it was. */
    if (c.p < 0.04) {
      c.origin = at;
      c.ptr = { ...at };
      c.clock = 0;
      c.full = 0;
      c.seed = Math.random() * 40;
    }
    this.start();
  }

  ensureVideo(c) {
    if (c.video) {
      c.video.play().catch(() => {});
      return;
    }
    const v = document.createElement('video');
    v.muted = true;
    v.loop = true;
    v.playsInline = true;
    v.preload = 'auto';
    v.src = c.url;
    v.play().catch(() => {});
    c.video = v;
    /* Upload a frame only when the video has a new one (a 30fps clip on a
       60–120Hz screen otherwise re-uploads the same frame 2–4 times). */
    if ('requestVideoFrameCallback' in v) {
      c.fresh = true;
      const onFrame = () => {
        c.fresh = true;
        if (c.video === v) v.requestVideoFrameCallback(onFrame);
      };
      v.requestVideoFrameCallback(onFrame);
    }
  }

  texture(unit) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    return t;
  }

  /* ------------------------------------------------------------- loop */

  start() {
    if (this.running || this.dead) return;
    this.running = true;
    gsap.ticker.add(this.tick);
  }

  stop() {
    this.running = false;
    gsap.ticker.remove(this.tick);
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = this.stage.clientWidth;
    const h = this.stage.clientHeight;
    if (w === this.w && h === this.h && dpr === this.dpr) return;
    this.w = w;
    this.h = h;
    this.dpr = dpr;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
  }

  tick = (time, deltaMs) => {
    const gl = this.gl;
    if (this.dead) return;
    const dt = Math.min(deltaMs / 1000, 1 / 30);
    this.resize();
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.SCISSOR_TEST);

    const box = this.stage.getBoundingClientRect();
    const dpr = this.dpr;
    let busy = false;

    for (const c of this.cards) {
      /* Spread out, or drain back. */
      const rate = c.target ? 1 / SPREAD : 1 / DRAIN;
      c.p += Math.sign(c.target - c.p) * Math.min(Math.abs(c.target - c.p), dt * rate);
      if (c.p <= 0 && c.target === 0) {
        if (c.video && !c.video.paused) c.video.pause();
        continue;
      }
      busy = true;
      c.clock += dt;
      if (c.p >= 1) c.full += dt;
      else c.full = 0;

      const r = c.media.getBoundingClientRect();
      const W = r.width;
      const H = r.height;
      const x = Math.round((r.left - box.left) * dpr);
      const y = Math.round((box.bottom - r.bottom) * dpr);
      const w = Math.round(W * dpr);
      const h = Math.round(H * dpr);
      if (x + w < 0 || x > this.canvas.width) continue;
      gl.viewport(x, y, w, h);
      gl.scissor(x, y, w, h);

      /* The front has to reach the farthest corner, lobes and all. */
      const sx = c.origin.x * W;
      const sy = c.origin.y * H;
      const reach = Math.max(Math.hypot(sx, sy), Math.hypot(W - sx, sy), Math.hypot(sx, H - sy), Math.hypot(W - sx, H - sy));
      /* A quick first gush, then a steady advance across the card. */
      const grow = c.p < 0.08 ? c.p * 1.75 : 0.14 + (c.p - 0.08) * (0.86 / 0.92);
      const R = (reach * 1.16 + 20) * grow;

      /* The tongue that follows the pointer, a little behind it. */
      const k = 1 - Math.exp(-dt * 7);
      if (c.pointer) {
        c.ptr.x += (c.pointer.x - c.ptr.x) * k;
        c.ptr.y += (c.pointer.y - c.ptr.y) * k;
      }
      const tongue = c.pointer ? Math.min(R * 0.6, reach) : 0;

      gl.uniform2f(this.u.uRes, W, H);
      gl.uniform2f(this.u.uSrc, sx, sy);
      gl.uniform1f(this.u.uR, R);
      gl.uniform2f(this.u.uPtr, c.ptr.x * W, c.ptr.y * H);
      gl.uniform1f(this.u.uPR, tongue);
      gl.uniform1f(this.u.uTime, c.clock);
      gl.uniform1f(this.u.uCalm, Math.min(1, c.full / 1.4));
      gl.uniform1f(this.u.uSeed, c.seed);
      gl.uniform1f(this.u.uRadius, c.radius || 0);

      /* The video frame. */
      const v = c.video;
      const ready = v && v.readyState >= 2 && v.videoWidth;
      c.vtex ||= this.texture(0);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, c.vtex);
      if (ready && c.fresh !== false) {
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
          if (c.fresh) c.fresh = false;
        } catch { /* a frame that can't be read yet */ }
      }
      gl.uniform1f(this.u.uReady, ready ? 1 : 0);
      gl.uniform2f(this.u.uVideoSize, ready ? v.videoWidth : 16, ready ? v.videoHeight : 9);

      /* The thumbnail, uploaded once, placed exactly where the page shows it
         (it has its own parallax transform). */
      c.ttex ||= this.texture(1);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, c.ttex);
      /* The prepared bitmap if it's there; the image itself only if it
         can't be prepared (still preparing: the water shows no thumbnail
         for a frame or two rather than stalling). */
      const thumb = c.bitmap || (!c.prepping && c.img?.complete && c.img.naturalWidth ? c.img : null);
      if (!c.thumbReady && thumb) {
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, thumb);
          c.thumbReady = true;
        } catch { /* not decodable yet */ }
      }
      if (c.thumbReady) {
        const ir = c.img.getBoundingClientRect();
        gl.uniform4f(this.u.uThumbRect, ir.left - r.left, ir.top - r.top, ir.width, ir.height);
        gl.uniform2f(this.u.uThumbSize, c.img.naturalWidth, c.img.naturalHeight);
      }
      gl.uniform1f(this.u.uHasThumb, c.thumbReady ? 1 : 0);

      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    if (!busy) this.stop();
  };

  destroy() {
    this.stop();
    this.handlers?.forEach((off) => off());
    this.cards?.forEach((c) => {
      c.bitmap?.close();
      if (c.video) {
        c.video.pause();
        c.video.removeAttribute('src');
        c.video.load();
      }
    });
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas.remove();
  }
}
