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
| Studio name, email, header's contact label, socials | `studio` in `src/content/site.js` |
| Landing page headline, subtext, About copy, button label, the four rocks | `main` |
| The two of us: sketches, neon colours, eye / hit points, About photos | `team` |
| The work reel on the landing page (heading, link label) | `showcase` |
| The closing section (heading, text, button) | `finale` |
| Work index headline and intro | `workIndex` |
| Contact page heading, lead and details | `contact` |
| About page copy, services, stack | `info` |
| Projects (name, year, role, description, accent colour, hover video) | `projects` |
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
| `/` | Landing — welcome, the two neon sketches, About, the work reel | `src/pages/Main.js` |
| `/work/` | Work index — the scrolling card stack | `src/pages/Projects.js` |
| `/work/<slug>/` | Case study | `src/pages/Work.js` |
| `/info/` | About / info | `src/pages/Info.js` |
| `/contact/` | Contact — address (click to copy), mail link, details | `src/pages/Page.js` |

### The landing page, top to bottom

1. **Welcome.** The two neon sketches, with four space rocks circling them
   clockwise — each on its own orbit and rhythm, swinging round the figures
   (and their names, and the header) rather than across them. Click a sketch, or a rock, and one throws it at
   the other: the rock bursts, the neon shorts out (arcs and sparks), the face
   goes shock → pain → anger (or sadness, if they started it), and they see
   stars for a moment.
2. **About.** The first scroll takes over and glides you down; the rocks come
   along, still circling. From here your scroll drives it, both ways: the rocks
   spiral in, collide and crumble; the pieces fly off in straight lines,
   slowing like debris in drag. About two thirds come to rest spread evenly
   over the screen and keep floating gently about their spots, drawn behind
   the text and photos; the rest fly off. Then the photos, the brief and the
   About Us button play in.
3. **Work.** A pinned reel: the scroll pulls the projects sideways past you,
   each card linking to its case study. Hover a card and it comes forward
   while the others step back and dim — and water spreads across it from
   the point where the pointer came in. The uneven front bends the
   thumbnail like a lens as it passes; behind it the thumbnail washes away
   into the project's video, which starts playing as the water arrives and
   loops once the card is covered. Move away and the water drains back.
4. **Connect.** The last screen. As it scrolls in, a shower of tiny planets
   pours down from the seam above it and piles up along the bottom: Jupiter,
   Saturn, Uranus, Neptune, Earth, Venus, Mars, Mercury and the Moon, sized
   in the real order (squeezed so nothing gets huge), each with its true
   axial tilt and turning at its real relative rate (Venus and Uranus
   backwards). They're rendered from real maps with physically based
   materials: Earth with terrain relief, glossy oceans, a drifting cloud
   layer and an atmosphere; Saturn and Uranus with their rings; Jupiter's
   bands sliding past each other. Lit from the upper left with a strong
   fill, so each planet shades softly to its lower right (never black). No
   cast shadows, and no overlaps: ringed planets collide along their rings,
   so the pile rests against them instead of sliding into them. The pile
   fits the screen: planet size follows the section's area and the count
   makes up the rest, so it fills about the bottom 30% on a phone, a tablet
   or a monitor alike (on portrait screens the heading sits just above it).
   Resize the window or turn the phone and a fresh pile falls for the new
   size.
   Moving the pointer through the pile nudges it; pressing and dragging
   (mouse or touch) swipes planets away with the drag — they glide on, then
   fall and settle. Scroll back up and the pile stays put; leave the section
   and come back down for a fresh shower. Above the pile: the heading, a line
   of text and a big Contact us button (the About Us button, scaled up). An "All work" box beside the
   heading opens the full card stack at `/work/`. On phones it becomes a plain vertical list.

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
- `hit` (where a rock strikes and the neon shorts out), `crown` (top of the
  head, where the dizzy stars circle) and `hand` (where a thrown rock leaves
  from)

Then run `npm run pages`. The neon colour comes from `colour`.

The About photos (`photos`, three per person, shown in order with the last one
staying) are placeholders too — replace the files or change the paths.

### Replacing the imagery

The placeholder images are generated abstracts. Swap in real screenshots at the
same paths and nothing else needs touching:

