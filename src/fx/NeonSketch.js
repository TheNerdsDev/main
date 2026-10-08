/*
 * A neon sketch drawn on the GPU.
 *
 * The SVG version runs the whole neon filter — three displacement warps,
 * tint, two big blurs, an erode — on the CPU, and every frame a face moves
 * (shock, wince, anger…) it has to run again: that's what made a hit stutter.
 * Here the expensive parts are baked once into textures (the line work, and
 * two blurred copies for the glow), and each frame is a single cheap pass:
 * warp the lookup through the expression maps, then stack far glow, near
 * glow, the tinted line and a white-hot core — the same recipe as the SVG.
 * It only redraws when something actually changes.
 *
 * The SVG stays in the page as the fallback; it's hidden once this is ready.
 */

/* The glow spills past the drawing; the canvas covers the same margin the
   SVG filter region did (12% each side). */
const PAD = 0.12;
const SPAN = 1 + PAD * 2;

const VERT = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uSketch;
uniform sampler2D uNear;
uniform sampler2D uFar;
uniform sampler2D uEye;
uniform sampler2D uHurt;
uniform sampler2D uMood;
uniform vec2 uView;        // the drawing's viewBox size
uniform float uEyeS;       // warp strengths, viewBox units (as the SVG's scale)
uniform float uHurtS;
uniform float uMoodS;
uniform vec3 uColour;
uniform float uDark;       // 1 = pencil on paper (the paper is keyed out)

/* viewBox position -> uv on the padded canvas (top-left origin) */
vec2 toUv(vec2 p) { return (p / uView + ${PAD.toFixed(3)}) / ${SPAN.toFixed(3)}; }

float lineMask(vec4 c) {
  float lum = (c.r + c.g + c.b) / 3.0;
  float a = mix(lum, clamp(1.6 - 1.8 * lum, 0.0, 1.0), uDark);
  return a * c.a;
}

