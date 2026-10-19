/**
 * Single source of truth for all site content.
 * Edit this file to rebrand — pages regenerate on `npm run pages`.
 */

/* What the CMS edits (`npm run cms`): the projects, the About page's two
   boxes, and how many projects the home page shows. */
import cms from './cms.js';

export const studio = {
  name: 'The Nerds',
  wordmark: 'The Nerds',
  /* The site's one official address (https, with www) — what the sitemap,
     robots.txt and search engines are given. No trailing slash. */
  url: 'https://www.thenerds.dev',
  tagline: 'Creative Development Studio',
  /* The home page's description for search results (Google shows about
     160 characters). */
  description:
    'A two-person studio in Surat, India, building websites, software and automation for businesses that deserve better than a template.',
  email: 'getintouch@thenerds.dev',
  /* The header's way to the contact page. */
  contactLabel: 'Contact Us',
  location: 'Surat, IN — working remotely',
  available: 'January 2027',
  year: '2026',
  social: [
    { label: 'Instagram', url: 'https://www.instagram.com/thenerds.dev/' },
    { label: 'LinkedIn', url: 'https://www.linkedin.com/company/145305179/' }
  ],
  /* Each page's title, as search results and link previews show it
     (Google shows about 60 characters): what the page is, then who we
     are — "The Nerds" alongside Surat, so we aren't mistaken for the
     other "nerd" sites. */
  titles: {
    home: 'The Nerds: Website & Software Developers in Surat, India',
    work: 'Portfolio: Web Apps & AI Projects Built in Surat | The Nerds',
    about: 'About The Nerds: Meet & Prem, Developers in Surat',
    contact: 'Contact The Nerds: Start Your Website or App Project',
    /* A project's: its name, then what it is (by its address). One not
       listed here — a new one from the CMS — is "Name | The Nerds". */
    projects: {
      'css-arena': 'Live CSS Battles for Tech Fests',
      'indus-brain': 'AI Assistant for Industrial Plants',
      'mewar-sync': 'Voice AI Accounting for Artisans',
      taskpilot: 'Offline Task Planner & Focus App'
    }
  }
};

/* The maintenance page (CMS → Maintenance). While `on`, the built site is
   this one page at every address; on this computer the real pages stay,
   with a reminder, and the page itself is at /maintenance/. */
export const maintenance = {
  on: false,
  title: 'We’ll be right back',
  message: '',
  back: '',
  ...cms.maintenance,
  kicker: 'Under maintenance',
  reach: 'Need us in the meantime?'
};

/* Landing page at `/`. */
export const main = {
  /* Each line must fit on one row — it is revealed behind its own mask. */
  title: ['Welcome to', 'our creative', 'platform'],
  /* **word** renders bold. */
  intro: 'Blending **creativity** and **technology** to build experiences that feel genuinely different',
  scrollLabel: 'Scroll Down',
  /* Pinned to one of the space rocks until a visitor throws one (fx/Duo.js). */
  rockHint: { click: 'Click a rock', tap: 'Tap a rock', line: 'and throw it at the other nerd' },
  about: {
    text:
      "Hi, we're Meet and Prem, two curious developers who love turning simple ideas into something creative. If you can dream it up, we'll happily nerd out building it.",
    button: 'About Us'
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
 *   photo     the square photo in About's frame (Meet's on the left, Prem's
 *             on the right); photoAlt describes it
 *   surname   set beside the first name under that photo
 */
export const team = [
  {
    id: 'prem',
    name: 'Prem',
    surname: 'Kajiwala',
    colour: '#39FF14',
    portrait: '/media/team/prem.webp',
    portraitAngry: '/media/team/prem-angry.webp',
    aspect: 0.8,
    hit: [0.5, 0.46],
    crown: [0.5, 0.3],
    hand: [0.86, 0.84],
    photo: '/media/team/about-prem.webp',
    photoAlt: 'Prem, working at a laptop by a sunny window'
  },
  {
    id: 'meet',
    name: 'Meet',
    surname: 'Raval',
    colour: '#2F8CFF',
    portrait: '/media/team/meet.webp',
    portraitAngry: '/media/team/meet-angry.webp',
    aspect: 0.8,
    hit: [0.495, 0.405],
    crown: [0.49, 0.235],
    hand: [0.14, 0.84],
    photo: '/media/team/about-meet.webp',
    photoAlt: 'Meet, working at a sticker-covered laptop'
  }
];

/* Contact page at `/contact/`. */
export const contact = {
  title: ['Got an idea?', "Let's talk."],
  /* **word** renders bold. */
  lead:
    "We build **websites**, **custom software** and **automation** that work as hard as you do. Tell us what you have in mind, and you'll hear back within 24 hours.",
  /* In the order they're laid out, two to a row (so Phone sits right
     under Based in). A detail with `href` is a link; one with `lines` lists
     a name and a link per line, and takes two rows' height, so the column
     beside it keeps its even spacing. */
  details: [
    { label: 'Response time', value: 'Within 24 hours' },
    { label: 'Based in', value: 'Surat, IN — working remotely' },
    { label: 'Email', value: 'getintouch@thenerds.dev', href: 'mailto:getintouch@thenerds.dev' },
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
      { name: 'phone', label: 'Phone number', type: 'tel', autocomplete: 'tel', max: 30 },
      { name: 'company', label: 'Company name', type: 'text', autocomplete: 'organization', max: 120 },
      { name: 'about', label: 'Brief about you', type: 'textarea', rows: 2, max: 2000 },
      { name: 'idea', label: 'What do you have in mind', type: 'textarea', rows: 3, required: true, max: 4000 }
    ],
    optional: 'Optional',
    button: 'Send Your Idea',
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
      emailDomain: "We couldn't find that email's domain. Please check how it's spelled.",
      phone: 'Enter a 10-digit Indian mobile number, starting with 6, 7, 8 or 9.',
      long: "That's a little too long."
    }
  }
};

