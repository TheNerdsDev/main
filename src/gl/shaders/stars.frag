varying float vAlpha;
varying float vKind;
varying float vFlash;
varying vec3  vColor;

void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d2 = dot(c, c);
  float a;
  vec3 col = vColor;

  if (vKind < 0.5) {
    // Dust: a soft round point.
    a = exp(-d2 * 30.0) * 1.4;
  } else {
    // Glitter star: hot core, soft halo and four light spikes.
    float core = exp(-d2 * 180.0) * 1.6;
    float halo = exp(-d2 * 30.0) * 0.38;
    float spikeX = exp(-abs(c.y) * 70.0) * exp(-abs(c.x) * 5.5);
    float spikeY = exp(-abs(c.x) * 70.0) * exp(-abs(c.y) * 5.5);
    a = core + halo + (spikeX + spikeY) * (0.4 + vFlash * 1.4);
    col = mix(col, vec3(1.0), core);
  }

  // Never show the square edge of the sprite.
  a *= smoothstep(0.25, 0.16, d2) * vAlpha;
  if (a < 0.003) discard;

  gl_FragColor = vec4(col, a);
}
