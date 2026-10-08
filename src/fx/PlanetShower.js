import gsap from 'gsap';

/*
 * The finale: a shower of tiny planets.
 *
 * As the closing section scrolls in, a shower of miniature solar-system
 * bodies pours in from its top edge — the seam with the work reel above —
 * falls under gravity, bounces, rolls and piles up along the bottom. Drag
 * the pointer through the pile and the bodies near it get shoved the way
 * you're moving. Scroll back up and the pile stays exactly as it is; leave
 * the section altogether and come back down, and a fresh shower falls.
 *
 * Physics: circles with gravity, air drag, restitution and friction,
 * resolved against each other, the floor and the walls a few times a step,
 * so they stack like real objects. Rendering: one instanced quad per body
 * in WebGL2; each is drawn as a lit sphere with its own procedural surface.
 */

/* Body types (shader indices). */
const SUN = 0, MERCURY = 1, VENUS = 2, EARTH = 3, MOON = 4, MARS = 5, JUPITER = 6, SATURN = 7, URANUS = 8, NEPTUNE = 9;

/* Radius at a 1280px-wide section, and how many fall. The real ratios are
   far too extreme (the Sun is 109 Earths across), so the scale is squeezed:
   the order holds — Sun, then the giants, then the rocky worlds — without
   anything getting too big. */
const BODIES = [
  [SUN, 56, 3],
  [JUPITER, 42, 6],
  [SATURN, 35, 4],
  [URANUS, 26, 6],
  [NEPTUNE, 25, 6],
  [EARTH, 19, 13],
  [VENUS, 18, 11],
  [MARS, 13, 17],
  [MERCURY, 9.5, 20],
  [MOON, 8, 22]
];

const GRAVITY = 2300;   // px/s²
const SHOWER = 2.1;     // seconds over which the bodies are let go

