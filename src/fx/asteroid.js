import { IcosahedronGeometry, BufferAttribute, Vector3, MeshStandardMaterial } from 'three';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import noiseGLSL from '../gl/shaders/noise.glsl';

/* ---------------------------------------------------------------- noise */

/** Small seeded PRNG so every rock is reproducible from its seed. */
export const prng = (seed) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Classic 3D gradient noise with a seeded permutation, roughly -1..1. */
const makeNoise = (rand) => {
  const p = new Uint8Array(512);
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];

  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a, b, t) => a + (b - a) * t;
  const grad = (h, x, y, z) => {
    const g = h & 15;
    const u = g < 8 ? x : y;
    const v = g < 4 ? y : g === 12 || g === 14 ? x : z;
    return ((g & 1) ? -u : u) + ((g & 2) ? -v : v);
  };

  return (x, y, z) => {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    x -= Math.floor(x); y -= Math.floor(y); z -= Math.floor(z);
    const u = fade(x); const v = fade(y); const w = fade(z);
    const A = p[X] + Y; const AA = p[A] + Z; const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y; const BA = p[B] + Z; const BB = p[B + 1] + Z;
    return lerp(
      lerp(lerp(grad(p[AA], x, y, z), grad(p[BA], x - 1, y, z), u),
        lerp(grad(p[AB], x, y - 1, z), grad(p[BB], x - 1, y - 1, z), u), v),
      lerp(lerp(grad(p[AA + 1], x, y, z - 1), grad(p[BA + 1], x - 1, y, z - 1), u),
        lerp(grad(p[AB + 1], x, y - 1, z - 1), grad(p[BB + 1], x - 1, y - 1, z - 1), u), v),
      w
    );
  };
};

const fbm = (noise, x, y, z, octaves) => {
  let sum = 0;
  let amp = 1;
  let f = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x * f, y * f, z * f) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2.07;
  }
  return sum / norm;
};

/* ------------------------------------------------------------- asteroid */

/**
 * A procedural asteroid: an elongated, lumpy body with layered surface
 * noise, impact craters (a sunken bowl with a raised rim) and colour
 * variation — darker regolith in the crater floors, paler dust on the
 * ridges, a few rust and slate patches. Unit radius before scaling.
 *
 *   detail   icosphere subdivisions (4 ≈ 2.5k vertices)
 *   craters  how many craters to punch in
 *   rough    surface noise strength
 *   chunk    a broken fragment: blockier, flat-shaded, no craters
 */
export const makeAsteroid = ({ seed = 1, detail = 4, craters = 10, rough = 1, chunk = false } = {}) => {
  const rand = prng(seed);
  const noise = makeNoise(rand);

  let geo = new IcosahedronGeometry(1, detail);
  geo.deleteAttribute('normal');
  geo.deleteAttribute('uv');
  geo = mergeVertices(geo);

  const stretch = chunk
    ? new Vector3(0.7 + rand() * 0.6, 0.45 + rand() * 0.4, 0.5 + rand() * 0.5)
    : new Vector3(1, 0.66 + rand() * 0.24, 0.55 + rand() * 0.25);

  const unit = () => new Vector3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1).normalize();

  /* Impact craters: a couple of big old basins, many small fresh pits. */
  const holes = Array.from({ length: chunk ? 0 : craters }, (_, i) => {
    const big = i < 2;
    return { d: unit(), r: big ? 0.42 + rand() * 0.2 : 0.08 + rand() * 0.2, depth: big ? 0.15 + rand() * 0.06 : 0.06 + rand() * 0.07 };
  });

  /* Fracture planes: flat faces where the body once split. Points past a
     plane are pulled back onto it. */
  const cuts = Array.from({ length: chunk ? 4 : 3 }, () => ({ n: unit(), d: chunk ? 0.5 + rand() * 0.3 : 0.72 + rand() * 0.16 }));

  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const v = new Vector3();
  const o = rand() * 100;

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).normalize();

    /* Lumps → bumps → ridges. */
    let h = noise(v.x * 1.1 + o, v.y * 1.1, v.z * 1.1) * 0.32 * rough;
    h += fbm(noise, v.x * 2.8 + o, v.y * 2.8, v.z * 2.8, 4) * 0.16 * rough;
    h += (1 - Math.abs(noise(v.x * 7 + o, v.y * 7, v.z * 7))) * 0.05 * rough;
    if (chunk) h += (rand() - 0.5) * 0.06;

    let floor = 0;
    for (const c of holes) {
      const ang = Math.acos(Math.max(-1, Math.min(1, v.dot(c.d))));
      const d = ang / c.r;
      if (d < 1.6) {
        if (d < 1) {
          h += (d * d - 1) * c.depth;
          floor = Math.max(floor, 1 - d);
        }
        h += c.depth * 0.5 * Math.exp(-Math.pow((d - 1) / 0.2, 2));
      }
    }

    let r = 1 + h;
    for (const c of cuts) {
      const along = v.dot(c.n) * r;
      if (along > c.d) r *= c.d / along;
    }
    pos.setXYZ(i, v.x * r * stretch.x, v.y * r * stretch.y, v.z * r * stretch.z);

    /* Colour: grey-brown regolith with patches, dark crater floors and
       paler high ground. Values are linear. */
    const tone = 0.5 + fbm(noise, v.x * 3.4 + 40, v.y * 3.4, v.z * 3.4, 3) * 0.9;
    const rust = Math.max(0, noise(v.x * 1.7 + 70, v.y * 1.7, v.z * 1.7)) * 0.5;
    const speck = Math.pow(Math.max(0, noise(v.x * 22 + 9, v.y * 22, v.z * 22)), 3) * 1.6;
    let cr = 0.12 + tone * 0.13 + rust * 0.07 + speck * 0.08;
    let cg = 0.11 + tone * 0.12 + rust * 0.035 + speck * 0.08;
    let cb = 0.10 + tone * 0.11 + speck * 0.08;
    const shade = 1 - floor * 0.45 + Math.max(0, h) * 0.6;
    colors[i * 3] = cr * shade;
    colors[i * 3 + 1] = cg * shade;
    colors[i * 3 + 2] = cb * shade;
  }

  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
};

