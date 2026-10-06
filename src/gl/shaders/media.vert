uniform float uSpeed;     // smoothed scroll velocity, -1..1
uniform float uHover;     // 0..1
uniform float uCurve;     // 0 = flat, 1 = bent around a cylinder
uniform float uEnter;     // page-enter progress 0..1

varying vec2 vUv;
varying float vDepth;

void main() {
  vUv = uv;

  // Displace in world space so a single unit plane can be scaled
  // to any size without distorting the effect.
  vec4 world = modelMatrix * vec4(position, 1.0);

  float tx = uv.x - 0.5;            // -0.5 .. 0.5 across width
  float ty = uv.y - 0.5;            // -0.5 .. 0.5 across height
  float arc = 1.0 - 4.0 * tx * tx;  // 1 at centre, 0 at the edges

  // Scroll velocity drags the edges behind the centre, like a sheet of film.
  world.y += uSpeed * arc * 48.0;

  // Hover lifts the middle of the plane toward the camera.
  world.z += uHover * 24.0 * arc * (1.0 - 4.0 * ty * ty);

  // Entering planes rise into place.
  world.y -= (1.0 - uEnter) * 90.0;

  // Curve mode wraps the layout around a large cylinder.
  float R = 1100.0;
  float theta = world.x / R;
  vec3 bent = vec3(R * sin(theta), world.y, world.z + R * (cos(theta) - 1.0));
  world.xyz = mix(world.xyz, bent, uCurve);

  vDepth = world.z;

  gl_Position = projectionMatrix * viewMatrix * world;
}
