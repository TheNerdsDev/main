#include ./noise.glsl;

// The galactic band's clouds, drawn into a small image of their own
// (gl/Stars.js), not into every pixel of every frame: they're soft and
// drift so slowly that half the resolution, redrawn every few frames, is
// the same sky — for a fraction of the cost (it was most of the frame).
// The image covers a little more than the screen (uSpan), so the sky's
// slight parallax against the pointer is a shift of it (sky.frag), not a
// redraw.

uniform float uTime;
uniform vec2  uRes;
uniform float uSpan;
uniform vec2  uBandDir;
uniform float uBandWidth;
uniform vec3  uBand;
uniform vec3  uHaze;

varying vec2 vUv;

void main() {
  vec2 p = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0) * uSpan;

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

  gl_FragColor = vec4(col, 1.0);
}
