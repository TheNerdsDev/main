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

varying vec2 vUv;

void main() {
  vec4 ink = texture2D(tInk, vUv);
  float density = clamp(ink.r, 0.0, 1.0);
  vec2 flow = ink.gb;

  // Refract the frame through the ink.
  vec2 offset = flow * 0.0135 * uInkAmount;
  vec2 uv = vUv + offset;

  vec3 col = texture2D(tScene, uv).rgb;

  // Colourless trail: the ink only bends light and lifts luminance,
  // so the effect reads as displaced glass rather than a tinted glow.
  float bloom = smoothstep(0.02, 0.85, density);
  col += vec3(bloom) * 0.055 * uInkAmount;
  col = mix(col, col * 1.10, bloom * 0.6);

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