const VERT = `#version 300 es
in vec2 aCorner;
in vec4 iA;   // x, y, radius, type
in vec2 iB;   // roll angle, seed
uniform vec2 uRes;
out vec2 vQ;
out float vType;
out float vRot;
out float vSeed;
void main() {
  float t = iA.w;
  /* Room around the sphere: Saturn's rings, the Sun's glow, a contact shadow. */
  float k = (t > 6.5 && t < 7.5) ? 2.3 : (t < 0.5 ? 1.9 : 1.3);
  vec2 pos = iA.xy + aCorner * iA.z * k;
  vQ = aCorner * k;
  vType = t;
  vRot = iB.x;
  vSeed = iB.y;
  gl_Position = vec4(pos.x / uRes.x * 2.0 - 1.0, 1.0 - pos.y / uRes.y * 2.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vQ;
in float vType;
in float vRot;
in float vSeed;
uniform float uTime;
out vec4 outColor;

float hash3(vec3 p) {
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float noise3(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * noise3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}
/* Scattered round craters: dark floors with a lighter rim. */
float craters(vec3 p, float scale) {
  vec3 q = p * scale;
  vec3 i = floor(q);
  float m = 0.0;
  for (int k = 0; k < 8; k++) {
    vec3 o = vec3(float(k & 1), float((k >> 1) & 1), float((k >> 2) & 1));
    vec3 c = i + o;
    float h = hash3(c * 1.31);
    if (h > 0.55) continue;
    vec3 ctr = c + vec3(hash3(c + 3.1), hash3(c + 7.7), hash3(c + 1.9));
    float r = 0.25 + 0.35 * hash3(c + 5.3);
    float d = length(q - ctr) / r;
    m += (1.0 - smoothstep(0.75, 1.0, d)) * 0.55 - smoothstep(0.85, 1.0, d) * (1.0 - smoothstep(1.0, 1.2, d)) * 0.35;
  }
  return m;
}

vec3 surface(int t, vec3 p, out float ocean, out float glow) {
  ocean = 0.0;
  glow = 0.0;
  float lat = p.y;
  if (t == 0) {          // Sun: boiling granulation, hot core
    float g = fbm(p * 6.0 + vec3(0.0, uTime * 0.25, uTime * 0.18));
    float s = fbm(p * 2.2 - uTime * 0.05);
    glow = 1.0;
    return mix(vec3(1.0, 0.42, 0.06), vec3(1.0, 0.86, 0.42), smoothstep(0.25, 0.75, g)) * (0.85 + 0.3 * s);
  }
  if (t == 1) {          // Mercury: grey-brown, cratered
    vec3 c = vec3(0.56, 0.52, 0.49) * (0.75 + 0.4 * fbm(p * 4.0));
    return c * (1.0 - craters(p, 3.0) * 0.5);
  }
  if (t == 2) {          // Venus: thick cream clouds in soft swirls
    float b = fbm(vec3(p.x * 2.0, p.y * 7.0, p.z * 2.0) + fbm(p * 2.0) * 1.5);
    return mix(vec3(0.86, 0.7, 0.42), vec3(0.98, 0.9, 0.68), b);
  }
  if (t == 3) {          // Earth: oceans, continents, ice, clouds
    float land = smoothstep(0.5, 0.54, fbm(p * 2.1 + 11.0));
    vec3 sea = mix(vec3(0.02, 0.12, 0.38), vec3(0.06, 0.28, 0.55), fbm(p * 5.0));
    vec3 ground = mix(vec3(0.16, 0.38, 0.13), vec3(0.58, 0.47, 0.28), smoothstep(0.4, 0.7, fbm(p * 4.0 + 3.0)));
    vec3 c = mix(sea, ground, land);
    c = mix(c, vec3(0.92, 0.95, 0.98), smoothstep(0.8, 0.88, abs(lat)));
    float cloud = smoothstep(0.52, 0.75, fbm(p * 3.0 + vec3(uTime * 0.04, 0.0, 0.0)));
    ocean = (1.0 - land) * (1.0 - cloud);
    return mix(c, vec3(0.96), cloud * 0.85);
  }
  if (t == 4) {          // Moon: grey highlands, dark maria, craters
    vec3 c = vec3(0.66, 0.65, 0.62) * (0.8 + 0.3 * fbm(p * 3.0));
    c *= 1.0 - 0.35 * smoothstep(0.52, 0.6, fbm(p * 1.5 + 5.0));
    return c * (1.0 - craters(p, 3.5) * 0.45);
  }
  if (t == 5) {          // Mars: rust, darker plains, white poles
    vec3 c = mix(vec3(0.76, 0.36, 0.16), vec3(0.45, 0.2, 0.1), smoothstep(0.45, 0.65, fbm(p * 2.6)));
    c *= 0.85 + 0.25 * fbm(p * 8.0);
    return mix(c, vec3(0.95, 0.93, 0.9), smoothstep(0.86, 0.92, abs(lat)));
  }
  if (t == 6) {          // Jupiter: turbulent bands and the Great Red Spot
    float warp = fbm(p * vec3(3.0, 1.2, 3.0)) * 2.6;
    float b = sin(lat * 19.0 + warp);
    vec3 c = mix(vec3(0.93, 0.87, 0.75), vec3(0.78, 0.6, 0.42), smoothstep(-0.25, 0.65, b));
    c = mix(c, vec3(0.55, 0.38, 0.27), smoothstep(0.75, 1.0, abs(b)) * 0.45);
    float ds = length((p - normalize(vec3(0.5, -0.36, 0.79))) * vec3(1.0, 2.3, 1.0));
    return mix(c, vec3(0.78, 0.33, 0.2), smoothstep(0.3, 0.17, ds));
  }
  if (t == 7) {          // Saturn: soft golden bands
    float b = sin(lat * 15.0 + fbm(p * 2.0) * 1.4);
    return mix(vec3(0.95, 0.86, 0.62), vec3(0.8, 0.66, 0.42), smoothstep(-0.3, 0.75, b));
  }
  if (t == 8) {          // Uranus: pale cyan haze
    return vec3(0.6, 0.86, 0.9) * (0.95 + 0.06 * sin(lat * 9.0 + fbm(p * 2.0)));
  }
  /* Neptune: deep blue, faint bands, a dark storm */
  vec3 c = mix(vec3(0.16, 0.3, 0.8), vec3(0.3, 0.48, 0.92), 0.5 + 0.5 * sin(lat * 10.0 + fbm(p * 2.5) * 2.0));
  float ds = length((p - normalize(vec3(-0.4, -0.3, 0.86))) * vec3(1.0, 2.0, 1.0));
  return mix(c, vec3(0.08, 0.14, 0.4), smoothstep(0.25, 0.15, ds));
}

void main() {
  int t = int(vType + 0.5);
  vec2 q = vQ;                          // radius units, y down
  float d = length(q);
  float aa = fwidth(d) * 1.2 + 1e-4;
  vec3 L = normalize(vec3(-0.55, 0.62, 0.58));
  vec4 acc = vec4(0.0);

  /* A soft contact shadow under each body (the Sun lights its own floor). */
  if (t != 0) {
    float sh = 1.0 - smoothstep(0.55, 1.0, length(vec2(q.x * 0.95, (q.y - 0.97) * 3.4)));
    acc = vec4(0.0, 0.0, 0.0, sh * 0.42);
  }

  /* Saturn's rings, tilted towards us: the far half goes behind the planet. */
  vec4 ringBack = vec4(0.0), ringFront = vec4(0.0);
  if (t == 7) {
    float a = -0.42;
    vec2 r = vec2(cos(a) * q.x - sin(a) * q.y, sin(a) * q.x + cos(a) * q.y);
    float rr = length(vec2(r.x, r.y / 0.28));
    float band = smoothstep(1.32, 1.4, rr) * (1.0 - smoothstep(2.08, 2.18, rr));
    band *= 1.0 - 0.85 * (smoothstep(1.86, 1.9, rr) * (1.0 - smoothstep(1.94, 1.98, rr)));
    float stripes = 0.75 + 0.25 * sin(rr * 58.0);
    vec3 rc = vec3(0.9, 0.8, 0.6) * stripes * (0.85 + 0.15 * r.y);
    float ra = band * 0.85;
    if (r.y < 0.0) ringBack = vec4(rc * ra, ra);
    else ringFront = vec4(rc * ra, ra);
  }
  acc = ringBack + acc * (1.0 - ringBack.a);

  /* The body itself: a sphere, rolled as it rolls, spinning slowly. */
  float body = 1.0 - smoothstep(1.0 - aa, 1.0, d);
  if (body > 0.0) {
    vec3 n = vec3(q.x, -q.y, sqrt(max(0.0, 1.0 - min(d * d, 1.0))));
    float c = cos(vRot), s = sin(vRot);
    vec3 p = vec3(c * n.x - s * n.y, s * n.x + c * n.y, n.z);
    float spin = uTime * (0.12 + 0.1 * fract(vSeed * 7.3)) + vSeed * 6.283;
    float cs = cos(spin), sn = sin(spin);
    p = vec3(cs * p.x + sn * p.z, p.y, -sn * p.x + cs * p.z);
    float ocean, glow;
    vec3 base = surface(t, p, ocean, glow);
    vec3 col;
    if (t == 0) {
      /* Emissive: limb darkening instead of lighting. */
      col = base * (0.55 + 0.6 * pow(n.z, 0.45));
    } else {
      float diff = dot(n, L);
      float lit = 0.05 + 1.1 * smoothstep(-0.12, 0.65, diff) * (0.45 + 0.55 * max(diff, 0.0));
      col = base * lit;
      /* Sun glint on open ocean. */
      vec3 R = reflect(-L, n);
      col += pow(max(R.z, 0.0), 40.0) * ocean * 0.6;
      /* Atmospheres glow at the rim. */
      float rim = pow(1.0 - n.z, 2.6) * smoothstep(-0.3, 0.4, diff);
      if (t == 3) col += vec3(0.35, 0.6, 1.0) * rim * 0.9;
      if (t == 2) col += vec3(1.0, 0.85, 0.55) * rim * 0.5;
      if (t == 8) col += vec3(0.6, 0.95, 1.0) * rim * 0.5;
      if (t == 9) col += vec3(0.4, 0.6, 1.0) * rim * 0.6;
      /* Saturn's rings throw a thin shadow band across the planet. */
      if (t == 7) col *= 1.0 - 0.35 * smoothstep(0.06, 0.0, abs(q.y * 0.9 + q.x * 0.4 + 0.12));
    }
    acc = vec4(col * body, body) + acc * (1.0 - body);
  }

  /* The Sun's corona. */
  if (t == 0) {
    float g = exp(-max(d - 1.0, 0.0) * 3.4) * (1.0 - body) * 0.7;
    acc += vec4(vec3(1.0, 0.6, 0.18) * g, g * 0.55);
  }
  acc = ringFront + acc * (1.0 - ringFront.a);
  outColor = acc;
}`;

