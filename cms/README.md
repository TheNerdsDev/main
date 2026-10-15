# The CMS

A dashboard for the site's content, on your own computer:

```bash
npm run cms
```

It opens **http://localhost:5190** (the dashboard) and runs the site at
**http://localhost:5173** beside it — or uses the one you already have
running there. Ctrl+C stops it.

## What it edits

- **Projects** — add, delete, reorder (drag). Each project's name, year,
  description, GitHub link and accent colour; its **thumbnail**, **video**
  and **screenshots**; and whether it's shown on the site (a new project
  stays hidden until it has a thumbnail and you switch it on).
- **About page** — The Offer (the services) and The Work (the kinds of
  work, each with its line and items).
- **Home page** — how many projects the home page reel shows (the first
  ones, in the Projects order).
- **Maintenance** — closes the site for a while: see below.

Text edits wait for **Save** (Ctrl+S). Uploads are converted and saved
straight away. Either way, the site on 5173 shows the change at once.

## Uploads are converted to what the site expects

| Upload | Becomes |
| --- | --- |
| Thumbnail | `featured.jpg` 1600 × 1200 (4:3) + `featured-960.webp` |
| Video | `preview.mp4` 1440 × 1080 (1080p), H.264, 30 fps, no sound, a few MB, plays while loading; cut at 90 s |
| Screenshots | `01.webp` wide (2.1 : 1), the rest 1.62 : 1, each with a `.jpg` beside it |

Pictures are either **kept whole** — on a dark backdrop made from their own
colours, so the site's hover zoom never cuts them (screenshots) — or
**filled** — cropped to the frame (photos, designed images). Videos of
another shape are kept whole over a blurred copy of themselves, or
cropped to 4:3. Files that aren't pictures or videos are refused.

What was uploaded is kept in `cms/originals/` (so a screenshot moved to a
differently shaped place is refitted from the original, not from a copy).

## Maintenance

For a big update, a move, anything that means the site should be closed
for a while: **Maintenance** → switch it on → Save → Publish.

- **The live site** (once the host has built what you published) is the
  maintenance page and nothing else, at every address — home, Work, About,
  Contact and each project. It has its own heading, message and an
  optional "back by", and always says how to reach you. It's tiny (none of
  the site's 3D or app), and asks search engines not to index it.
- **On this computer** the site keeps its real pages, so you can keep
  working, with a reminder in the corner while maintenance is on. The
  maintenance page itself is always at
  [localhost:5173/maintenance/](http://localhost:5173/maintenance/) (it's
  also previewed in the dashboard).
- To reopen the site: switch it off → Save → Publish.

How: `npm run build` generates the pages with `--build`
(scripts/generate-pages.mjs), and with maintenance on that writes the
maintenance page in place of every page. `npm run dev` never does.

## Publish

**Publish** commits the content and media changes — only
`src/content/cms.js`, `public/media/` and `cms/originals/`, never code — and
pushes them on the branch you're on. **Get latest** brings in what the
other person published.

## Nothing is lost

Deleted projects and replaced files go to `.cms-trash/` (not in git), dated
— move one back to undo. Empty it whenever you like.

## Setting it up on another computer

1. `npm install` (adds `sharp`, the picture converter — for the CMS only,
   never part of the site).
2. Videos need **ffmpeg**: `winget install Gyan.FFmpeg`, then open a new
   terminal. (Without it, everything else works; the dashboard says so.)

## How it's built

`cms/` is its own small Vite app; `cms/server/` is its API (a Vite plugin):
`content.js` reads and writes `src/content/cms.js` and rebuilds the pages,
`media.js` converts, `store.js` keeps each project's files, `git.js`
publishes. The site's own `vite.config.js` skips this folder, so none of it
is ever in the site's build.
