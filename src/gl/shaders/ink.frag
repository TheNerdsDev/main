// Ping-pong ink / fluid trail.
//   r   = density
//   g,b = flow velocity (signed, needs a half-float target)
//   a   = freshness
uniform sampler2D tPrev;
uniform vec2  uRes;
uniform vec2  uMouse;      // 0..1
uniform vec2  uPrevMouse;  // 0..1
uniform float uAspect;
uniform float uRadius;
uniform float uStrength;
uniform float uDecay;
uniform float uDiffuse;
uniform float uActive;

varying vec2 vUv;

// Distance from p to the segment a→b — gives a continuous stroke
// even when the pointer jumps a long way between frames.
float segDist(vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

void main() {
  vec2 texel = 1.0 / uRes;

  vec4 prev = texture2D(tPrev, vUv);

  // Advect along the stored flow, so the ink drifts the way it was thrown.
  vec2 advected = vUv - prev.gb * texel * 1.6;
  vec4 moved = texture2D(tPrev, advected);

  // Diffuse with the four neighbours.
  vec4 blur = (
      texture2D(tPrev, vUv + vec2(texel.x, 0.0))
    + texture2D(tPrev, vUv - vec2(texel.x, 0.0))
    + texture2D(tPrev, vUv + vec2(0.0, texel.y))
    + texture2D(tPrev, vUv - vec2(0.0, texel.y))
  ) * 0.25;

  vec4 acc = mix(moved, blur, uDiffuse) * uDecay;

  // Splat along this frame's pointer travel.
  vec2 p  = vec2(vUv.x * uAspect, vUv.y);
  vec2 a  = vec2(uPrevMouse.x * uAspect, uPrevMouse.y);
  vec2 b  = vec2(uMouse.x * uAspect, uMouse.y);

  float d = segDist(p, a, b);
  float splat = smoothstep(uRadius, 0.0, d) * uStrength * uActive;

  vec2 dir = b - a;

  acc.r += splat;
  acc.gb += dir * splat * 26.0;
  acc.a = max(acc.a * uDecay, splat);

  acc.r = clamp(acc.r, 0.0, 1.6);
  acc.gb = clamp(acc.gb, vec2(-4.0), vec2(4.0));

  gl_FragColor = acc;
}
