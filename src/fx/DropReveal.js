import gsap from 'gsap';

/* Most water drops (and splash beads) alive on one card at once. */
const MAX_DROPS = 40;
/* Most recent impacts still sending out ripples. */
const MAX_RIPPLES = 6;

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

/*
 * Water on a sheet. The drops are metaballs, so beads that touch flow into
 * one bigger bead. From the field comes a height (a spherical cap for a
 * lone drop: tall in the middle, steep at the contact line) and from that
 * a surface normal, which drives everything that makes it read as water:
 *
 *  - refraction: the video under a drop is seen through it as a lens
 *  - a sharp specular highlight and a soft sky reflection
 *  - a dark rim where the surface turns steep (light bends away)
 *  - a caustic glow on the far side, and a soft shadow on the sheet
 *  - ripples running out from each fresh impact
 *
 * Under the water the project's video shows; elsewhere the card is left
 * as it is (only shadows and ripples are drawn over it).
 */
const FRAG = `
precision highp float;
varying vec2 vUv;
uniform vec2 uRes;
uniform vec3 uDrops[${MAX_DROPS}];
uniform int uCount;
uniform vec3 uRipples[${MAX_RIPPLES}];
uniform float uFill;
uniform float uReady;
uniform float uRadius;
uniform sampler2D uVideo;
uniform vec2 uVideoSize;

const vec3 L = vec3(-0.45, -0.62, 0.64);   // light from the top left (y down)

float field(vec2 p, out vec2 g) {
  float v = 0.0;
  g = vec2(0.0);
  for (int i = 0; i < ${MAX_DROPS}; i++) {
    if (i >= uCount) break;
    vec3 d = uDrops[i];
    vec2 q = p - d.xy;
    float dd = dot(q, q) + 1.0;
    float r2 = d.z * d.z;
    v += r2 / dd;
    g += r2 * q / (dd * dd);
  }
  return v + uFill * 3.0;
}

vec3 video(vec2 p) {
  vec2 k = uRes / uVideoSize;
  float s = max(k.x, k.y);
  vec2 uv = (p / uRes - 0.5) * (uRes / (uVideoSize * s)) + 0.5;
  return texture2D(uVideo, clamp(uv, 0.001, 0.999)).rgb;
}

void main() {
  vec2 p = vec2(vUv.x, 1.0 - vUv.y) * uRes;   // px, from the top-left

  /* Ripples from fresh impacts: a travelling ring that fades as it spreads. */
  float wave = 0.0;
  vec2 wgrad = vec2(0.0);
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec3 r = uRipples[i];
    if (r.z <= 0.0 || r.z > 1.4) continue;
    vec2 q = p - r.xy;
    float d = length(q) + 1e-3;
    float front = r.z * 380.0;
    float x = d - front;
    float env = exp(-x * x / 260.0) * exp(-r.z * 2.6);
    wave += sin(x * 0.32) * env;
    wgrad += (q / d) * cos(x * 0.32) * 0.32 * env;
  }

  vec2 g;
  float v = field(p, g);
  float gm = length(g);

  /* Height of the water: 0 at the contact line, 1 at a drop's crown. */
  float hh = 1.0 - 1.0 / max(v, 1e-4);
  float h = sqrt(max(hh, 0.0));
  vec2 slope = (-g / (v * v * max(h, 0.06))) * 15.0 + wgrad * 0.35;
  slope *= 1.0 - smoothstep(1.6, 3.4, v);         // a flooded sheet lies flat
  vec3 N = normalize(vec3(-slope, 1.0));

  /* Anti-aliased water mask from the field and how fast it changes. */
  float aa = max(2.0 * gm * 1.2, 1e-3);
  float water = smoothstep(1.0 - aa, 1.0 + aa, v);

  /* Through the water: the video, bent by the drop like a lens. */
  vec3 under = video(p - slope * 13.0);
  float lit = 0.9 + 0.22 * dot(N, normalize(L));
  vec3 col = under * lit;
  /* Light leaks out at the steep rim, so it reads dark. */
  float rim = 1.0 - smoothstep(0.0, 0.32, h);
  col *= 1.0 - 0.62 * rim * (1.0 - uFill);
  /* Light gathered by the drop lands on its far side. */
  float caustic = max(0.0, dot(normalize(slope + 1e-5), normalize(-L.xy))) * smoothstep(0.08, 0.5, h) * (1.0 - h);
  col += vec3(1.0, 0.98, 0.94) * caustic * 0.28 * (1.0 - uFill);
  /* A sharp highlight, plus a broad sheen of sky. */
  vec3 R = reflect(-normalize(L), N);
  float spec = pow(max(R.z, 0.0), 90.0);
  float sheen = pow(max(R.z, 0.0), 6.0) * 0.08;
  col += vec3(spec * 1.4 + sheen);
  col += wave * 0.05;

  /* No video yet: the water is clear, only its light and rim show. */
  float aIn = mix(clamp(spec * 1.4 + sheen + rim * 0.5, 0.0, 1.0), 1.0, uReady);
  vec3 cIn = mix(vec3(spec * 1.4 + sheen), col, uReady);

  /* On the dry sheet: the drops' shadow, a damp ring, the ripples. */
  vec2 g2;
  float vs = field(p - vec2(5.0, 7.0), g2);
  float shadow = smoothstep(0.55, 1.05, vs) * 0.32;
  float damp = smoothstep(0.55, 0.98, v) * 0.12;
  float dark = max(shadow, damp) + max(-wave, 0.0) * 0.16;
  float light = max(wave, 0.0) * 0.12;
  vec4 outside = vec4(vec3(light), dark + light);

  /* The card's rounded corners. */
  vec2 c = abs(p - uRes * 0.5) - (uRes * 0.5 - uRadius);
  float corner = 1.0 - smoothstep(-0.5, 0.5, length(max(c, 0.0)) - uRadius);

  vec4 inside = vec4(cIn * aIn, aIn);
  gl_FragColor = mix(outside, inside, water) * corner;
}`;

