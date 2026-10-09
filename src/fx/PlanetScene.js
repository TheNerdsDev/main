import {
  WebGLRenderer, Scene, OrthographicCamera, DirectionalLight, HemisphereLight,
  SphereGeometry, RingGeometry, InstancedMesh, MeshStandardMaterial, ShaderMaterial,
  TextureLoader, Vector3, Vector2, Quaternion, Matrix4, Color,
  SRGBColorSpace, ACESFilmicToneMapping, RepeatWrapping,
  DoubleSide, BackSide, AdditiveBlending, DynamicDrawUsage
} from 'three';

/*
 * The planets of the closing shower, drawn with three.js.
 *
 * Each kind of body is one InstancedMesh (plus, where it has them, an
 * instanced cloud shell, atmosphere shell or ring), so a hundred-odd planets
 * cost a couple of dozen draw calls. Materials are physically based and
 * use real maps (Solar System Scope, CC BY 4.0):
 *
 *  - Earth: day colour, terrain normals, glossy oceans / matte land, a
 *    separate cloud shell that drifts faster than the ground and darkens it
 *    a little where it passes, and an atmosphere that glows at the limb.
 *  - Mercury, the Moon, Mars: cratered relief from normal maps; Mars with a
 *    thin dusty rim.
 *  - Venus: its cloud deck, slowly streaming.
 *  - Jupiter: bands that drift at different speeds by latitude.
 *  - Saturn: ring mesh in its equator.
 *  - Uranus (tipped on its side, faint rings) and Neptune, with soft haze.
 *
 * Every body has its real axial tilt and turns at its real relative rate
 * (Venus and Uranus backwards), scaled so even Jupiter turns calmly. One
 * warm key light comes from the upper left, so each planet shades off
 * towards its lower right; a strong fill keeps that shade soft — it never
 * goes much below 40% of the lit side, and there's no black night side.
 */

export const MERCURY = 1, VENUS = 2, EARTH = 3, MOON = 4, MARS = 5, JUPITER = 6, SATURN = 7, URANUS = 8, NEPTUNE = 9;

/* Axial tilt (degrees) and sidereal day (hours; negative = retrograde). */
const SPIN = {
  [MERCURY]: [0.03, 1407.6],
  [VENUS]: [177.4, -5832.5],
  [EARTH]: [23.44, 23.93],
  [MOON]: [6.68, 655.7],
  [MARS]: [25.19, 24.62],
  [JUPITER]: [3.13, 9.93],
  [SATURN]: [26.73, 10.66],
  [URANUS]: [97.77, -17.24],
  [NEPTUNE]: [28.32, 16.11]
};
/* Jupiter, the fastest, turns once in ~17 s; everything else in proportion. */
const FASTEST = 0.36;
const omega = (type) => (FASTEST * 9.93) / SPIN[type][1];
/* We look at the pile from a little above, so poles and rings open up. */
const INCLINE = 0.36;
const X_AXIS = new Vector3(1, 0, 0);
const Y_AXIS = new Vector3(0, 1, 0);
const Z_AXIS = new Vector3(0, 0, 1);

/* Where the light comes from (towards the light), as the Sun used to be: up-left, in front. */
const SUN = new Vector3(-0.62, 0.46, 0.63).normalize();

const texturesFor = (q) => ({
  earthDay: `/textures/planets/${q}/earth_day.jpg`,
  earthNormal: `/textures/planets/${q}/earth_normal.jpg`,
  earthRough: `/textures/planets/${q}/earth_rough.jpg`,
  earthClouds: `/textures/planets/${q}/earth_clouds.jpg`,
  moon: `/textures/planets/${q}/moon.jpg`,
  moonNormal: `/textures/planets/${q}/moon_normal.jpg`,
  mercury: `/textures/planets/${q}/mercury.jpg`,
  mercuryNormal: `/textures/planets/${q}/mercury_normal.jpg`,
  mars: `/textures/planets/${q}/mars.jpg`,
  marsNormal: `/textures/planets/${q}/mars_normal.jpg`,
  venus: `/textures/planets/${q}/venus_clouds.jpg`,
  jupiter: `/textures/planets/${q}/jupiter.jpg`,
  saturn: `/textures/planets/${q}/saturn.jpg`,
  saturnRing: `/textures/planets/${q}/saturn_ring.png`,
  uranus: `/textures/planets/${q}/uranus.jpg`,
  uranusRing: `/textures/planets/${q}/uranus_ring.png`,
  neptune: `/textures/planets/${q}/neptune.jpg`
});
/* Colour maps are sRGB; normals, roughness and cloud cover are data. */
const COLOUR = new Set(['earthDay', 'moon', 'mercury', 'mars', 'venus', 'jupiter', 'saturn', 'saturnRing', 'uranus', 'uranusRing', 'neptune']);
/* Maps that scroll sideways need to wrap. */
const WRAP = new Set(['venus', 'jupiter', 'earthClouds']);

