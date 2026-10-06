#include ./noise.glsl;

uniform sampler2D tSurface;
uniform sampler2D tInk;
uniform vec3  uDark;
uniform vec3  uLight;
uniform vec3  uAccent;
uniform vec2  uRes;
uniform float uTime;
uniform float uRimPow;
uniform float uRimStr;
uniform float uGlowPow;
uniform float uGlowStr;
uniform float uGlowBiasX;
uniform float uGlowBiasY;
uniform float uLightStart;
uniform float uLightEnd;
uniform float uIntro;
uniform float uBrightness;
uniform float uInkAmount;

varying vec3 vNormal;
varying vec3 vLocalNormal;
varying vec3 vWorldPos;
varying float vHeight;

void main() {
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float facing = max(dot(normalize(vNormal), viewDir), 0.0);

  // Rim light around the silhouette.
  float rim  = pow(1.0 - facing, uRimPow);
  float glow = pow(1.0 - facing, uGlowPow);

  // Push the corona off to one side so the light reads directional.
  vec3 biasDir = normalize(vec3(uGlowBiasX, uGlowBiasY, 0.6));
  float bias = max(dot(normalize(vNormal), biasDir), 0.0);
  float biasGlow = pow(bias, 3.0);

  // Warmth gradient from the surface orientation.
  float warmth = vLocalNormal.y * 0.5 + 0.5;
  vec3 baseCol = mix(uDark, uLight, smoothstep(uLightStart, uLightEnd, warmth));

  // Height shading plus a slow surface texture crawl.
  float shade = smoothstep(-1.2, 1.4, vHeight);
  vec3 surf = texture2D(tSurface, vLocalNormal.xy * 0.5 + 0.5 + vec2(uTime * 0.004, 0.0)).rgb;
  baseCol = mix(baseCol * 0.55, baseCol, shade);
  baseCol *= 0.75 + surf.r * 0.5;

  // Corona.
  vec3 col = baseCol;
  col += baseCol * glow * uGlowStr;
  col += uLight  * rim  * uRimStr;
  col += uAccent * biasGlow * 0.35;

  // Ink lifts the surface without tinting it.
  vec2 screenUv = gl_FragCoord.xy / uRes;
  float ink = clamp(texture2D(tInk, screenUv).r, 0.0, 1.0);
  col += vec3(ink) * 0.10 * uInkAmount;

  col *= uIntro * uBrightness;

  gl_FragColor = vec4(col, 1.0);
}