void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec2 p = (uv * ${SPAN.toFixed(3)} - ${PAD.toFixed(3)}) * uView;

  /* The filter chain, undone from the last stage back: each warp moves the
     point we read from by scale x (map - 0.5). */
  vec2 p2 = p + uMoodS * (texture2D(uMood, p / uView).rg - 0.5);
  vec2 p1 = p2 + uHurtS * (texture2D(uHurt, p2 / uView).rg - 0.5);
  vec2 p0 = p1 + uEyeS * (texture2D(uEye, p1 / uView).rg - 0.5);
  vec2 t = toUv(p0);

  float lines = lineMask(texture2D(uSketch, t));
  float near = texture2D(uNear, t).a;
  float far = texture2D(uFar, t).a;
  float core = smoothstep(0.3, 0.9, lines) * 0.72;

  /* Stacked back to front, premultiplied: far glow, near glow, the neon
     line, the white core. */
  vec4 acc = vec4(uColour * far, far);
  acc = vec4(uColour * near, near) + acc * (1.0 - near);
  acc = vec4(uColour * lines, lines) + acc * (1.0 - lines);
  acc = vec4(vec3(core), core) + acc * (1.0 - core);
  gl_FragColor = acc;
}`;

const load = (src) => new Promise((resolve, reject) => {
  const img = new Image();
  img.decoding = 'async';
  img.onload = () => resolve(img);
  img.onerror = reject;
  img.src = src;
});

const hexToVec = (hex) => {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};

/* Canvas blur, with a fallback for browsers without ctx.filter: shrink and
   grow back (bilinear), which smears much like a Gaussian. */
const blurred = (src, sigma) => {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  const g = c.getContext('2d');
  if ('filter' in g) {
    g.filter = `blur(${sigma.toFixed(2)}px)`;
    g.drawImage(src, 0, 0);
    g.filter = 'none';
    if (g.getImageData(0, 0, 1, 1)) return c;
  }
  const k = Math.max(1, sigma * 0.9);
  const s = document.createElement('canvas');
  s.width = Math.max(1, Math.round(src.width / k));
  s.height = Math.max(1, Math.round(src.height / k));
  const sg = s.getContext('2d');
  sg.imageSmoothingQuality = 'high';
  sg.drawImage(src, 0, 0, s.width, s.height);
  g.clearRect(0, 0, c.width, c.height);
  g.imageSmoothingQuality = 'high';
  g.drawImage(s, 0, 0, c.width, c.height);
  return c;
};

export default class NeonSketch {
  /**
   * host     the element the sketch is shown in (.sketch-svg)
   * opts     { src, view: [w, h], colour, ink, maps: { eye, hurt, angry, sad } }
   */
  constructor(host, opts) {
    this.host = host;
    this.opts = opts;
    this.v = { eye: 0, hurt: 0, mood: 0 };
    this.moodName = 'angry';
    this.dirty = true;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'sketch-gl';
    this.canvas.setAttribute('aria-hidden', 'true');
    const gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl || !this.build(gl)) return;
    this.gl = gl;
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.ready = false;
      this.host.classList.remove('is-gl');
    });
    this.ready = false;
    this.init().catch(() => {});
  }

  build(gl) {
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('[NeonSketch]', gl.getShaderInfoLog(s));
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
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return false;
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'aPos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.u = {};
    ['uSketch', 'uNear', 'uFar', 'uEye', 'uHurt', 'uMood', 'uView', 'uEyeS', 'uHurtS', 'uMoodS', 'uColour', 'uDark']
      .forEach((n) => { this.u[n] = gl.getUniformLocation(prog, n); });
    ['uSketch', 'uNear', 'uFar', 'uEye', 'uHurt', 'uMood'].forEach((n, i) => gl.uniform1i(this.u[n], i));
    /* Map values must arrive exactly as stored (128 = no shift). */
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.clearColor(0, 0, 0, 0);
    return true;
  }

  texture(unit, source) {
    const gl = this.gl;
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    return t;
  }

  async init() {
    const { src, maps } = this.opts;
    const [sketch, eye, hurt, angry, sad] = await Promise.all([
      load(src), load(maps.eye), load(maps.hurt), load(maps.angry), load(maps.sad)
    ]);
    this.images = { sketch };
    const gl = this.gl;
    this.tex = {
      eye: this.texture(3, eye),
      hurt: this.texture(4, hurt),
      angry: this.texture(5, angry),
      sad: this.texture(5, sad)
    };
    this.bake();
    this.host.appendChild(this.canvas);
    this.host.classList.add('is-gl');
    this.ready = true;
    this.dirty = true;
    this.render();
    gl.flush();
  }

  /**
   * Rasterise the line work at the size it's shown, and blur two copies of
   * it for the glow. Redone on resize.
   */
  bake() {
    const gl = this.gl;
    const box = this.host.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(this.host.offsetWidth * SPAN * dpr) || Math.round(box.width * SPAN * dpr));
    const h = Math.max(2, Math.round(this.host.offsetHeight * SPAN * dpr) || Math.round(box.height * SPAN * dpr));
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    this.canvas.width = w;
    this.canvas.height = h;

    const [vw, vh] = this.opts.view;
    /* The drawing, centred in its padding. */
    const art = document.createElement('canvas');
    art.width = w;
    art.height = h;
    const ag = art.getContext('2d');
    const dw = w / SPAN;
    const dh = h / SPAN;
    ag.drawImage(this.images.sketch, (w - dw) / 2, (h - dh) / 2, dw, dh);

    /* The glow is blurred line work: build the line mask (white, alpha =
       line strength) the same way the shader reads the drawing. */
    const mask = document.createElement('canvas');
    mask.width = w;
    mask.height = h;
    const mg = mask.getContext('2d');
    const data = ag.getImageData(0, 0, w, h);
    const d = data.data;
    const dark = this.opts.ink === 'dark';
    for (let i = 0; i < d.length; i += 4) {
      const lum = (d[i] + d[i + 1] + d[i + 2]) / (3 * 255);
      const a = (dark ? Math.min(1, Math.max(0, 1.6 - 1.8 * lum)) : lum) * (d[i + 3] / 255);
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.round(a * 255);
    }
    mg.putImageData(data, 0, 0);
    /* Blur radii are in viewBox units in the SVG; convert to pixels here. */
    const unit = dw / vw;
    const near = blurred(mask, 2.4 * unit);
    const far = blurred(mask, 10 * unit);

    const replace = (key, unitIndex, source) => {
      if (this.tex[key]) gl.deleteTexture(this.tex[key]);
      this.tex[key] = this.texture(unitIndex, source);
    };
    replace('sketch', 0, art);
    replace('near', 1, near);
    replace('far', 2, far);
    this.dirty = true;
  }

  /** Warp strengths (as the SVG's scale attributes) and which mood is in the second stage. */
  set(eye, hurt, mood) {
    if (Math.abs(eye - this.v.eye) + Math.abs(hurt - this.v.hurt) + Math.abs(mood - this.v.mood) < 0.05) return;
    this.v = { eye, hurt, mood };
    this.dirty = true;
  }

  setMood(name) {
    if (name === this.moodName) return;
    this.moodName = name === 'sad' ? 'sad' : 'angry';
    this.dirty = true;
  }

  resize() {
    if (!this.ready) return;
    this.bake();
    this.render();
  }

  render() {
    if (!this.ready || !this.dirty) return;
    this.dirty = false;
    const gl = this.gl;
    const [vw, vh] = this.opts.view;
    gl.viewport(0, 0, this.w, this.h);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const bind = (unit, t) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); };
    bind(0, this.tex.sketch);
    bind(1, this.tex.near);
    bind(2, this.tex.far);
    bind(3, this.tex.eye);
    bind(4, this.tex.hurt);
    bind(5, this.tex[this.moodName]);
    gl.uniform2f(this.u.uView, vw, vh);
    gl.uniform1f(this.u.uEyeS, this.v.eye);
    gl.uniform1f(this.u.uHurtS, this.v.hurt);
    gl.uniform1f(this.u.uMoodS, this.v.mood);
    gl.uniform3fv(this.u.uColour, hexToVec(this.opts.colour));
    gl.uniform1f(this.u.uDark, this.opts.ink === 'dark' ? 1 : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  destroy() {
    this.ready = false;
    this.gl?.getExtension('WEBGL_lose_context')?.loseContext();
    this.canvas.remove();
    this.host.classList.remove('is-gl');
  }
}
