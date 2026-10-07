#include ./noise.glsl;

uniform float uTime;
uniform float uIntro;
uniform vec2  uRes;
uniform float uDpr;
uniform vec2  uPointer;
uniform vec2  uBandDir;
uniform float uBandWidth;
uniform vec3  uBand;
uniform vec3  uHaze;

varying vec2 vUv;

// Distance from p to the segment a-b, and how far along it p sits (0..1).
vec2 segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return vec2(length(pa - ba * h), h);
}

// A few shooting stars, each on its own slow cycle, visible for a moment.
vec3 shootingStars(vec2 p) {
  vec3 acc = vec3(0.0);
  float px = uDpr / uRes.y;               // one CSS pixel in p units
  for (int i = 0; i < 2; i++) {
    float fi = float(i);
    float period = 9.0 + fi * 5.3;
    float t = uTime / period + fi * 0.41;
    float id = floor(t);
    float f = fract(t);
    float life = 0.075;                    // share of the cycle it is visible
    if (f < life) {
      float k = f / life;
      vec2 h = vec2(hash12(vec2(id, fi * 7.13)), hash12(vec2(fi * 3.31, id + 1.7)));
      vec2 start = vec2(mix(-0.8, 0.4, h.x), mix(0.12, 0.48, h.y));
      vec2 dir = normalize(vec2(1.0, -0.32 - h.y * 0.35));
      vec2 head = start + dir * k * 0.75;
      vec2 tail = head - dir * 0.28 * min(k * 2.5, 1.0);
      vec2 s = segment(p, tail, head);
      float fade = sin(k * 3.14159);
      float line = smoothstep(1.6 * px, 0.0, s.x) * s.y * s.y;
      float glow = exp(-s.x / (5.0 * px)) * s.y * 0.18;
      acc += vec3(0.95) * (line + glow) * fade;
    }
  }
  return acc;
}

void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  p -= uPointer * 0.012;                   // the sky barely moves: it is the farthest layer

  vec2 perp = vec2(-uBandDir.y, uBandDir.x);
  float across = dot(p, perp);
  float along = dot(p, uBandDir);

  // A wandering galactic band of soft clouds.
  float warp = fbm(vec3(p * 1.3, uTime * 0.006), 3, 2.0, 0.5);
  float bx = (across + warp * 0.08) / uBandWidth;
  float band = exp(-bx * bx);
  /* Clamped: pow() of a negative is undefined in GLSL. */
  float clouds = clamp(fbm(vec3(p * 2.1 + warp * 0.6, 4.0 + uTime * 0.01), OCTAVES, 2.0, 0.5) * 0.5 + 0.5, 0.0, 1.0);

  // Dark dust lanes cut through the bright core of the band.
  float lanes = smoothstep(0.52, 0.78, fbm(vec3(p * 4.5 + warp, 9.0), 3, 2.0, 0.5) * 0.5 + 0.5);

  // A brighter galactic core along the band, right of centre.
  float core = exp(-(along - 0.35) * (along - 0.35) * 2.2) * band;

  // Colours arrive linear; build the nebula there, then lift it to a
  // perceptual curve so faint wisps stay visible against the near-black.
  // Black everywhere except the band, which stays a faint grey haze.
  vec3 col = vec3(0.0);
  col += uBand * band * pow(clouds, 1.8) * 0.05 * (1.0 - lanes * 0.75);
  col += uHaze * core * pow(clouds, 2.2) * 0.03 * (1.0 - lanes * 0.8);
  col = pow(max(col, vec3(0.0)), vec3(0.4545)) * 0.3;

  col += shootingStars(p);

  gl_FragColor = vec4(col * uIntro, 1.0);
}