/* Saturn's ring, as a fraction of the planet's radius (matches the ring map). */
const SATURN_RING = [1.13, 2.27];
const URANUS_RING = [1.6, 2.05];

/**
 * Atmosphere shell: a slightly larger sphere drawn from the inside and added
 * on top, brightest just outside the limb and fading outwards, and strongest
 * on the side facing the light.
 */
const atmosphere = (colour, scale, strength) => new ShaderMaterial({
  uniforms: {
    uColor: { value: new Color(colour) },
    uSun: { value: SUN.clone() },
    uLimb: { value: Math.sqrt(1 - 1 / (scale * scale)) },
    uStrength: { value: strength }
  },
  vertexShader: /* glsl */`
    varying vec3 vN;
    void main() {
      mat4 m = modelMatrix * instanceMatrix;
      vN = normalize(mat3(m) * normal);
      gl_Position = projectionMatrix * viewMatrix * m * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform vec3 uColor;
    uniform vec3 uSun;
    uniform float uLimb;
    uniform float uStrength;
    varying vec3 vN;
    void main() {
      vec3 n = normalize(vN);
      /* Seen from the front, the back of the shell: n.z runs from 0 at its
         outer edge to -uLimb where it meets the planet's edge. */
      float t = clamp(-n.z / uLimb, 0.0, 1.0);
      float glow = pow(t, 1.6) * (1.0 - smoothstep(0.92, 1.0, t) * 0.4);
      float a = glow * 0.7 * uStrength;
      gl_FragColor = vec4(uColor * a, a);
    }`,
  side: BackSide,
  blending: AdditiveBlending,
  transparent: true,
  depthWrite: false
});

/**
 * Small additions to the standard material, all lit by the same key light:
 *   clouds  faint shadows of the cloud shell on the ground
 *   rim     a soft haze at the limb (atmospheres seen edge-on)
 *   flow    Jupiter's bands sliding past each other
 */
const enhance = (material, shared, { clouds, rim, flow } = {}) => {
  material.onBeforeCompile = (sh) => {
    sh.uniforms.uSun = shared.sun;
    sh.uniforms.uTime = shared.time;
    let head = 'uniform vec3 uSun;\nuniform float uTime;\n';
    if (clouds) {
      sh.uniforms.uClouds = { value: clouds };
      sh.uniforms.uCloudShift = shared.cloudShift;
      head += 'uniform sampler2D uClouds;\nuniform float uCloudShift;\n';
    }
    if (rim) {
      sh.uniforms.uRim = { value: new Color(rim[0]) };
      sh.uniforms.uRimStrength = { value: rim[1] };
      head += 'uniform vec3 uRim;\nuniform float uRimStrength;\n';
    }
    let fs = head + sh.fragmentShader;
    if (flow) {
      fs = fs.replace('#include <map_fragment>', /* glsl */`
        #ifdef USE_MAP
          vec2 fuv = vMapUv;
          fuv.x += uTime * (0.0011 * sin(fuv.y * 31.0) + 0.0006 * sin(fuv.y * 11.0 + 1.3));
          diffuseColor *= texture2D( map, fuv );
        #endif`);
    }
    if (clouds) {
      fs = fs.replace('#include <map_fragment>', /* glsl */`
        #include <map_fragment>
        float cloudShade = texture2D( uClouds, vMapUv + vec2( uCloudShift + 0.004, 0.003 ) ).r;
        diffuseColor.rgb *= 1.0 - 0.3 * cloudShade;`);
    }
    if (rim) {
      fs = fs.replace('#include <emissivemap_fragment>', /* glsl */`
        #include <emissivemap_fragment>
        float fres = pow( 1.0 - clamp( normal.z, 0.0, 1.0 ), 3.0 );
        totalEmissiveRadiance += uRim * fres * uRimStrength;`);
    }
    sh.fragmentShader = fs;
  };
  material.customProgramCacheKey = () => JSON.stringify({ c: !!clouds, r: !!rim, f: !!flow });
};

