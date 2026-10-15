#include ./noise.glsl;

uniform sampler2D tNebula;  // the band's clouds, drawn small and seldom (nebula.frag)
uniform float uSpan;
uniform float uTime;
uniform float uIntro;
uniform vec2  uRes;
uniform float uDpr;
uniform vec2  uPointer;

varying vec2 vUv;

// Distance from p to the segment a-b, and how far along it p sits (0..1).
vec2 segment(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return vec2(length(pa - ba * h), h);
}

// A few shooting stars, each on its own slow cycle, visible for a moment.
// (Hairline-thin, so drawn here at full resolution, not with the clouds.)
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
  vec2 aspect = vec2(uRes.x / uRes.y, 1.0);
  vec2 p = (vUv - 0.5) * aspect;
  p -= uPointer * 0.012;                   // the sky barely moves: it is the farthest layer

  // The clouds, looked up where this point of the sky falls in their image.
  vec3 col = texture2D(tNebula, p / (aspect * uSpan) + 0.5).rgb;

  col += shootingStars(p);

  gl_FragColor = vec4(col * uIntro, 1.0);
}
