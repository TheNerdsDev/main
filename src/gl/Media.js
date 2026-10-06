import { PlaneGeometry, Group } from 'three';
import gsap from 'gsap';
import store from '../core/Store.js';
import MediaMesh from './MediaMesh.js';

/* How far the pointer swings the whole stack. Kept small: the stack's
   motion comes from scroll, the pointer only adds a hint of parallax. */
const POINTER = { rotY: 0.035, rotX: 0.02, posX: -10, posZ: -6 };

/** Creates and owns every MediaMesh on the current page. */
export default class Media {
  constructor(world) {
    this.world = world;
    /* One shared, subdivided unit plane — enough segments to bend smoothly. */
    this.geometry = new PlaneGeometry(1, 1, 32, 24);
    this.meshes = [];
    this.cards = [];
    this.previews = [];
    this.speed = 0;
    this.targetSpeed = 0;

    /* Cards live in their own group so the pointer can swing the whole set. */
    this.group = new Group();
    world.scene.add(this.group);
  }

  create(root = document, pageId = 'main') {
    this.destroyMeshes();

    const isHome = pageId === 'projects';
    const colour = isHome ? 0 : 0.88;
    const nodes = [...root.querySelectorAll('[data-media]')];

    this.meshes = nodes.map((el, i) => {
      const isPreview = el.hasAttribute('data-preview');
      const trigger = el.closest('a, button') || el;
      const projectIndex = trigger.dataset?.project;
      const isCard = isHome && !isPreview && projectIndex !== undefined;


      const mesh = new MediaMesh({
        el,
        world: this.world,
        geometry: this.geometry,
        colour: isPreview ? 0.95 : colour,
        index: i,
        /* Home cards are placed by the page's stack model, not their DOM box. */
        stack: isCard ? Number(projectIndex) : null,
        parent: isCard ? this.group : null,
        fixed: isPreview,
        isPreview
      });

      if (isPreview) {
        this.previews.push(mesh);
        return mesh;
      }
      if (isCard) this.cards.push(mesh);

      if (!store.isTouch) {
        const over = () => {
          mesh.setHover(true);
          if (projectIndex !== undefined) {
            store.emitter.emit('project:hover', Number(projectIndex));
          }
        };
        const out = () => {
          mesh.setHover(false);
          if (projectIndex !== undefined) {
            store.emitter.emit('project:hover', -1);
          }
        };
        trigger.addEventListener('pointerenter', over);
        trigger.addEventListener('pointerleave', out);
        mesh._cleanup = () => {
          trigger.removeEventListener('pointerenter', over);
          trigger.removeEventListener('pointerleave', out);
        };
      }

      return mesh;
    });

    return this.meshes;
  }

  enter() {
    /* Previews are driven by the index rail, not the page-enter stagger. */
    this.meshes
      .filter((m) => !m.isPreview)
      .forEach((m, i) => m.enter(i * 0.055));
  }

  leave() {
    return Promise.all(this.meshes.map((m) => m.leave()));
  }

  /** Hover a card from outside — used by the project index rail. */
  hoverIndex(index) {
    this.cards.forEach((m) => {
      const pi = m.el.closest('a, button')?.dataset?.project;
      if (pi === undefined) return;
      m.setHover(Number(pi) === index);
    });
  }

  /** Show the preview thumbnail for a project, or none when index is -1. */
  showPreview(index) {
    this.previews.forEach((m) => {
      m.toggle(Number(m.el.dataset.preview) === index);
    });
  }

  resize() {
    this.meshes.forEach((m) => m.resize());
  }

  loop() {
    /* Normalise and smooth Lenis velocity into a -1..1 band. */
    this.targetSpeed = Math.max(-1, Math.min(1, store.velocity * 0.013));
    this.speed += (this.targetSpeed - this.speed) * 0.09;

    /* The pointer swings the whole stack a few degrees — the motion that
       makes the cards read as objects in a space rather than a flat list. */
    if (!store.isTouch) {
      const g = this.group;
      const k = 0.07;
      g.rotation.y += (store.mouse.x * POINTER.rotY - g.rotation.y) * k;
      g.rotation.x += (store.mouse.y * POINTER.rotX - g.rotation.x) * k;
      g.position.x += (store.mouse.x * POINTER.posX - g.position.x) * k;
      g.position.z += (store.mouse.y * POINTER.posZ - g.position.z) * k;
    }

    this.meshes.forEach((m) => m.loop(this.speed));
  }

  destroyMeshes() {
    this.meshes.forEach((m) => {
      m._cleanup?.();
      m.destroy();
    });
    this.meshes = [];
    this.cards = [];
    this.previews = [];
  }

  destroy() {
    this.destroyMeshes();
    this.world.scene.remove(this.group);
    this.geometry.dispose();
  }
}
