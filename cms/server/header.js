/* The comment at the top of src/content/cms.js — written there by the CMS
   each time it saves, so the file always explains itself. */
export const HEADER = `/*
 * Content managed by the CMS — run \`npm run cms\` to edit it in the dashboard.
 * The CMS rewrites this file when you save; by hand works too, as long as
 * what follows \`export default\` stays valid JSON.
 *
 * maintenance     on: the published site shows only the maintenance page
 *                 (title, message, back — "back by", optional) at every
 *                 address; off: the site as normal
 * home.showcase   how many projects the home page's reel shows (the first
 *                 ones, in the order below)
 * about.offer     The Offer box on the About page: a title and its lines
 * about.work      The Work box: its kinds, each with a line and its items
 * projects        in order. Each one:
 *   slug          its page (/work/<slug>/) and its media folder
 *                 (public/media/<slug>/)
 *   name, year, description
 *   github        its repository ("Code — GitHub" on its page; "" hides it)
 *   accent        the colour its page and card glow with
 *   video         plays in its card on hover ("" for none); with pageVideo,
 *                 it also leads its page
 *   videoFrom, videoTo  (optional) on hover the card plays only this
 *                 stretch of it, s — past a title screen the thumbnail
 *                 already shows; no videoTo: to the end
 *   screenshot    its thumbnail was kept whole on a backdrop (the CMS's
 *                 "Keep it whole"); every home card shows its thumbnail
 *                 whole and still either way
 *   formerSlugs   (set by the CMS) the addresses it had before it was
 *                 renamed: they send visitors on to its page
 *   thumbFocus    (optional) which part of its thumbnail the Work page's
 *                 wider cards keep: 0 = the top … 1 = the bottom (default
 *                 0.5, the middle) — for one with a title near its top
 *   shots         how many detail shots it has (01.webp, 02.webp, …);
 *                 photos: false shows empty frames instead
 *   certificates  (optional) pinned either side of its page's video
 *   searchDescription  (optional) the short text under its link in Google
 *                 (up to 160 characters; not shown on the site); empty: the
 *                 first sentence of its description
 *   role          kept, not shown on the site at present
 */
`;
