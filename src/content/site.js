/**
 * Single source of truth for all site content.
 * Edit this file to rebrand — pages regenerate on `npm run pages`.
 */

import projectsData from './projects.json' with { type: 'json' };

export const studio = {
  name: 'The Nerds',
  wordmark: 'The Nerds',
  tagline: 'Creative Development Studio',
  description:
    'A two-person studio building websites, software and automation for businesses that deserve better than a template.',
  email: 'thenerds2k25@gmail.com',
  /* The header's way to the contact page. */
  contactLabel: 'Contact Us',
  location: 'Surat, IN — working remotely',
  available: 'January 2027',
  year: '2026',
  social: [
    { label: 'Instagram', url: 'https://instagram.com/' },
    { label: 'LinkedIn', url: 'https://linkedin.com/' }
  ]
};

/* Landing page at `/`. */
export const main = {
  /* Each line must fit on one row — it is revealed behind its own mask. */
  title: ['Welcome to', 'our creative', 'platform'],
  /* **word** renders bold. */
  intro: 'Blending **creativity** and **technology** to build experiences that feel genuinely different',
  scrollLabel: 'Scroll Down',
  about: {
    text:
      "We're Meet & Prem the Nerds, two curious minds who get way too excited about turning simple ideas into something creative. If you can dream it up, we'll probably nerd out building it.",
    button: 'About Us',
    /* Shown in the empty frames until a scroll rolls the photos in. */
    hint: 'Scroll Down'
  },
  /* Space rocks drifting around the sketches — click one and it gets thrown. */
  rocks: 4
};

/**
 * The two of us. Every point is a fraction of the picture (0..1, from the
 * top-left), so swapping in a new one only means updating the file path and
 * re-measuring these points on it.
 *
 *   portrait       the neon portrait, as it normally looks (4:5, transparent)
 *   portraitAngry  the same, angry — shown when a rock hits, instead of the
 *                  expression animation (same size and body position)
 *
 * Or, for a line sketch tinted and animated by the site (fx/NeonSketch.js):
 *   sketch the drawing; `aspect` its width ÷ height
 *   ink    'light' = light lines on a transparent/dark background
 *          'dark'  = pencil on white paper (the paper is keyed out)
 *   eyes   centres of both eyes — they widen, then squint, when hit
 *   eyeR   eye radius, as a fraction of the sketch width
 *   face   landmarks the expressions (hurt / angry / sad) pull on:
 *          brows = inner brow ends, browsOuter = outer ends,
 *          mouth = centre of the mouth, corners = its two corners
 *          (always listed left, then right)
 *   hit    where an incoming rock strikes (and the neon shorts out)
 *   crown  top of the head, where the dizzy stars circle
 *   hand   where a thrown rock leaves from
 *
 *
 * (In About, in the spaceship portholes, we're cartoon astronauts — drawn
 * in content/astronauts.js.)
 */
export const team = [
  {
    id: 'prem',
    name: 'Prem',
    colour: '#39FF14',
    portrait: '/media/team/prem.webp',
    portraitAngry: '/media/team/prem-angry.webp',
    aspect: 0.8,
    hit: [0.5, 0.46],
    crown: [0.5, 0.3],
    hand: [0.86, 0.84]
  },
  {
    id: 'meet',
    name: 'Meet',
    colour: '#2F8CFF',
    portrait: '/media/team/meet.webp',
    portraitAngry: '/media/team/meet-angry.webp',
    aspect: 0.8,
    hit: [0.495, 0.405],
    crown: [0.49, 0.235],
    hand: [0.14, 0.84]
  }
];

