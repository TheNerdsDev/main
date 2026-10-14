#include ./noise.glsl;

uniform sampler2D tScene;
uniform sampler2D tInk;
uniform vec2  uRes;
uniform float uTime;
uniform float uDpr;
uniform float uGrain;
uniform float uVignette;
uniform float uInkAmount;
uniform float uFade;        // page-transition dip
uniform vec3  uAccent;
uniform vec3  uBg;
uniform vec4  uStill[2];    // photos of us on screen (x0, y0, x1, y1); off screen when unused

varying vec2 vUv;

// How much of the cursor's trail shows here: none over a photo of us,
// easing back in over a short margin round it.
float inkHere() {
  float aspect = uRes.x / uRes.y;
  float still = 0.0;
  for (int i = 0; i < 2; i++) {
    vec4 r = uStill[i];
    vec2 d = max(max(r.xy - vUv, vUv - r.zw), 0.0);
    d.x *= aspect;
    still = max(still, 1.0 - smoothstep(0.0, 0.045, length(d)));
  }
  return 1.0 - still;
}

void main() {
  /* The frame as it is: nothing bends it. */
  vec3 col = texture2D(tScene, vUv).rgb;

  // The cursor's wake: grey smoke drifting through space. gl/InkTrail.js
  // keeps the stroke — where it went and which way it was thrown —
  // drifting, rising, spreading and fading. Here it's broken into curling
  // tendrils (noise, its own coordinates warped by more noise, pulled
  // along the flow). It has depth: where it's thick it passes in front of
  // the stars and dims them; its thin edges catch a soft light in the
  // site's warm off-white. No colour, nothing bent, and kept off the
  // photos of us.
  vec4 ink = texture2D(tInk, vUv);
  float density = clamp(ink.r, 0.0, 1.0);
  if (density > 0.003) {
    float body = smoothstep(0.0, 0.8, density) * inkHere();
    vec2 flow = ink.gb;
    vec2 p = vec2(vUv.x * uRes.x / uRes.y, vUv.y) * 3.0;
    float t = uTime * 0.05;
    vec2 warp = vec2(fbm(vec3(p, t), 2, 2.0, 0.5), fbm(vec3(p + 5.2, t), 2, 2.0, 0.5));
    float wisp = fbm(vec3(p + warp * 0.9 - flow * 0.04, t * 1.6), 3, 2.02, 0.5) * 0.5 + 0.5;
    float smoke = body * smoothstep(0.3, 0.92, wisp);
    float lit = smoke * (1.0 - smoothstep(0.55, 1.0, body));   // the thin edges
    col *= 1.0 - smoke * 0.16 * uInkAmount;
    col += vec3(0.957, 0.953, 0.933) * (smoke * 0.032 + lit * 0.026) * uInkAmount;
  }

  // Vignette.
  vec2 v = (vUv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
  float vig = 1.0 - smoothstep(0.42, 1.15, length(v)) * uVignette;
  col *= vig;

  // Grain, sized in device pixels so it stays constant across DPRs.
  float g = hash12(floor(gl_FragCoord.xy / max(uDpr * 0.75, 1.0)) + fract(uTime) * 311.7);
  col += (g - 0.5) * uGrain;

  // Transition dip to background.
  col = mix(uBg, col, uFade);

  gl_FragColor = vec4(col, 1.0);
}
