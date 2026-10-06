# The Nerds — Creative Studio Portfolio

A WebGL-driven portfolio site. Three.js renders the background world and every
project image; GSAP drives the motion; Lenis handles smooth scroll; a small
custom router swaps pages without ever tearing down the canvas.

Built with the same techniques as high-end studio sites — custom shaders,
DOM-synced image planes, a cursor-driven ink trail, a real preloader — but all
the code, copy and imagery here is original and yours to change.

---

## Quick start

```bash
npm install     # run this first on each machine — see "Platform note"
npm run dev     # http://localhost:5173
npm run build   # production bundle into dist/
npm run preview # serve the built site
```

### Platform note

`node_modules` holds platform-specific binaries (esbuild, rollup). If you ever
move this folder between Windows, macOS and Linux, delete `node_modules` and run
`npm install` again on the new machine, or the build will fail with a missing
binary error.

---

## Making it yours

Nearly everything lives in **one file**: `src/content/site.js`.

| What | Where |
|---|---|
| Studio name, email, availability, socials | `studio` in `src/content/site.js` |
| Landing page headline, subtext, About copy, button label, the four rocks | `main` |
| The two of us: sketches, neon colours, eye / hit points, About photos | `team` |
| Work index headline and intro | `workIndex` |
| About page copy, services, stack | `info` |
| Projects (name, year, role, description, accent colour) | `projects` |
| Colours, spacing, type scale | `:root` in `src/styles/base.css` |

After editing content, run `npm run pages` (or just `npm run dev` / `npm run
build`, which do it for you) to regenerate the HTML routes.

### The headline

Each line of a display heading is pre-split and revealed behind its own mask, so
**every line must fit on one visual row**. If a line wraps, the mask clips it.
Keep headline lines short, or lower the font size in the phone/tablet blocks at
the bottom of `src/styles/pages.css`.

### Routes

| Path | Page | Class |
|---|---|---|
| `/` | Landing — welcome, the two neon sketches, About | `src/pages/Main.js` |
| `/work/` | Work index — the scrolling card stack | `src/pages/Projects.js` |
| `/work/<slug>/` | Case study | `src/pages/Work.js` |
| `/info/` | About / info | `src/pages/Info.js` |

### Swapping in your own sketches

The sketches in `public/media/team/*-sketch.svg` are placeholders. To use real
ones, drop the files in (PNG, JPG or SVG) and update each entry in `team`:

- `sketch` — the file path; `aspect` — width ÷ height of the drawing
- `ink` — `'dark'` for pencil on white paper (the paper is keyed out),
  `'light'` for light lines on a transparent or dark background
- `eyes` — the centre of each eye, as fractions of the drawing (0..1 from the
  top-left); `eyeR` is the eye radius as a fraction of the width
- `face` — where the expressions pull: `brows` (inner brow ends),
  `browsOuter` (outer ends), `mouth` (its centre) and `corners`. Measure
  these on the new drawing — hurt, angry and sad are built from them
- `hit` (where a rock strikes and the blood starts) and `hand` (where a
  thrown rock leaves from)

Then run `npm run pages`. The neon colour comes from `colour`.

The About photos (`photos`, three per person, shown in order with the last one
staying) are placeholders too — replace the files or change the paths.

### Replacing the imagery

The placeholder images are generated abstracts. Swap in real screenshots at the
same paths and nothing else needs touching:

```
public/media/<slug>/featured.jpg   # index card + case-study hero
public/media/<slug>/01.jpg         # detail shots
public/media/<slug>/02.jpg
public/media/<slug>/03.jpg
public/media/studio/portrait.jpg   # about page
```

Regenerate the placeholders any time with `python3 scripts/generate_media.py`.

---

## Structure