```
public/media/<slug>/featured.jpg   # card thumbnail (e.g. a dashboard screenshot) + case-study hero
public/media/<slug>/01.jpg         # detail shots
public/media/<slug>/02.jpg
public/media/<slug>/03.jpg
public/media/studio/portrait.jpg   # about page
```

Regenerate the placeholders any time with `python3 scripts/generate_media.py`.

### Planet textures

The planet maps live in `public/textures/planets/2k` (desktop) and `1k`
(phones). Rebuild them with `python scripts/planet-textures.py` (needs Pillow);
it downloads into `.texture-cache/` and writes the web-ready files.

- Solar System Scope texture library — CC BY 4.0, https://www.solarsystemscope.com/textures
  (fetched from the copy Qt 3D redistributes, since their site blocks scripts).
  **CC BY needs a visible credit** — see `public/textures/planets/CREDITS.txt`.
- Earth's city lights: NASA Earth Observatory "Black Marble" — public domain
  (still produced by the script, not currently shown: the planets have no night side).
- Venus' cloud layer and Uranus' faint rings are generated by the script.

Higher-resolution maps (8K from Solar System Scope) drop straight in under the
same names, but at the size the planets are drawn (the biggest is ~85px across)
the GPU never samples above the 1–2K level, so they'd only cost download size
and memory.

### Project videos

Each project's `video` (in `projects`) plays under the spreading water when its card
on the landing page is hovered. They all point at one placeholder clip for
now, `public/media/sample/preview.mp4` — a 10-second excerpt of *Big Buck
Bunny* (© Blender Foundation, peach.blender.org, CC BY 3.0). Swap in a
short, muted, looping MP4 per project (H.264, ~640–960 px wide, a few MB
at most) and point `video` at it.

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
    Cursor.js          The custom pointer: a star, its orbit and a satellite
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
    Duo.js             The two sketches, the four orbiting rocks, throws and reactions
    SpaceRocks.js      The tumbling 3D rocks that drift around the sketches
    Scatter.js         The rocks' fragments: burst by scroll, spread evenly, float behind the page
    asteroid.js        Procedural 3D asteroid mesh + per-pixel rock material
    RockStage.js       3D layer for the thrown rock and its fragments
    Rock.js            Throw path + impact dust and grit
    Zap.js             Neon short-circuit + dizzy stars on a hit; the collision's dust
    WaterReveal.js     Water spreading from the pointer over a work card, revealing its video
    NeonSketch.js      The neon sketches drawn on the GPU (face warps + glow in one cheap pass)
    PlanetShower.js    The closing planet shower: physics, scroll trigger, pointer nudge + drag swipe
    PlanetScene.js     The planets themselves (three.js): real maps, PBR, tilt and spin, rings, air
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
- **Header.** A frosted-glass bar; its links roll their letters on hover and
  turn green (the same effect as the About Us button). On phones the links
  fold behind a three-line menu button and open as a full-screen panel. No
  footer.
- **Logo.** The brand artwork traced into SVG (`scripts/trace-logo.py` →
  `src/content/logo.js`; re-run it if `scripts/brand/the-nerds.webp`
  changes), one path per letter. Hover it and the letters jump one after
  another like dominoes while the rocket blasts out of the R, comes back
  round along its trail and settles in again, leaving tricolour clouds —
  saffron, white, green — behind it (`fx/LogoRocket.js`). The loading
  screen shows it large: the letters rise in and the rocket rides the trail
  as loading runs, docking in the R at 100%.
- **Cursor.** On mouse / trackpad devices the pointer is a small star with an
  orbit that trails it; it opens up over links, turns into a dashed target over
  a rock, and steps aside for the text caret in form fields.
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
- Skip link, focus-visible outlines,
  semantic headings and landmarks throughout.
- Pointer-driven effects (and the custom cursor) are disabled on touch
  devices and with reduced motion.
- Copying the email works on plain `http://` LAN addresses too (falls back
  from the async Clipboard API), and never opens a mail tab by surprise.

## Performance

- Device pixel ratio capped at 1.75 (2 on phones).
- Ink buffer runs at half resolution, capped at 1024px.
- Planes outside the viewport are culled before any uniform updates.
- Textures decode once into a shared cache; routes prefetch on hover and on idle.

The Three.js bundle is ~170 KB gzipped and loads as a separate chunk, so the
no-WebGL path never downloads it.
