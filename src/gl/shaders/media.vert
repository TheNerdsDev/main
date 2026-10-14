uniform float uEnter;     // page-enter progress 0..1

varying vec2 vUv;
varying float vDepth;

void main() {
  vUv = uv;

  // Displace in world space so a single unit plane can be scaled
  // to any size without distorting the effect.
  vec4 world = modelMatrix * vec4(position, 1.0);

  // (Flat and still: no bending with the scroll or under the pointer.)

  // Entering planes rise into place.
  world.y -= (1.0 - uEnter) * 90.0;


  vDepth = world.z;

  gl_Position = projectionMatrix * viewMatrix * world;
}