```
src/
  content/site.js      Single source of truth for all copy and projects
  core/
    App.js             Boots everything, owns the render loop and transitions
    Store.js           Viewport, device, scroll, pointer, flags
    Scroll.js          Lenis, driven off the GSAP ticker
    Router.js          Fetch + swap pages, canvas survives navigation
    Loader.js          Preloader with a real progress counter
    Assets.js          Shared texture cache, deduped in-flight loads
    SplitText.js       Splits paragraphs into masked lines
    Component.js       Base class: mirrors a DOM box into the GL world
  gl/
    World.js           Renderer, camera, render targets, composite pass
    Stars.js           Galaxy backdrop: nebula band, twinkling stars, glitter, shooting stars
    InkTrail.js        Ping-pong fluid trail that follows the cursor
    Media.js           Creates and owns every image plane
    MediaMesh.js       One WebGL plane locked to one DOM element
    shaders/           GLSL — noise, media, ink, composite, sky, stars
  fx/                  Landing page effects (2D canvas + SVG filters)
    FxLayer.js         Full-screen effects canvas; only ticks while busy
    Duo.js             The two sketches, the four floating rocks, throws and reactions
    SpaceRocks.js      The tumbling 3D rocks that drift around the sketches
    Scatter.js         The rocks' fragments, scattered across the page by scroll
    asteroid.js        Procedural 3D asteroid mesh + per-pixel rock material
    RockStage.js       3D layer for the thrown rock and its fragments
    Rock.js            Throw path + impact dust, grit and blood mist
    Blood.js           Liquid blood sim, rendered through #blood-goo
    faceMap.js         Hurt / angry / sad expressions as displacement maps
    eyeMap.js          Displacement map that widens the eyes in shock
    particles.js       Shared sprites, heat ramp and helpers
  pages/               Per-route enter/leave choreography
  styles/              Tokens, layout, responsive, no-WebGL fallback
scripts/
  generate-pages.mjs   Builds every route's HTML from site.js
  generate_media.py    Generates the placeholder imagery
```

---

## How the rendering works

The camera is a perspective camera positioned so **one world unit equals one
screen pixel**. Every `[data-media]` element in the DOM gets a plane scaled and
positioned to match its bounding box, so the layout stays plain CSS and WebGL
just paints over it.

Each frame:

1. The ink trail renders into a half-resolution ping-pong buffer. The pointer
   splats along the segment it travelled, the buffer advects along its own
   stored flow, diffuses with its neighbours, and decays.
2. Stars and image planes render into an offscreen target.
3. A fullscreen pass composites that target with the ink — refraction,
   chromatic split, accent bloom, film grain, vignette and the transition fade.

### Effects

- **Duotone → colour on hover.** Index cards are graded to a two-tone blue;
  hovering fades in the project's own accent colour and zooms the plane.
- **Scroll-velocity bend.** Plane edges lag behind the centre as you scroll.
- **Curve mode.** The toggle (top right, desktop) wraps the whole layout around
  a cylinder of radius 1100.
- **Ink trail.** Drag the cursor across the page — the trail refracts whatever
  is underneath and glows in the current accent colour.

### Colour space

Textures are tagged sRGB, so samples arrive **linear**. The duotone grade lifts
to a perceptual curve (`pow(l, 1.0/2.2)`) before grading — skip that and every
image crushes to black.

---

## Accessibility and fallbacks

- No WebGL2, or `prefers-reduced-motion: reduce` → the canvas, loader and
  overlay are removed and the site renders as a plain, fully readable document
  with real `<img>` tags. All content is in the HTML, so it works without JS.
- Skip link, focus-visible outlines, `aria-pressed` on the curve toggle,
  semantic headings and landmarks throughout.
- Pointer-driven effects are disabled on touch devices.

## Performance

- Device pixel ratio capped at 1.75 (2 on phones).
- Ink buffer runs at half resolution, capped at 1024px.
- Planes outside the viewport are culled before any uniform updates.
- Textures decode once into a shared cache; routes prefetch on hover and on idle.

The Three.js bundle is ~170 KB gzipped and loads as a separate chunk, so the
no-WebGL path never downloads it.