/*
 * Per-pixel rock surface: a procedural height field (grain, ridges, pits)
 * bent into the normal with Mikkelsen's surface-gradient method — the same
 * maths three.js uses for bump maps, minus the texture — plus speckled,
 * crevice-darkened albedo. This is what makes a rock look like rock up
 * close rather than a smooth clay lump.
 */
const ROCK_GLSL = `
float rockH(vec3 p) {
  p += uSeed;
  float h = fbm(p * 4.0, 4, 2.1, 0.5) * 0.5;
  h += (1.0 - abs(snoise(p * 13.0))) * 0.28;
  h += snoise(p * 24.0) * 0.06;
  /* Small pits: the low points of a sharpened noise. */
  h -= pow(max(0.0, -snoise(p * 9.0 + 3.1)), 3.0) * 0.6;
  return h;
}
vec3 rockAlbedo(vec3 p) {
  vec3 q = p + uSeed;
  float grain = snoise(q * 46.0) * 0.5 + 0.5;
  float blotch = fbm(q * 2.6 + 7.0, 3, 2.0, 0.5);
  float crevice = smoothstep(-0.35, 0.3, rockH(p));
  return vec3(0.72 + grain * 0.4) * (0.82 + blotch * 0.35) * mix(0.45, 1.05, crevice);
}
vec3 rockPerturb(vec3 surfPos, vec3 surfNorm, float faceDir, float h) {
  /* Ease the relief off towards the silhouette, where fine detail would
     only alias into speckle. */
  float facing = clamp(dot(surfNorm, normalize(-surfPos)) * 2.5, 0.0, 1.0);
  vec2 dHdxy = vec2(dFdx(h), dFdy(h)) * uBump * facing;
  vec3 sx = normalize(dFdx(surfPos));
  vec3 sy = normalize(dFdy(surfPos));
  vec3 r1 = cross(sy, surfNorm);
  vec3 r2 = cross(surfNorm, sx);
  float det = dot(sx, r1) * faceDir;
  vec3 grad = sign(det) * (dHdxy.x * r1 + dHdxy.y * r2);
  return normalize(abs(det) * surfNorm - grad);
}
`;

/** Dusty, non-metallic rock. Chunks are flat-shaded so the breaks read sharp. */
export const rockMaterial = (chunk = false, { bump = 1, seed = 0 } = {}) => {
  const m = new MeshStandardMaterial({ vertexColors: true, roughness: 0.94, metalness: 0, flatShading: chunk });
  /* Kept on the material so callers can vary them per draw (e.g. a new
     surface for each rock sharing the material). */
  m.userData.rock = { uBump: { value: bump }, uSeed: { value: seed } };
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBump = m.userData.rock.uBump;
    shader.uniforms.uSeed = m.userData.rock.uSeed;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRockPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRockPos = position;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vRockPos;
uniform float uBump;
uniform float uSeed;
${noiseGLSL}
${ROCK_GLSL}`)
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= rockAlbedo(vRockPos);')
      .replace('#include <normal_fragment_maps>', '#include <normal_fragment_maps>\n  normal = rockPerturb(-vViewPosition, normal, faceDirection, rockH(vRockPos));');
  };
  m.customProgramCacheKey = () => (chunk ? 'rock-chunk' : 'rock');
  return m;
};