/** A ring in the planet's equatorial plane, with UVs running across the ring (inner → outer). */
const ringGeometry = ([inner, outer], segments) => {
  const g = new RingGeometry(inner, outer, segments, 1);
  const pos = g.attributes.position;
  const uv = g.attributes.uv;
  const v = new Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    uv.setXY(i, (v.length() - inner) / (outer - inner), 0.5);
  }
  g.rotateX(-Math.PI / 2);
  return g;
};

/** A body's tilt: inclined towards us, then leaning by its axial tilt (direction from its seed). */
function tiltFor(type, seed) {
  const lean = (SPIN[type][0] * Math.PI) / 180 * (seed < 0.5 ? 1 : -1);
  /* Uranus lies on its side; swing its pole part-way towards us so its
     rings open into a tall ellipse instead of a thin edge-on line. */
  const yaw = type === URANUS ? 0.85 * (seed < 0.5 ? 1 : -1) : 0;
  return new Quaternion().setFromAxisAngle(X_AXIS, INCLINE)
    .multiply(new Quaternion().setFromAxisAngle(Y_AXIS, yaw))
    .multiply(new Quaternion().setFromAxisAngle(Z_AXIS, lean));
}

/**
 * The on-screen outline of a ringed planet's ring, in units of the planet's
 * radius: the ring is a flat disc, seen as an ellipse whose long axis lies
 * across its pole. Returns { ux, uy } (long axis, screen space, y down),
 * `major` and `minor` semi-axes — or null for a body without rings.
 */
export function ringShape(type, seed) {
  const ring = type === SATURN ? SATURN_RING : type === URANUS ? URANUS_RING : null;
  if (!ring) return null;
  const n = new Vector3(0, 1, 0).applyQuaternion(tiltFor(type, seed));
  const len = Math.hypot(n.x, n.y);
  /* Long axis perpendicular to the pole's direction on screen (world y is up, screen y down). */
  const ux = len > 1e-4 ? -n.y / len : 1;
  const uy = len > 1e-4 ? -n.x / len : 0;
  const major = ring[1];
  return { ux, uy, major, minor: major * Math.abs(n.z) };
}

export default class PlanetScene {
  /**
   * canvas   where to draw
   * small    phones and small screens: 1K maps, lighter geometry
   */
  constructor(canvas, { small = false } = {}) {
    this.small = small;
    this.renderer = new WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene = new Scene();
    this.camera = new OrthographicCamera(0, 1, 0, -1, -2000, 2000);
    this.camera.position.z = 1000;

    /* The key light, from the upper left. No cast shadows: planets don't darken each other. */
    this.light = new DirectionalLight(0xfff1de, 3.2);
    this.scene.add(this.light, this.light.target);
    /* A strong, near-neutral fill: the shaded side stays soft, never black. */
    this.scene.add(new HemisphereLight(0xf2f4ff, 0x8a8fa3, 0.85));

    this.shared = { sun: { value: SUN.clone() }, time: { value: 0 }, cloudShift: { value: 0 } };
    this.ready = false;
    this.meshes = {};
    this.m4 = new Matrix4();
    this.q = new Quaternion();
    this.qs = new Quaternion();
    this.qr = new Quaternion();
    this.v = new Vector3();
    this.s = new Vector3();
    this.zAxis = new Vector3(0, 0, 1);
    this.yAxis = new Vector3(0, 1, 0);
  }

  /** Load the maps and build the materials and meshes. Resolves once everything can draw. */
  load(capacity) {
    if (this.loading) return this.loading;
    const loader = new TextureLoader();
    const urls = texturesFor(this.small ? '1k' : '2k');
    const aniso = this.renderer.capabilities.getMaxAnisotropy();
    const tex = {};
    const jobs = Object.entries(urls).map(([key, url]) => loader.loadAsync(url).then((t) => {
      if (COLOUR.has(key)) t.colorSpace = SRGBColorSpace;
      if (WRAP.has(key)) t.wrapS = RepeatWrapping;
      t.anisotropy = aniso;
      tex[key] = t;
    }));
    this.loading = Promise.all(jobs).then(() => {
      this.tex = tex;
      this.build(capacity);
      this.ready = true;
    });
    return this.loading;
  }