/* Home-page showcase: the projects, given a section of their own. */
export const showcase = {
  title: ['Things we', 'built lately'],
  more: 'All work',
  /* How many projects its reel shows — the first ones (CMS: Home page). */
  count: cms.home.showcase
};

/* The closing section of the landing page, under the planet shower. */
export const finale = {
  title: ['Got a big idea?'],
  /* One line each. */
  text: ['Big, small, or somewhere in between.', "Let's build something worth talking about."],
  button: 'Contact us'
};

/* Work index at `/work/` — the card stack. */
export const workIndex = {
  /* Each line must fit on one row (it's revealed behind its own mask) —
     beside the card stack that's about ten letters. */
  title: ['Heavy on', 'ideas.', 'Light on', 'boring.'],
  intro:
    'We turn wild ideas into websites, clever software, and digital experiences worth showing off. Take a peek at what happens when nerds get creative.',
  /* For search results (not shown on the page). */
  description:
    'Projects we’ve built: a live CSS battle platform, an AI accounting app for artisans, an AI knowledge platform for industry and a local-first task scheduler.'
};

export const info = {
  /* Each line must fit on one row — it is revealed behind its own mask. */
  title: ['A little', 'about us'],
  /* For search results (not shown on the page; the lead is too long for one). */
  description:
    'Meet and Prem, two developers from Surat, India, building websites, custom software and automations that just work. No corporate BS, no middlemen.',
  lead:
    'We’re The Nerds, two devs from Surat, India, who love cooking up cool stuff for the web. From slick websites to custom software and crazy useful automations, we build things that just work. No corporate BS, no middlemen, just two nerds turning your ideas into something awesome.',
  /* The two boxes in their own section under the heading and photo
     (CMS: About page). The Offer: the services clients hire us for. The
     Work: what comes out of it — hovering a kind (tapping, on a phone)
     opens its panel beside the box. */
  offer: cms.about.offer,
  work: cms.about.work
};

/* The projects shown on the site, in order (CMS: Projects; one switched
   off there — `hidden` — is left out everywhere). What each field does is
   described at the top of cms.js. */
export const projects = cms.projects.filter((p) => !p.hidden);

/* Addresses that have moved: each a permanent (301) redirect, on the host
   (public/.htaccess, written by `npm run pages`) and in `npm run dev` /
   `npm run preview` (vite.config.js) alike. A project renamed in the CMS
   adds its old address here by itself (formerSlugs). */
export const redirects = [
  { from: '/about', to: '/info/' },
  ...projects.flatMap((p) => (p.formerSlugs || []).map((old) => ({ from: `/work/${old}`, to: `/work/${p.slug}/` })))
];

export const getProject = (slug) => projects.find((p) => p.slug === slug);
export const getNext = (slug) => {
  const i = projects.findIndex((p) => p.slug === slug);
  return projects[(i + 1) % projects.length];
};
export const getPrev = (slug) => {
  const i = projects.findIndex((p) => p.slug === slug);
  return projects[(i - 1 + projects.length) % projects.length];
};
