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
  email: 'getintouch@thenerds.dev',
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
      "Hi, we're Meet and Prem, two curious developers who love turning simple ideas into something creative. If you can dream it up, we'll happily nerd out building it.",
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
      { name: 'phone', label: 'Phone number', type: 'tel', autocomplete: 'tel', required: true, max: 30 },
      { name: 'company', label: 'Company name', type: 'text', autocomplete: 'organization', max: 120 },
      { name: 'about', label: 'Brief about you', type: 'textarea', rows: 3, max: 2000 },
      { name: 'idea', label: 'What do you have in mind', type: 'textarea', rows: 5, max: 4000 }
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
  title: ['Got a big idea?'],
  /* One line each. */
  text: ['Big, small, or somewhere in between.', "Let's build something worth talking about."],
  button: 'Contact us'
};

/* Work index at `/work/` — the card stack. */
export const workIndex = {
  title: ["Work we're", 'proud of'],
  intro:
    "Websites, software and tools we've designed and built from the ground up. Open any project to see how it came together."
};

export const info = {
  /* Each line must fit on one row — it is revealed behind its own mask. */
  title: ['A little', 'about us'],
  lead:
    'We’re The Nerds, a small team from Surat, India, who love building cool stuff for the web. From websites to custom software and automation, we help businesses bring their ideas to life. No middlemen, no unnecessary fuss — just us, working with you to make something great.',
  /* The two boxes in their own section under the heading and photo.
     The Offer: the services clients hire us for. */
  offer: {
    title: 'The Offer',
    items: [
      'Consultation',
      'UI/UX Design',
      'Full Stack Development',
      'AI Solutions',
      'Social Media Management',
      'Search Engine Optimization (SEO)',
      'Business Automation',
      'Motion Graphics & Video'
    ]
  },
  /* The Work: what comes out of it — the things we make, not the services
     again. Hovering a kind (tapping, on a phone) opens its panel beside the
     box: the line under its name, then what it covers. */
  work: {
    title: 'The Work',
    kinds: [
      {
        name: 'Digital Platforms',
        text: 'Websites, digital products, and online experiences.',
        items: ['Marketing Websites & Landing Pages', 'E-commerce Stores', 'Web Applications & Portals', 'Content Management Systems (CMS)']
      },
      {
        name: 'Intelligent Products',
        text: 'AI-powered tools and connected digital systems.',
        items: ['AI-Powered Applications', 'AI Chatbots & Virtual Assistants', 'Custom Business Tools', 'API Integrations']
      },
      {
        name: 'Digital Performance',
        text: 'Digital assets and measurement systems that support online growth.',
        items: ['SEO-Ready Website Structures', 'Conversion-Focused Landing Pages', 'Analytics Dashboards', 'Performance Reports']
      },
      {
        name: 'Visual Content',
        text: 'Visual assets created for brands, campaigns, and digital platforms.',
        items: ['Motion Graphics & Animations', 'Promotional Videos', 'Social Media Creatives', 'Digital Brand Assets']
      },
      {
        name: 'Business Systems',
        text: 'Practical systems that improve business operations.',
        items: ['Automated Workflows', 'Admin Panels & Dashboards', 'Lead Management Systems', 'Reporting & Integration Pipelines']
      }
    ]
  }
};

export const projects = [
  {
    slug: 'css-arena',
    name: 'CSS Arena',
    year: '2026',
    role: 'Design & Development',
    accent: '#9259EE',
    /* The thumbnail is a framed screenshot: show it whole and still. */
    screenshot: true,
    /* The project page leads with the video below, playing on a loop. */
    pageVideo: true,
    excerpt: 'Live CSS battle platform',
    description:
      'A CSS battle platform built for the Vivacity 2K26 tech fest. Contestants recreate a target design in HTML and CSS against the clock, and every attempt is scored pixel by pixel, across more than 60 machines on an offline LAN.',
    deliverables: ['Code editor', 'Pixel-accurate scoring', 'Live timer', 'Offline LAN setup'],
    /* Its GitHub repository: "Code — GitHub ↗" on the project's page
       (left out while empty). */
    github: 'https://github.com/meetRaval09/css-arena',
    /* Our certificates of appreciation from the event, pinned either side
       of the video (the first on the left); click one to see it whole. */
    certificates: [
      { name: 'Meet Raval', src: '/media/css-arena/certificate-meet.webp' },
      { name: 'Prem Kajiwala', src: '/media/css-arena/certificate-prem.webp' }
    ],
    /* Detail shots 01–03: the 100% match (wide), the round countdown and
       the admin console. Shown even while other projects' are empty. */
    shots: 3,
    photos: true,
    /* Plays inside the ink when the card is hovered: a walkthrough, from
       login to the standings. */
    video: '/media/css-arena/preview.mp4'
  },
  {
    slug: 'taskpilot',
    name: 'TaskPilot',
    year: '2026',
    role: 'Design & Development',
    accent: '#E63946',
    /* The thumbnail is a framed logo poster: show it whole and still. */
    screenshot: true,
    /* The project page leads with the video below, playing on a loop. */
    pageVideo: true,
    excerpt: 'Local-first task scheduler',
    description:
      'A local-first task scheduler for planning the day, tracking what got done and staying focused. It brings a dashboard with your day at a glance, a month calendar, analytics on streaks and trends, desktop reminders, and themes from dark to sandstone.',
    deliverables: ['Dashboard', 'Calendar', 'Analytics', 'Desktop reminders'],
    github: 'https://github.com/premkajiwala-hub/Task-Pilot',
    /* Detail shots 01–03: the dashboard (wide), the calendar and analytics. */
    shots: 3,
    photos: true,
    /* Plays inside the ink when the card is hovered: a walkthrough, from
       the logo through planning a task to analytics. */
    video: '/media/taskpilot/preview.mp4'
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
    github: '',
    shots: 3,
    /* Plays inside the ink when the card is hovered. Placeholder clip for now. */
    video: '/media/sample/preview.mp4'
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
    github: '',
    shots: 3,
    /* Plays inside the ink when the card is hovered. Placeholder clip for now. */
    video: '/media/sample/preview.mp4'
  },
  {
    slug: 'verde-grocer',
    name: 'Verde Grocer',
    year: '2025',
    role: 'Development & Systems',
    accent: '#6B8F1F',
    excerpt: 'Local grocery storefront',
    description:
      'An online storefront for a grocer with eight hundred products and no time to manage a website. We built the store, and the automation that keeps stock, pricing and delivery slots in sync on their own.',
    deliverables: ['Storefront', 'Inventory sync', 'Delivery slots', 'Infrastructure'],
    github: '',
    shots: 3,
    /* Plays inside the ink when the card is hovered. Placeholder clip for now. */
    video: '/media/sample/preview.mp4'
  }
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