/* Contact page at `/contact/`. */
export const contact = {
  title: ['Got an idea?', "Let's talk."],
  /* **word** renders bold. */
  lead:
    "Got something in mind? We build **websites**, **custom software** and **automation** that work as hard as you do. Tell us about it — you'll hear back within 24 hours.",
  /* In the order they're laid out, two to a row (so Phone sits right
     under Based in). A detail with `href` is a link; one with `lines` lists
     a name and a link per line, and takes two rows' height, so the column
     beside it keeps its even spacing. */
  details: [
    { label: 'Response time', value: 'Within 24 hours' },
    { label: 'Based in', value: 'Surat, IN — working remotely' },
    { label: 'Email', value: 'thenerds2k25@gmail.com', href: 'mailto:thenerds2k25@gmail.com' },
    {
      label: 'Phone',
      lines: [
        { name: 'Meet Raval', value: '+91 8153813924', href: 'tel:+918153813924' },
        { name: 'Prem Kajiwala', value: '+91 6353820610', href: 'tel:+916353820610' }
      ]
    }
  ],
  socials: 'Socials',
  /* The enquiry form. Each submission is saved to the database and emailed
     to us (supabase/functions/contact). `name` is the key it's sent and
     stored under — change a label freely, but a name only together with
     the function and the table. */
  form: {
    fields: [
      { name: 'name', label: 'Full name', type: 'text', autocomplete: 'name', required: true, max: 120 },
      { name: 'email', label: 'Email', type: 'email', autocomplete: 'email', required: true, max: 200 },
      { name: 'phone', label: 'Phone number', type: 'tel', autocomplete: 'tel', required: true, max: 30 },
      { name: 'company', label: 'Company name', type: 'text', autocomplete: 'organization', max: 120 },
      { name: 'about', label: 'Brief about you', type: 'textarea', rows: 3, max: 2000 },
      { name: 'idea', label: 'What do you have in mind', type: 'textarea', rows: 5, max: 4000 }
    ],
    optional: 'Optional',
    button: 'Send Your Idea',
    sending: 'Sending…',
    sent: {
      title: 'Got it — thank you!',
      text: "Your message is with us. We'll get back to you within 24 hours."
    },
    /* Shown if it can't be sent; the address follows it. */
    failed: "That didn't go through. Please try again in a moment, or write to us at",
    /* Under a field that isn't right (checked here and again by the function). */
    errors: {
      required: 'Please fill this in.',
      email: "That doesn't look like an email address.",
      phone: "That doesn't look like a phone number.",
      long: "That's a little too long."
    }
  }
};

/* Home-page showcase: the projects, given a section of their own. */
export const showcase = {
  title: ['Things we', 'built lately'],
  more: 'All work'
};

/* The closing section of the landing page, under the planet shower. */
export const finale = {
  title: ['Ready for liftoff?'],
  /* One line each. */
  text: ['Dreaming something up?', 'Two nerds are ready to bring it down to earth.'],
  button: 'Contact us'
};

/* Work index at `/work/` — the card stack. */
export const workIndex = {
  title: ['Built to be', 'Remembered'],
  intro:
    'We design and build high-performance websites for local businesses — with more going on beneath the surface.',
  indexLabel: 'Index'
};

export const info = {
  title: ['Who we are'],
  lead:
    'We are Meet and Prem, two developers based in Surat. We design and build websites, custom software and automation for businesses of every size. Every project is handled by the two of us, from the first conversation through to launch and beyond.'
};

/* The projects, in the order they appear: kept in projects.json, which the
   CMS edits (Pages CMS, configured in .pages.yml at the repo root). Each one:
     name, slug        its title, and its page at /work/<slug>/
     year, role, excerpt, description, deliverables (the Scope list)
     accent            its colour (#RRGGBB): the hover glow, the page's tint
     github            "Code — GitHub ↗" on its page (left out while empty)
     thumbnail         the card image (a smaller -960.webp beside it is used
                       on small screens when it's there)
     stillThumbnail    a framed screenshot or poster: shown whole, no zoom/drift
     video             the walkthrough: plays on the card when hovered…
     pageVideo         …and leads its page, on a loop
     shots             its page's screenshots: the first wide, then two to a
                       row (a .webp beside one is used instead when it's
                       there); none: three empty frames hold the layout
     certificates      pinned beside the video, { name, image } each */
export const projects = projectsData.projects.map((p) => ({
  ...p,
  /* The CMS may leave an empty field out, or save it as null. */
  year: p.year || '',
  role: p.role || '',
  excerpt: p.excerpt || '',
  description: p.description || '',
  accent: p.accent || '#6E8FD6',   // the site's own blue
  github: p.github || '',
  video: p.video || '',
  deliverables: p.deliverables || [],
  shots: p.shots || [],
  certificates: p.certificates || []
}));

export const getProject = (slug) => projects.find((p) => p.slug === slug);
export const getNext = (slug) => {
  const i = projects.findIndex((p) => p.slug === slug);
  return projects[(i + 1) % projects.length];
};