  build(capacity) {
    const { tex, shared } = this;
    const fine = this.small ? [64, 48] : [96, 64];
    const light = this.small ? [48, 32] : [64, 48];
    const sphere = new SphereGeometry(1, fine[0], fine[1]);
    const sphereLight = new SphereGeometry(1, light[0], light[1]);
    this.geometries = [sphere, sphereLight];

    const make = (key, geometry, material, { count } = {}) => {
      const mesh = new InstancedMesh(geometry, material, count ?? capacity[key] ?? 0);
      mesh.instanceMatrix.setUsage(DynamicDrawUsage);
      mesh.frustumCulled = false;
      mesh.count = 0;
      this.scene.add(mesh);
      return mesh;
    };
    const std = (opts) => new MeshStandardMaterial({ metalness: 0, ...opts });
    const M = this.meshes;
    const cap = (t) => capacity[t] || 0;

    /* Earth */
    const earth = std({
      map: tex.earthDay,
      normalMap: tex.earthNormal,
      normalScale: new Vector2(1.1, 1.1),
      roughnessMap: tex.earthRough,
      roughness: 1
    });
    enhance(earth, shared, { clouds: tex.earthClouds, rim: [0x5d9bff, 0.55] });
    M[EARTH] = make(EARTH, sphere, earth, { count: cap(EARTH) });
    const clouds = std({ color: 0xffffff, alphaMap: tex.earthClouds, transparent: true, depthWrite: false, roughness: 1 });
    M.earthClouds = make(EARTH, sphere, clouds, { count: cap(EARTH) });
    M.earthAir = make(EARTH, sphereLight, atmosphere(0x6aa8ff, 1.075, 1.15), { count: cap(EARTH) });

    /* Rocky worlds */
    const moon = std({ map: tex.moon, normalMap: tex.moonNormal, normalScale: new Vector2(1.6, 1.6), roughness: 0.96 });
    M[MOON] = make(MOON, sphereLight, moon, { count: cap(MOON) });
    const mercury = std({ map: tex.mercury, normalMap: tex.mercuryNormal, normalScale: new Vector2(1.7, 1.7), roughness: 0.94 });
    M[MERCURY] = make(MERCURY, sphereLight, mercury, { count: cap(MERCURY) });
    const mars = std({ map: tex.mars, normalMap: tex.marsNormal, normalScale: new Vector2(1.4, 1.4), roughness: 0.92 });
    enhance(mars, shared, { rim: [0xd99a6c, 0.28] });
    M[MARS] = make(MARS, sphereLight, mars, { count: cap(MARS) });
    M.marsAir = make(MARS, sphereLight, atmosphere(0xe0a37a, 1.03, 0.45), { count: cap(MARS) });

    /* Venus: nothing but cloud from outside */
    const venus = std({ map: tex.venus, roughness: 0.88 });
    enhance(venus, shared, { rim: [0xffdca0, 0.5] });
    M[VENUS] = make(VENUS, sphere, venus, { count: cap(VENUS) });
    M.venusAir = make(VENUS, sphereLight, atmosphere(0xffd9a0, 1.06, 0.8), { count: cap(VENUS) });

    /* Giants */
    const jupiter = std({ map: tex.jupiter, roughness: 0.9 });
    enhance(jupiter, shared, { flow: true, rim: [0xf2d6b0, 0.3] });
    M[JUPITER] = make(JUPITER, sphere, jupiter, { count: cap(JUPITER) });
    const saturn = std({ map: tex.saturn, roughness: 0.9 });
    enhance(saturn, shared, { rim: [0xf6e3b8, 0.28] });
    M[SATURN] = make(SATURN, sphere, saturn, { count: cap(SATURN) });
    const ring = std({ map: tex.saturnRing, side: DoubleSide, transparent: true, alphaTest: 0.04, roughness: 0.85, depthWrite: false });
    const ringGeo = ringGeometry(SATURN_RING, this.small ? 96 : 160);
    M.saturnRing = make(SATURN, ringGeo, ring, { count: cap(SATURN) });
    const uranus = std({ map: tex.uranus, roughness: 0.9 });
    enhance(uranus, shared, { rim: [0xbff4ff, 0.45] });
    M[URANUS] = make(URANUS, sphere, uranus, { count: cap(URANUS) });
    const uRing = std({ map: tex.uranusRing, side: DoubleSide, transparent: true, alphaTest: 0.02, roughness: 0.9, depthWrite: false });
    const uRingGeo = ringGeometry(URANUS_RING, this.small ? 72 : 120);
    M.uranusRing = make(URANUS, uRingGeo, uRing, { count: cap(URANUS) });
    M.uranusAir = make(URANUS, sphereLight, atmosphere(0xaef0ff, 1.035, 0.55), { count: cap(URANUS) });
    const neptune = std({ map: tex.neptune, roughness: 0.9 });
    enhance(neptune, shared, { rim: [0x7fa8ff, 0.5] });
    M[NEPTUNE] = make(NEPTUNE, sphere, neptune, { count: cap(NEPTUNE) });
    M.neptuneAir = make(NEPTUNE, sphereLight, atmosphere(0x6f97ff, 1.035, 0.65), { count: cap(NEPTUNE) });

    this.geometries.push(ringGeo, uRingGeo);
  }

