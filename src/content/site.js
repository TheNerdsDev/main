/**
 * Single source of truth for all site content.
 * Edit this file to rebrand — pages regenerate on `npm run pages`.
 */

export const studio = {
  name: 'The Nerds',
  wordmark: 'The Nerds',
  tagline: 'Creative Development Studio',
  description:
    'A two-person studio building websites, software and automation for businesses that deserve better than a template.',
  email: 'hello@thenerds.studio',
  location: 'Ahmedabad, IN — working remotely',
  available: 'January 2027',
  year: '2026',
  social: [
    { label: 'Instagram', url: 'https://instagram.com/' },
    { label: 'GitHub', url: 'https://github.com/' },
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
    button: 'About Us'
  },
  /* Space rocks drifting around the sketches — click one and it gets thrown. */
  rocks: 4
};

/**
 * The two of us. Every point is a fraction of the sketch image (0..1, from
 * the top-left), so swapping in a real sketch only means updating the file
 * path and re-measuring these points on the new drawing.
 *
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
 */
export const team = [
  {
    id: 'prem',
    name: 'Prem',
    colour: '#39FF14',
    sketch: '/media/team/prem-sketch.svg',
    aspect: 0.8,
    ink: 'light',
    eyes: [[0.4025, 0.43], [0.5975, 0.43]],
    eyeR: 0.11,
    face: {
      brows: [[0.46, 0.374], [0.54, 0.374]],
      browsOuter: [[0.34, 0.384], [0.66, 0.384]],
      mouth: [0.5, 0.602],
      corners: [[0.44, 0.594], [0.56, 0.594]]
    },
    hit: [0.5, 0.355],
    crown: [0.5, 0.13],
    hand: [0.86, 0.84],
    photos: ['/media/team/prem-1.svg', '/media/team/prem-2.svg', '/media/team/prem-3.svg']
  },
  {
    id: 'meet',
    name: 'Meet',
    colour: '#2F8CFF',
    sketch: '/media/team/meet-sketch.svg',
    aspect: 0.8,
    ink: 'light',
    eyes: [[0.4025, 0.43], [0.5975, 0.43]],
    eyeR: 0.11,
    face: {
      brows: [[0.465, 0.38], [0.535, 0.38]],
      browsOuter: [[0.335, 0.388], [0.665, 0.388]],
      mouth: [0.5, 0.612],
      corners: [[0.445, 0.6], [0.555, 0.6]]
    },
    hit: [0.5, 0.355],
    crown: [0.5, 0.13],
    hand: [0.14, 0.84],
    photos: ['/media/team/meet-1.svg', '/media/team/meet-2.svg', '/media/team/meet-3.svg']
  }
];

/* Contact page at `/contact/`. */
export const contact = {
  title: ['Got an idea?', "Let's talk."],
  lead:
    "Tell us what you're building — a website, a tool, an automation, or just a hunch you can't shake. We read everything and reply within two working days.",
  details: [
    { label: 'Response time', value: 'Within 48 hours' },
    { label: 'Based in', value: 'Ahmedabad, IN — working remotely' },
    { label: 'Available', value: 'January 2027' }
  ]
};

/* Home-page showcase: the projects, given a section of their own. */
export const showcase = {
  kicker: 'Selected work',
  title: ['Things we', 'built lately'],
  more: 'All work'
};

/* Work index at `/work/` — the card stack. */
export const workIndex = {
  title: ['Built to be', 'Remembered'],
  intro:
    'We design and build high-performance websites for local businesses — with more going on beneath the surface.',
  indexLabel: 'Index'
};

export const info = {
  title: ['Two nerds,', 'zero templates'],
  lead:
    'We are a small studio. That is the point — you talk to the people writing the code, every single time.',
  body: [
    'The Nerds is run by two developers who got tired of watching good local businesses settle for templates that look like everyone else. A cafe, a salon, a neighbourhood kitchen — each one has a character worth putting on screen, and almost none of them get it.',
    'We handle the whole thing: design direction, front-end build, the backend and automations that keep it running, and the hosting it sits on. No handoffs between agencies, no account manager relaying messages. One conversation, start to finish.',
    'Our work leans on motion and interaction, but never at the cost of speed. Every site we ship is measured on a mid-range phone before it goes live, because that is what your customers are actually holding.'
  ],
  services: [
    { label: 'Design', items: ['Art direction', 'Interface design', 'Design systems', 'Prototyping'] },
    { label: 'Build', items: ['Front-end development', 'WebGL & motion', 'CMS integration', 'Performance'] },
    { label: 'Systems', items: ['Automation', 'Booking & ordering', 'Cloud infrastructure', 'Maintenance'] }
  ],
  capabilities: ['WebGL', 'Three.js', 'GSAP', 'React', 'Astro', 'Node', 'Python', 'AWS']
};

export const projects = [
  {
    slug: 'nikunj-salon',
    name: 'Nikunj Salon',
    year: '2026',
    role: 'Design & Development',
    accent: '#C8702F',
    excerpt: 'Scroll-driven salon site',
    description:
      'A scroll-driven site for a neighbourhood salon, where every section reveals itself as you move down the page. Built around short intro films and a booking flow that takes three taps.',
    deliverables: ['Art direction', 'Scroll animation', 'Booking integration', 'Hosting'],
    link: 'https://example.com',
    shots: 3
  },
  {
    slug: 'harbour-coffee',
    name: 'Harbour Coffee',
    year: '2026',
    role: 'Design & Development',
    accent: '#2F6FC8',
    excerpt: 'Cafe storefront & ordering',
    description:
      'A storefront for a two-location roastery, with a menu that updates itself from the till system and a pickup-ordering flow that works on a phone in one hand.',
    deliverables: ['Brand site', 'Menu sync', 'Online ordering', 'Analytics'],
    link: 'https://example.com',
    shots: 3
  },
  {
    slug: 'mesa-kitchen',
    name: 'Mesa Kitchen',
    year: '2025',
    role: 'Front-end Development',
    accent: '#B8343C',
    excerpt: 'Restaurant & reservations',
    description:
      'A restaurant site built to make people hungry. Full-bleed food photography treated with a custom WebGL grade, and a reservation system wired straight into the floor plan.',
    deliverables: ['Front-end build', 'WebGL image grade', 'Reservations', 'CMS'],
    link: 'https://example.com',
    shots: 3
  },
  {
    slug: 'atlas-fitness',
    name: 'Atlas Fitness',
    year: '2025',
    role: 'Design & Development',
    accent: '#1F8F6A',
    excerpt: 'Class booking platform',
    description:
      'A booking platform for a studio running forty classes a week. Members see a schedule that loads instantly; staff see a dashboard that replaced three spreadsheets.',
    deliverables: ['Product design', 'Booking platform', 'Staff dashboard', 'Automation'],
    link: 'https://example.com',
    shots: 3
  },
  {
    slug: 'verde-grocer',
    name: 'Verde Grocer',
    year: '2025',
    role: 'Development & Systems',
    accent: '#6B8F1F',
    excerpt: 'Local grocery storefront',
    description:
      'A grocer with eight hundred products and no time to manage a website. We built the storefront and the automation that keeps stock, pricing and delivery slots in sync on their own.',
    deliverables: ['Storefront', 'Inventory sync', 'Delivery slots', 'Infrastructure'],
    link: 'https://example.com',
    shots: 3
  }
];

export const getProject = (slug) => projects.find((p) => p.slug === slug);
export const getNext = (slug) => {
  const i = projects.findIndex((p) => p.slug === slug);
  return projects[(i + 1) % projects.length];
};
