#include ./noise.glsl;

uniform sampler2D tMap;
uniform sampler2D tInk;
uniform vec2  uSizes;       // natural image size
uniform vec2  uPlaneSizes;  // plane size in px
uniform vec2  uRes;         // viewport in px
uniform float uHover;
uniform float uLoad;        // texture reveal 0..1
uniform float uEnter;       // page enter 0..1
uniform float uColour;      // 0 = black & white, 1 = full colour
uniform float uGrain;
uniform float uTime;
uniform float uInkAmount;
uniform float uDpr;
uniform float uOpacity;     // stack depth fade, 0..1
uniform float uBlur;        // stack depth-of-field radius, plane px
uniform float uLift;        // brightens the black & white grade, 0 = none
uniform vec4  uClip;        // only what's inside this box is drawn (device px, from the bottom left)
uniform float uFocus;       // where a frame wider than its picture keeps it: 0 = top, 0.5 = middle, 1 = bottom

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
  if (gl_FragCoord.x < uClip.x || gl_FragCoord.y < uClip.y || gl_FragCoord.x > uClip.z || gl_FragCoord.y > uClip.w) discard;

  // ---- cover-fit the texture inside the plane -------------------
  vec2 ratio = vec2(
    min((uPlaneSizes.x / uPlaneSizes.y) / (uSizes.x / uSizes.y), 1.0),
    min((uPlaneSizes.y / uPlaneSizes.x) / (uSizes.y / uSizes.x), 1.0)
  );
  vec2 uv = vec2(
    vUv.x * ratio.x + (1.0 - ratio.x) * 0.5,
    vUv.y * ratio.y + (1.0 - ratio.y) * (1.0 - uFocus)
  );

  // ---- hover zoom: about the middle of what's shown ---------------
  float zoom = 1.0 - uHover * 0.075;
  vec2 mid = vec2(0.5, (1.0 - ratio.y) * (1.0 - uFocus) + ratio.y * 0.5);
  uv = (uv - mid) * zoom + mid;

  // ---- sample -------------------------------------------------
  // One plane pixel in texture space, after the cover-fit crop and zoom.
  vec2 texel = ratio * zoom / uPlaneSizes;
  vec3 col = uBlur > 0.25 ? sampleBlurred(uv, texel) : texture2D(tMap, uv).rgb;

  // ---- black & white grade -------------------------------------
  // Samples arrive in LINEAR space (the texture is tagged sRGB and decoded
  // on read), and nothing after this converts back — what's written here
  // is what the screen shows. So both looks are made in display space:
  // the grade on a perceptual curve (or a mid-tone reads as 0.09 and the
  // whole image crushes to black), the photo re-encoded to sRGB so it
  // looks exactly like the file.
  float l = clamp(luma(col), 0.0, 1.0);
  l = pow(l, 1.0 / 2.2);                     // linear -> perceptual
  l = clamp((l - 0.06) / 0.78, 0.0, 1.0);    // levels
  l = pow(l, 0.90);                          // gamma
  // Lifts the shadows and mid-tones, leaving black and white where they are.
  l = 1.0 - pow(1.0 - l, 1.0 + uLift);
  vec3 mono = vec3(l);
  vec3 photo = mix(12.92 * col, 1.055 * pow(col, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, col));

  // Hover brings back the full original.
  float colourMix = clamp(uColour + uHover, 0.0, 1.0);
  vec3 finalCol = mix(mono, photo, colourMix);

  // ---- the cursor's white trail, as a soft lift (it doesn't bend it) --
  float inkDensity = clamp(texture2D(tInk, gl_FragCoord.xy / uRes).r, 0.0, 1.0);
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