  resize(w, h) {
    this.w = w;
    this.h = h;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(w, h, false);
    const c = this.camera;
    c.left = 0;
    c.right = w;
    c.top = 0;
    c.bottom = -h;
    c.updateProjectionMatrix();
    /* The light looks at the middle of the section. */
    const target = this.v.set(w / 2, -h / 2, 0);
    this.light.target.position.copy(target);
    this.light.position.copy(target).addScaledVector(SUN, 1500);
  }

  /** Per-body tilt, decided once: the planet's axial tilt, leaning left or right, seen from a little above. */
  tiltOf(b) {
    if (!b.tilt) b.tilt = tiltFor(b.type, b.seed);
    return b.tilt;
  }

  render(bodies, time) {
    if (!this.ready) {
      this.renderer.clear();
      return;
    }
    const { shared, meshes: M, m4, q, qs, qr, v, s, zAxis, yAxis } = this;
    shared.time.value = time;
    /* Clouds run a little ahead of the ground. */
    const cloudExtra = 0.035;
    shared.cloudShift.value = -((time * cloudExtra) / (2 * Math.PI)) % 1;
    this.tex.venus.offset.x = (-time * 0.004) % 1;

    for (const key of Object.keys(M)) M[key].count = 0;
    const put = (mesh, quat, scale) => {
      m4.compose(v, quat, s.set(scale, scale, scale));
      mesh.setMatrixAt(mesh.count++, m4);
    };

    for (const b of bodies) {
      if (!b.live) continue;
      const r = b.size;
      v.set(b.x, -b.y, 0);
      /* roll (from the physics) · tilt · spin about the planet's own axis.
         Ringed planets slide rather than tumble: rolled over, a ring would
         turn its unlit face to us and vanish against the sky. */
      qr.setFromAxisAngle(zAxis, b.type === SATURN || b.type === URANUS ? 0 : b.rot);
      const tilt = this.tiltOf(b);
      qs.setFromAxisAngle(yAxis, time * omega(b.type) + b.seed * 6.283);
      q.copy(qr).multiply(tilt).multiply(qs);
      put(M[b.type], q, r);
      switch (b.type) {
        case EARTH:
          qs.setFromAxisAngle(yAxis, time * (omega(EARTH) + cloudExtra) + b.seed * 6.283);
          put(M.earthClouds, qr.clone().multiply(tilt).multiply(qs), r * 1.008);
          put(M.earthAir, q, r * 1.075);
          break;
        case MARS:
          put(M.marsAir, q, r * 1.03);
          break;
        case VENUS:
          put(M.venusAir, q, r * 1.06);
          break;
        case SATURN:
          put(M.saturnRing, qr.clone().multiply(tilt), r);
          break;
        case URANUS:
          put(M.uranusRing, qr.clone().multiply(tilt), r);
          put(M.uranusAir, q, r * 1.035);
          break;
        case NEPTUNE:
          put(M.neptuneAir, q, r * 1.035);
          break;
        default:
      }
    }
    for (const key of Object.keys(M)) M[key].instanceMatrix.needsUpdate = true;
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.geometries?.forEach((g) => g.dispose());
    Object.values(this.meshes).forEach((m) => {
      m.material.dispose();
      m.dispose();
    });
    Object.values(this.tex || {}).forEach((t) => t.dispose());
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
