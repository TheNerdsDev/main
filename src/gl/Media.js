import { PlaneGeometry, Group } from 'three';
import gsap from 'gsap';
import store from '../core/Store.js';
import MediaMesh from './MediaMesh.js';

/* How far the pointer swings the whole stack. Kept small: the stack's
   motion comes from scroll, the pointer only adds a hint of parallax. */
const POINTER = { rotY: 0.035, rotX: 0.02, posX: -10, posZ: -6 };
/* The gap between one index-rail preview and the next along its strip, px. */
const PREVIEW_GAP = 8;

/**
 * Creates and owns every MediaMesh on the current page.
 *
 * Not on a touch screen (phones: Store isPhone, below; tablets: `dom`):
 * there the pictures are the page's own images,
 * drawn by the browser — sharp at the screen's full resolution (the world
 * draws at less, store.setDpr), in their own colours, with no grain over
 * the small print in them, and nothing for a phone's GPU to draw. (Nor is
 * there a pointer for the planes' hover to answer.) They fade in and out
 * with the page instead.
 */
export default class Media {
  constructor(world) {
    this.world = world;
    this.dom = store.isTouch;
    store.html.classList.toggle('dom-media', this.dom);
    /* One shared unit plane (flat: nothing bends it). */
    this.geometry = new PlaneGeometry(1, 1);
    this.meshes = [];
    this.cards = [];
    this.previews = [];
    this.imgs = [];

    /* Cards live in their own group so the pointer can swing the whole set. */
    this.group = new Group();
    world.scene.add(this.group);
  }

  create(root = document, pageId = 'main') {
    this.destroyMeshes();
    /* Phones show the photos as the images themselves (Store isPhone,
       html.flat-media): no planes. */
    if (store.isPhone) {
      this.meshes = [];
      return this.meshes;
    }

    const isHome = pageId === 'projects';
    const colour = isHome ? 0 : 0.88;
    const nodes = [...root.querySelectorAll('[data-media]')];

    if (this.dom) {
      this.imgs = nodes.map((el) => {
        const img = el.querySelector('.media');
        if (!img) return null;
        /* Kept where the frame keeps it (data-focus, as MediaMesh does). */
        const focus = parseFloat(el.dataset.focus);
        if (Number.isFinite(focus)) img.style.objectPosition = `50% ${Math.min(1, Math.max(0, focus)) * 100}%`;
        gsap.set(img, { opacity: 0 });
        return img;
      }).filter(Boolean);
      return this.meshes;
    }

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
    if (this.imgs.length) {
      gsap.to(this.imgs, { opacity: 1, duration: 0.9, ease: 'power2.out', stagger: 0.055, delay: 0.1, overwrite: 'auto' });
    }
    this.meshes
      .filter((m) => !m.isPreview)
      .forEach((m, i) => m.enter(i * 0.055));
    /* The index rail's previews come in together, a little after the
       cards; which one shows is the wheel's doing (placePreviews). */
    this.previews.forEach((m) => m.enter(0.5));
  }

  leave() {
    const imgs = this.imgs.length
      ? gsap.to(this.imgs, { opacity: 0, duration: 0.4, ease: 'power2.in', overwrite: 'auto' }).then(() => {})
      : null;
    return Promise.all([...this.meshes.map((m) => m.leave()), imgs]);
  }

  /** Hover a card from outside — used by the project index rail. */
  hoverIndex(index) {
    this.cards.forEach((m) => {
      const pi = m.el.closest('a, button')?.dataset?.project;
      if (pi === undefined) return;
      m.setHover(Number(pi) === index);
    });
  }

  /**
   * Slide the index rail's previews along the work wheel: `rels[i]` is
   * how far preview i is from the frame, in frames (0 = in it, 1 = a frame
   * below). Each is shifted that far (and a gap more) and the frame shows
   * only what's inside it — so the strip moves exactly as the cards do.
   */
  placePreviews(rels) {
    for (const m of this.previews) {
      const rel = rels[Number(m.el.dataset.preview)];
      if (rel === undefined) continue;
      m.rel = rel;
      m.dy = rel * (m.bounds.height + PREVIEW_GAP);
    }
  }

  /** The rail has moved (it slides in): measure the previews again. */
  remeasurePreviews() {
    this.previews.forEach((m) => m.resize());
  }

  resize() {
    this.meshes.forEach((m) => m.resize());
  }

  loop() {
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

    this.meshes.forEach((m) => m.loop());

    /* Tell the composite where the photos of us are, so the cursor's
       trail leaves them be (MediaMesh `still`); the rest are parked off
       screen. */
    const rects = this.world.compositeMaterial.uniforms.uStill.value;
    let n = 0;
    for (const m of this.meshes) {
      if (n === rects.length) break;
      if (m.still && m.isVisible) m.screenRect(rects[n++]);
    }
    for (; n < rects.length; n++) rects[n].set(-9, -9, -9, -9);
  }

  destroyMeshes() {
    gsap.killTweensOf(this.imgs);
    this.imgs = [];
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
