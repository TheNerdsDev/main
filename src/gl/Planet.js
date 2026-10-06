import {
  Mesh, SphereGeometry, ShaderMaterial, Vector3, Vector2, Color, BackSide, FrontSide
} from 'three';
import gsap from 'gsap';
import store from '../core/Store.js';
import assets from '../core/Assets.js';
import { PALETTE } from './World.js';

import vertexShader from './shaders/planet.vert';
import fragmentShader from './shaders/planet.frag';

/** The displaced sphere the whole site sits in front of. */
export default class Planet {
  constructor(world) {
    this.world = world;

    const segments = store.isMobile ? 96 : 160;
    this.geometry = new SphereGeometry(1, segments, segments);

    this.uniforms = {
      uTime:           world.uniforms.uTime,
      uRes:            world.uniforms.uRes,
      uIntro:          world.uniforms.uIntro,
      uInkAmount:      world.uniforms.uInkAmount,
      tInk:            world.uniforms.tInk,
      uAccent:         world.uniforms.uAccent,
      uDark:           world.uniforms.uDark,
      uLight:          world.uniforms.uLight,

      tSurface:        { value: null },
      uRadius:         { value: 1 },
      uTerrainScale:   { value: 3.6 },
      uTerrainHeight:  { value: 0.040 },
      uTerrainDetail:  { value: 0.26 },
      uMouseLocal:     { value: new Vector3(0, 0, 10) },
      uMouseRadius:    { value: 0.55 },
      uMouseStrength:  { value: 0 },

      uBrightness:     { value: 1 },
      uRimPow:         { value: 4.2 },
      uRimStr:         { value: 0.55 },
      uGlowPow:        { value: 3.0 },
      uGlowStr:        { value: 0.95 },
      uGlowBiasX:      { value: -0.65 },
      uGlowBiasY:      { value: 0.1 },
      uLightStart:     { value: 0.35 },
      uLightEnd:       { value: 1.0 }
    };

    this.material = new ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: this.uniforms,
      side: FrontSide,
      transparent: false
    });

    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    world.scene.add(this.mesh);

    /* Angular drift, nudged by the pointer. */
    this.rotation = { x: 0, y: 0 };
    this.velocity = { x: 0, y: 0 };
    this.hoverStrength = 0;
    this.targetStrength = 0;
    this.hitLocal = new Vector3(0, 0, 10);
    this.smoothLocal = new Vector3(0, 0, 10);

    assets.load('/textures/surface.jpg', { srgb: true, wrap: true }).then((entry) => {
      if (entry) this.uniforms.tSurface.value = entry.texture;
    });

    this.applyPreset(null, true);
  }

  applyPreset(preset, immediate = false) {
    if (!preset) return;
    const { position, scale, uniforms } = preset;
    const dur = immediate ? 0 : 1.6;
    const ease = 'power3.inOut';

    gsap.to(this.mesh.position, { ...position, duration: dur, ease, overwrite: 'auto' });
    gsap.to(this.mesh.scale, { x: scale, y: scale, z: scale, duration: dur, ease, overwrite: 'auto' });

    Object.entries(uniforms || {}).forEach(([key, value]) => {
      if (!this.uniforms[key]) return;
      gsap.to(this.uniforms[key], { value, duration: dur, ease, overwrite: 'auto' });
    });
  }

  /** Raycast the pointer onto the sphere and bulge the terrain there. */
  updatePointer(raycaster) {
    if (store.isTouch) return;
    const hit = raycaster.intersectObject(this.mesh, false)[0];

    if (hit) {
      this.mesh.worldToLocal(this.hitLocal.copy(hit.point)).normalize();
      this.targetStrength = 0.09;
      this.velocity.y += store.mouse.x * 0.00018;
      this.velocity.x += store.mouse.y * 0.00012;
    } else {
      this.targetStrength = 0;
    }
  }

  resize() {}

  loop() {
    /* Ease the bulge in and out so it never pops. */
    this.hoverStrength += (this.targetStrength - this.hoverStrength) * 0.07;
    this.uniforms.uMouseStrength.value = this.hoverStrength;

    this.smoothLocal.lerp(this.hitLocal, 0.12);
    this.uniforms.uMouseLocal.value.copy(this.smoothLocal);

    /* Constant slow spin, plus whatever the pointer added, damped. */
    this.velocity.x *= 0.94;
    this.velocity.y *= 0.94;
    this.rotation.x += this.velocity.x;
    this.rotation.y += this.velocity.y + 0.0004;

    this.mesh.rotation.x = this.rotation.x;
    this.mesh.rotation.y = this.rotation.y;
  }

  destroy() {
    this.world.scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
