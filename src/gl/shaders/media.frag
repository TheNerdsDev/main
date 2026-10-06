#include ./noise.glsl;

uniform sampler2D tMap;
uniform sampler2D tInk;
uniform vec2  uSizes;       // natural image size
uniform vec2  uPlaneSizes;  // plane size in px
uniform vec2  uRes;         // viewport in px
uniform float uHover;
uniform float uLoad;        // texture reveal 0..1
uniform float uEnter;       // page enter 0..1
uniform float uColour;      // 0 = duotone, 1 = full colour
uniform vec3  uDark;
uniform vec3  uLight;
uniform vec3  uAccent;
uniform float uGrain;
uniform float uTime;
uniform float uInkAmount;
uniform float uDpr;
uniform float uOpacity;     // stack depth fade, 0..1
uniform float uBlur;        // stack depth-of-field radius, plane px

varying vec2 vUv;
varying float vDepth;

// Depth-of-field: a jittered golden-angle disc. The per-pixel rotation
// trades banding for grain, which the film grain below hides anyway.
const int BLUR_TAPS = 16;

vec3 sampleBlurred(vec2 uv, vec2 texel) {
  float spin = hash12(gl_FragCoord.xy) * 6.2831853;
  vec3 acc = vec3(0.0);
  for (int i = 0; i < BLUR_TAPS; i++) {
    float fi = float(i);
    float r = sqrt((fi + 0.5) / float(BLUR_TAPS));
    float a = fi * 2.39996323 + spin;
    acc += texture2D(tMap, uv + vec2(cos(a), sin(a)) * r * uBlur * texel).rgb;
  }
  return acc / float(BLUR_TAPS);
}

void main() {
  // ---- cover-fit the texture inside the plane -------------------
  vec2 ratio = vec2(
    min((uPlaneSizes.x / uPlaneSizes.y) / (uSizes.x / uSizes.y), 1.0),
    min((uPlaneSizes.y / uPlaneSizes.x) / (uSizes.y / uSizes.x), 1.0)
  );
  vec2 uv = vec2(
    vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
    vUv.y * ratio.y + (1.0 - ratio.y) * 0.5
  );

  // ---- ink refraction ------------------------------------------
  vec2 screenUv = gl_FragCoord.xy / uRes;
  vec4 ink = texture2D(tInk, screenUv);
  float inkDensity = clamp(ink.r, 0.0, 1.0);
  vec2 inkVel = ink.gb;

  uv += inkVel * 0.028 * uInkAmount;

  // ---- hover zoom ----------------------------------------------
  float zoom = 1.0 - uHover * 0.075;
  uv = (uv - 0.5) * zoom + 0.5;

  // ---- sample (refraction only, no chromatic split) -------------
  // One plane pixel in texture space, after the cover-fit crop and zoom.
  vec2 texel = ratio * zoom / uPlaneSizes;
  vec3 col = uBlur > 0.25 ? sampleBlurred(uv, texel) : texture2D(tMap, uv).rgb;

  // ---- duotone grade -------------------------------------------
  // Samples arrive in LINEAR space (the texture is tagged sRGB and decoded
  // on read), so lift to a perceptual curve before grading — otherwise a
  // mid-tone reads as 0.09 and the whole image crushes to black.
  float l = clamp(luma(col), 0.0, 1.0);
  l = pow(l, 1.0 / 2.2);                     // linear -> perceptual
  l = clamp((l - 0.06) / 0.78, 0.0, 1.0);    // levels
  l = pow(l, 0.90);                          // gamma
  vec3 duo = mix(uDark, uLight, l);
  duo = mix(duo, uAccent, smoothstep(0.50, 1.0, l) * 0.32);

  // Only hover pushes the image back toward full colour — the ink
  // deliberately leaves the grade alone.
  float colourMix = clamp(uColour + uHover * 0.85, 0.0, 1.0);
  vec3 finalCol = mix(duo, col, colourMix);

  // ---- colourless ink highlight --------------------------------
  finalCol += vec3(inkDensity) * 0.07 * uInkAmount;

  // ---- film grain, sized in device pixels ----------------------
  float g = hash12(gl_FragCoord.xy / max(uDpr, 1.0) + fract(uTime) * 91.7);
  finalCol += (g - 0.5) * uGrain;

  // ---- reveal mask: wipes upward as the texture lands ----------
  float wipe = smoothstep(0.0, 0.85, (uLoad * 1.6) - (1.0 - vUv.y));
  float alpha = wipe * uEnter * uOpacity;

  // Blurred cards lose their hard edge too, so they sink into the depth.
  vec2 px = vUv * uPlaneSizes;
  float edge = min(min(px.x, uPlaneSizes.x - px.x), min(px.y, uPlaneSizes.y - px.y));
  alpha *= smoothstep(0.0, uBlur * 1.5 + 0.001, edge);

  if (alpha <= 0.001) discard;

  gl_FragColor = vec4(finalCol, alpha);
}
