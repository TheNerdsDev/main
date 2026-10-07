uniform float uTime;
uniform float uDpr;
uniform float uIntro;
attribute float aScale;   // core size, px
attribute float aSeed;
attribute float aKind;    // 0 = dust, 1 = glitter star
attribute vec3  aColor;
varying float vAlpha;
varying float vKind;
varying float vFlash;
varying vec3  vColor;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);

  // 0 for the nearest stars, 1 for the farthest.
  float depth = clamp((-mv.z - 2200.0) / 5200.0, 0.0, 1.0);

  // Slow twinkle, its own speed and phase per star.
  float tw = 0.62 + 0.38 * sin(uTime * (0.7 + aSeed * 1.8) + aSeed * 40.0);

  // Glitter: a short, sharp flare every few seconds.
  float flash = pow(0.5 + 0.5 * sin(uTime * (0.35 + aSeed * 0.8) + aSeed * 91.0), 14.0);

  vAlpha = tw * uIntro * mix(1.0, 0.6, depth);
  vKind = aKind;
  vFlash = flash * aKind;
  vColor = aColor;

  // The sprite is larger than the core so the glow and spikes have room.
  float size = aScale * mix(1.0, 0.75, depth);
  size *= aKind > 0.5 ? 10.0 + flash * 8.0 : 3.2;

  gl_PointSize = size * uDpr;
  gl_Position = projectionMatrix * mv;
}
