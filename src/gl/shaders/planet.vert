#include ./noise.glsl;

uniform float uTime;
uniform float uRadius;
uniform float uTerrainScale;
uniform float uTerrainHeight;
uniform float uTerrainDetail;
uniform vec3  uMouseLocal;     // pointer hit on the unit sphere, local space
uniform float uMouseRadius;
uniform float uMouseStrength;
uniform float uIntro;          // 0..1 settle on first reveal

varying vec3 vNormal;
varying vec3 vLocalNormal;
varying vec3 vWorldPos;
varying float vHeight;

float terrain(vec3 n) {
  vec3 p = n * uTerrainScale + vec3(0.0, 0.0, uTime * 0.035);
  float h = fbm(p, 5, 2.0, 0.5);
  h += fbm(p * 3.1, 3, 2.2, 0.45) * uTerrainDetail * 0.22;
  return h;
}

vec3 displace(vec3 n, out float height) {
  float h = terrain(n);
  // Pointer pushes a soft bulge out of the surface.
  float d = distance(n, uMouseLocal);
  float bulge = smoothstep(uMouseRadius, 0.0, d) * uMouseStrength;
  height = h;
  return n * (uRadius + h * uTerrainHeight * uIntro + bulge);
}

void main() {
  vec3 n = normalize(position);

  float h;
  vec3 displaced = displace(n, h);
  vHeight = h;

  // Rebuild the normal from two displaced neighbours.
  vec3 up = abs(n.y) > 0.95 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0);
  vec3 tangent = normalize(cross(n, up));
  vec3 bitangent = normalize(cross(n, tangent));

  float e = 0.014;
  float hx, hy;
  vec3 pt = displace(normalize(n + tangent * e), hx);
  vec3 pb = displace(normalize(n + bitangent * e), hy);

  vec3 nrm = normalize(cross(pt - displaced, pb - displaced));
  if (dot(nrm, n) < 0.0) nrm = -nrm;

  vLocalNormal = n;
  vNormal = normalize(normalMatrix * nrm);

  vec4 world = modelMatrix * vec4(displaced, 1.0);
  vWorldPos = world.xyz;

  gl_Position = projectionMatrix * viewMatrix * world;
}