const rand = (a, b) => a + Math.random() * (b - a);

export default class PlanetShower {
  static supported() {
    const c = document.createElement('canvas');
    return !!c.getContext('webgl2') && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /**
   * section   the closing section (the planets live in its box)
   * canvas    the canvas inside it
   * onShower  called each time a fresh shower starts
   */
  constructor(section, canvas, { onShower } = {}) {
    this.section = section;
    this.canvas = canvas;
    this.onShower = onShower;
    this.bodies = [];
    this.armed = true;
    this.awake = false;
    this.time = 0;
    this.pointer = null;

    const gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: true });
    if (!gl || !this.build(gl)) {
      this.dead = true;
      return;
    }
    this.gl = gl;
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); this.dead = true; this.stop(); });

    /* Dragging through the pile shoves the bodies near the pointer. */
    this.onMove = (e) => {
      const r = this.section.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      const now = performance.now();
      if (this.pointer && now - this.pointer.t < 120) {
        const dt = Math.max((now - this.pointer.t) / 1000, 1 / 240);
        this.push(x, y, (x - this.pointer.x) / dt, (y - this.pointer.y) / dt);
      }
      this.pointer = { x, y, t: now };
    };
    this.onLeave = () => { this.pointer = null; };
    section.addEventListener('pointermove', this.onMove, { passive: true });
    section.addEventListener('pointerleave', this.onLeave, { passive: true });

    /* Only run while the section is near the screen. */
    this.io = new IntersectionObserver((entries) => {
      this.near = entries.some((e) => e.isIntersecting);
      if (this.near) this.start();
      else this.stop();
    }, { rootMargin: '50% 0px 50% 0px' });
    this.io.observe(section);
    this.resize();
  }

  build(gl) {
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('[PlanetShower]', gl.getShaderInfoLog(s));
        return null;
      }
      return s;
    };
    const vs = sh(gl.VERTEX_SHADER, VERT);
    const fs = sh(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return false;
    const prog = gl.createProgram();
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      console.warn('[PlanetShower]', gl.getProgramInfoLog(prog));
      return false;
    }
    gl.useProgram(prog);
    this.prog = prog;
    this.u = { res: gl.getUniformLocation(prog, 'uRes'), time: gl.getUniformLocation(prog, 'uTime') };

    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    const corner = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, corner);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aCorner = gl.getAttribLocation(prog, 'aCorner');
    gl.enableVertexAttribArray(aCorner);
    gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);

    this.inst = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    const iA = gl.getAttribLocation(prog, 'iA');
    const iB = gl.getAttribLocation(prog, 'iB');
    gl.enableVertexAttribArray(iA);
    gl.vertexAttribPointer(iA, 4, gl.FLOAT, false, 24, 0);
    gl.vertexAttribDivisor(iA, 1);
    gl.enableVertexAttribArray(iB);
    gl.vertexAttribPointer(iB, 2, gl.FLOAT, false, 24, 16);
    gl.vertexAttribDivisor(iB, 1);

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);
    return true;
  }

  resize() {
    if (this.dead) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = this.section.clientWidth;
    const h = this.section.clientHeight;
    const changed = w !== this.W || h !== this.H;
    this.W = w;
    this.H = h;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    if (changed && this.bodies.length) {
      /* Keep everyone inside the new box; they'll settle again. */
      for (const b of this.bodies) {
        b.x = Math.min(Math.max(b.x, b.r), w - b.r);
        b.y = Math.min(b.y, h - b.r);
      }
      this.awake = true;
    }
  }

  /* ------------------------------------------------------------ shower */

  shower() {
    const W = this.W;
    const unit = Math.min(Math.max(W / 1280, 0.55), 1.4);
    /* Narrow screens get fewer bodies so the pile is the same depth. */
    const howMany = Math.min(Math.max(W / 1280, 0.4), 1.5);
    const list = [];
    for (const [type, radius, count] of BODIES) {
      const n = Math.max(type === SUN ? 1 : 1, Math.round(count * howMany));
      for (let i = 0; i < n; i++) {
        const r = radius * unit * rand(0.93, 1.07);
        list.push({
          type,
          r,
          m: r * r,
          x: rand(r, W - r),
          y: -r - rand(0, 60),
          vx: rand(-70, 70),
          vy: rand(0, 160),
          rot: rand(0, Math.PI * 2),
          seed: Math.random(),
          /* Big ones a touch earlier, so the small ones rain on top. */
          at: Math.random() * SHOWER * (0.35 + 0.65 * (1 - Math.min(1, radius / 56))),
          live: false
        });
      }
    }
    /* The Sun draws last, so its glow lies over its neighbours. */
    list.sort((a, b) => (a.type === SUN) - (b.type === SUN));
    this.bodies = list;
    this.clock = 0;
    this.still = 0;
    this.awake = true;
    this.data = new Float32Array(list.length * 6);
    this.onShower?.();
  }

  /** The pointer moved through the pile at (x, y) with velocity (vx, vy). */
  push(x, y, vx, vy) {
    if (!this.bodies.length) return;
    const speed = Math.hypot(vx, vy);
    if (speed < 30) return;
    const cap = 2600 / speed;
    const ux = vx * Math.min(1, cap);
    const uy = vy * Math.min(1, cap);
    let hit = false;
    for (const b of this.bodies) {
      if (!b.live) continue;
      const reach = 60 + b.r;
      const dx = b.x - x;
      const dy = b.y - y;
      const d = Math.hypot(dx, dy);
      if (d > reach) continue;
      const f = (1 - d / reach) ** 2;
      /* Heavier bodies budge less. */
      const k = f * Math.min(1, 900 / b.m) * 0.9 + f * 0.25;
      b.vx += ux * k;
      b.vy += uy * k - 140 * f;
      b.kick = 0.35;
      hit = true;
    }
    if (hit) {
      this.awake = true;
      this.still = 0;
    }
  }

  /* ----------------------------------------------------------- physics */

  /**
   * Position-based dynamics: move everything, untangle the overlaps (each
   * pair pushed apart by mass), then take each body's velocity from where
   * it actually ended up. Stacks come truly to rest that way instead of
   * shivering. Hard landings on the floor still bounce.
   */
  step(dt) {
    const { W, H } = this;
    const bodies = this.bodies;
    for (const b of bodies) {
      if (!b.live) {
        if (this.clock >= b.at) b.live = true;
        else continue;
      }
      b.px = b.x;
      b.py = b.y;
      /* Falling, up to a terminal speed (keeps a fast body from burying itself in the pile). */
      b.vy = Math.min(b.vy + GRAVITY * dt, 1500);
      b.vx *= 1 - 0.1 * dt;
      b.landing = b.vy;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
    }

    const n = bodies.length;
    for (let it = 0; it < 6; it++) {
      for (let i = 0; i < n; i++) {
        const a = bodies[i];
        if (!a.live) continue;
        for (let j = i + 1; j < n; j++) {
          const b = bodies[j];
          if (!b.live) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const min = a.r + b.r;
          const d2 = dx * dx + dy * dy;
          if (d2 >= min * min || d2 < 1e-6) continue;
          const d = Math.sqrt(d2);
          const nx = dx / d;
          const ny = dy / d;
          const wa = 1 / a.m;
          const wb = 1 / b.m;
          const corr = (min - d) / (wa + wb);
          a.x -= nx * corr * wa;
          a.y -= ny * corr * wa;
          b.x += nx * corr * wb;
          b.y += ny * corr * wb;
        }
      }
      for (const b of bodies) {
        if (!b.live) continue;
        if (b.y > H - b.r) b.y = H - b.r;
        if (b.x < b.r) b.x = b.r;
        else if (b.x > W - b.r) b.x = W - b.r;
      }
    }

    for (const b of bodies) {
      if (!b.live) continue;
      b.vx = (b.x - b.px) / dt;
      b.vy = (b.y - b.py) / dt;
      /* Untangling may nudge, never fling: cap what it can hand back — unless
         the pointer has just shoved this one. */
      if (!(b.kick > 0)) {
        if (b.vy < -320) b.vy = -320;
        const sp = Math.hypot(b.vx, b.vy);
        if (sp > 1600) {
          b.vx *= 1600 / sp;
          b.vy *= 1600 / sp;
        }
      } else b.kick -= dt;
      const floor = b.y >= H - b.r - 0.01;
      /* A hard landing bounces; anything gentler just stops. */
      if (floor && b.landing > 260) b.vy = -b.landing * 0.3;
      /* Rolling resistance and friction against the floor and the pile. */
      if (floor) b.vx *= 1 - Math.min(1, 5 * dt);
      const mx = b.x - b.px;
      b.rot -= mx / b.r;
      const speed = Math.hypot(mx, b.y - b.py) / dt;
      if (speed < 3) b.vx *= 0.5;
    }
  }

  /**
   * Asleep once nothing has really moved over a short window — checked on
   * where things are, since a resting pile still trembles by fractions of
   * a pixel from one tiny physics step to the next.
   */
  settle(dt) {
    this.window = (this.window || 0) + dt;
    if (this.window < 0.25) return;
    this.window = 0;
    let moved = 0;
    for (const b of this.bodies) {
      if (!b.live) return;
      if (b.sx !== undefined) moved = Math.max(moved, Math.hypot(b.x - b.sx, b.y - b.sy));
      b.sx = b.x;
      b.sy = b.y;
    }
    if (this.clock > SHOWER + 0.5 && moved < 0.75) this.awake = false;
  }

  /* -------------------------------------------------------------- loop */

  start() {
    if (this.running || this.dead) return;
    this.running = true;
    this.last = performance.now();
    gsap.ticker.add(this.tick);
  }

  stop() {
    this.running = false;
    gsap.ticker.remove(this.tick);
  }

  tick = () => {
    if (this.dead) return;
    const now = performance.now();
    const dt = Math.min((now - this.last) / 1000, 1 / 30);
    this.last = now;
    this.time += dt;

    /* Arm once the section has gone (scrolled back up past it); a fresh
       shower falls the next time it comes in. In between, nothing resets. */
    const r = this.section.getBoundingClientRect();
    const vh = window.innerHeight;
    if (r.top > vh * 0.95) this.armed = true;
    else if (this.armed && r.top < vh * 0.72) {
      this.armed = false;
      if (this.section.clientWidth !== this.W || this.section.clientHeight !== this.H) this.resize();
      this.shower();
    }

    if (this.awake) {
      this.clock += dt;
      const sub = 4;
      for (let i = 0; i < sub; i++) this.step(dt / sub);
      this.settle(dt);
    }
    this.draw();
  };

  draw() {
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const bodies = this.bodies;
    if (!bodies.length) return;
    let n = 0;
    const d = this.data;
    for (const b of bodies) {
      if (!b.live) continue;
      d[n * 6] = b.x;
      d[n * 6 + 1] = b.y;
      d[n * 6 + 2] = b.r;
      d[n * 6 + 3] = b.type;
      d[n * 6 + 4] = b.rot;
      d[n * 6 + 5] = b.seed;
      n++;
    }
    if (!n) return;
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.inst);
    gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, n * 6), gl.DYNAMIC_DRAW);
    gl.uniform2f(this.u.res, this.W, this.H);
    gl.uniform1f(this.u.time, this.time);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
  }

  destroy() {
    this.stop();
    this.io?.disconnect();
    this.section.removeEventListener('pointermove', this.onMove);
    this.section.removeEventListener('pointerleave', this.onLeave);
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
  }
}