const rand = (a, b) => a + Math.random() * (b - a);

/**
 * Hover a project card and water drops fall on it. Each lands with a splat
 * and a wobble, flicks out a few beads and sends a ripple across the sheet
 * — and where it lies, the project's video shows through it. More drops
 * keep falling (where the pointer goes, and into the dry gaps), beads run
 * together, and in about two seconds the water has taken the whole card.
 * Leave and the water dries back; the video pauses.
 *
 * One WebGL canvas covers the reel's stage and draws every wet card, so
 * sweeping across the cards is seamless. Cards name their video in
 * `data-video`.
 */
export default class DropReveal {
  static supported() {
    return window.matchMedia('(hover: hover) and (pointer: fine)').matches
      && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  constructor(stage, cards) {
    this.stage = stage;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'drop-canvas';
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
      .map((card) => ({ card, media: card.querySelector('.show-card-media'), src: card.dataset.video }))
      .filter((c) => c.media && c.src)
      .map((c) => ({ ...c, drops: [], ripples: [], k: 0, target: 0, clock: 0, tex: null }));

    this.handlers = [];
    this.cards.forEach((c) => {
      /* Positions are kept as fractions of the card, so they stay put while
         the card grows into focus. */
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

    this.dropData = new Float32Array(MAX_DROPS * 3);
    this.rippleData = new Float32Array(MAX_RIPPLES * 3);
    this.running = false;
  }

  build(gl) {
    const shader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('[DropReveal]', gl.getShaderInfoLog(s));
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
    ['uRes', 'uDrops', 'uCount', 'uRipples', 'uFill', 'uReady', 'uRadius', 'uVideo', 'uVideoSize'].forEach((n) => {
      this.u[n] = gl.getUniformLocation(prog, n);
    });
    gl.uniform1i(this.u.uVideo, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.enable(gl.SCISSOR_TEST);
    return true;
  }

  /* ------------------------------------------------------------ drops */

  /**
   * A drop lands at (x, y) (fractions of the card), size `r` (fraction of
   * the card's width). It flicks out a few beads and starts a ripple.
   */
  land(c, x, y, r) {
    const room = MAX_DROPS - c.drops.length;
    if (room < 1) return;
    c.drops.push({ x, y, r, t: c.clock, main: true });
    const beads = Math.min(room - 1, Math.round(rand(2, 5)));
    for (let i = 0; i < beads; i++) {
      const a = rand(0, Math.PI * 2);
      const d = r * rand(1.25, 2.1);
      c.drops.push({ x: x + Math.cos(a) * d, y: y + (Math.sin(a) * d * c.aspect), r: r * rand(0.06, 0.16), t: c.clock + 0.03, main: false });
    }
    c.ripples.unshift({ x, y, t: c.clock });
    c.ripples.length = Math.min(c.ripples.length, MAX_RIPPLES);
    c.lastDrop = { x, y, t: c.clock };
  }

  /** How wet the card already is at (x, y) — to aim new drops at dry spots. */
  wetness(c, x, y) {
    let v = 0;
    for (const d of c.drops) {
      const dx = x - d.x;
      const dy = (y - d.y) / c.aspect;
      v += (d.r * d.r) / (dx * dx + dy * dy + 1e-5);
    }
    return v;
  }

  enter(c, at) {
    if (this.dead) return;
    this.ensureVideo(c);
    c.target = 1;
    c.pointer = at;
    const r = c.media.getBoundingClientRect();
    c.aspect = r.width / Math.max(1, r.height);
    if (c.k < 0.05) {
      c.drops = [];
      c.ripples = [];
      c.clock = 0;
      c.next = 0.12;
      c.falls = 0;
      this.land(c, at.x, at.y, rand(0.1, 0.12));
    }
    this.start();
  }

  /* Keep the rain coming while the pointer is on the card. */
  rain(c) {
    if (c.clock < c.next || c.falls > 24) return;
    c.falls++;
    c.next = c.clock + rand(0.07, 0.14);
    const p = c.pointer;
    let x;
    let y;
    if (p && Math.hypot(p.x - c.lastDrop.x, p.y - c.lastDrop.y) > 0.12 && Math.random() < 0.7) {
      /* Where the pointer has moved to. */
      x = p.x + rand(-0.04, 0.04);
      y = p.y + rand(-0.04, 0.04);
    } else {
      /* Into the driest of a few spots, so the water spreads over the card. */
      let best = Infinity;
      for (let i = 0; i < 8; i++) {
        const cx = rand(0.06, 0.94);
        const cy = rand(0.08, 0.92);
        const w = this.wetness(c, cx, cy);
        if (w < best) { best = w; x = cx; y = cy; }
      }
    }
    this.land(c, x, y, rand(0.055, 0.1));
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
    v.src = c.src;
    v.play().catch(() => {});
    c.video = v;
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
      /* Wets quickly, dries a little slower. */
      const speed = c.target > c.k ? 4 : 1.8;
      c.k += Math.sign(c.target - c.k) * Math.min(Math.abs(c.target - c.k), dt * speed);
      if (c.k <= 0 && c.target === 0) {
        if (c.drops.length) {
          c.drops = [];
          c.ripples = [];
          c.video?.pause();
        }
        continue;
      }
      busy = true;
      if (c.target) {
        c.clock += dt;
        this.rain(c);
      }

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

      /* Each drop: a fast splat that overshoots and wobbles, then a slow
         creep outwards as it soaks in. Everything dries back together. */
      const dry = c.k * c.k * (3 - 2 * c.k);
      let n = 0;
      for (const d of c.drops) {
        const a = c.clock - d.t;
        if (a <= 0) continue;
        const splat = (1 - Math.exp(-a * 22)) * (1 + 0.2 * Math.exp(-a * 6) * Math.sin(a * 30));
        const creep = d.main ? 1 + 0.22 * (1 - Math.exp(-a * 1.1)) : 1;
        this.dropData[n * 3] = d.x * W;
        this.dropData[n * 3 + 1] = d.y * H;
        this.dropData[n * 3 + 2] = d.r * W * splat * creep * dry;
        n++;
      }
      for (let i = 0; i < MAX_RIPPLES; i++) {
        const rp = c.ripples[i];
        this.rippleData[i * 3] = rp ? rp.x * W : 0;
        this.rippleData[i * 3 + 1] = rp ? rp.y * H : 0;
        this.rippleData[i * 3 + 2] = rp ? (c.clock - rp.t) * (c.target ? 1 : 0) : 0;
      }
      /* After the shower, the beads run together into one sheet. */
      const flood = Math.min(1, Math.max(0, (c.clock - 1.5) / 0.75));

      gl.uniform3fv(this.u.uDrops, this.dropData);
      gl.uniform1i(this.u.uCount, n);
      gl.uniform3fv(this.u.uRipples, this.rippleData);
      gl.uniform2f(this.u.uRes, W, H);
      /* Drying, the sheet breaks back into beads before they shrink away. */
      gl.uniform1f(this.u.uFill, flood * flood * (3 - 2 * flood) * dry * dry * dry);
      gl.uniform1f(this.u.uRadius, parseFloat(getComputedStyle(c.media).borderTopLeftRadius) || 0);

      /* Upload the current video frame. */
      const v = c.video;
      const ready = v && v.readyState >= 2 && v.videoWidth;
      gl.activeTexture(gl.TEXTURE0);
      if (!c.tex) {
        c.tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, c.tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
      }
      gl.bindTexture(gl.TEXTURE_2D, c.tex);
      if (ready) {
        try {
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
        } catch { /* a frame that can't be read yet */ }
      }
      gl.uniform1f(this.u.uReady, ready ? 1 : 0);
      gl.uniform2f(this.u.uVideoSize, ready ? v.videoWidth : 16, ready ? v.videoHeight : 9);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    if (!busy) this.stop();
  };

  destroy() {
    this.stop();
    this.handlers?.forEach((off) => off());
    this.cards?.forEach((c) => {
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
