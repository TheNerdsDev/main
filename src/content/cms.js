/*
 * Content managed by the CMS — run `npm run cms` to edit it in the dashboard.
 * The CMS rewrites this file when you save; by hand works too, as long as
 * what follows `export default` stays valid JSON.
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
 *   screenshot    its thumbnail is a framed screenshot: shown whole, still
 *   shots         how many detail shots it has (01.webp, 02.webp, …);
 *                 photos: false shows empty frames instead
 *   certificates  (optional) pinned either side of its page's video
 *   role, excerpt, deliverables — kept, not shown on the site at present
 */
export default {
  "maintenance": {
    "on": false,
    "title": "We’ll be right back",
    "message": "We’re giving the site a tune-up — new work and a few fixes. It’ll be back shortly.",
    "back": ""
  },
  "home": {
    "showcase": 5
  },
  "about": {
    "offer": {
      "title": "The Offer",
      "items": [
        "Consultation",
        "UI/UX Design",
        "Full Stack Development",
        "AI Solutions",
        "Social Media Management",
        "Search Engine Optimization (SEO)",
        "Business Automation",
        "Motion Graphics & Video"
      ]
    },
    "work": {
      "title": "The Work",
      "kinds": [
        {
          "name": "Digital Platforms",
          "text": "Websites, digital products, and online experiences.",
          "items": [
            "Marketing Websites & Landing Pages",
            "E-commerce Stores",
            "Web Applications & Portals",
            "Content Management Systems (CMS)"
          ]
        },
        {
          "name": "Intelligent Products",
          "text": "AI-powered tools and connected digital systems.",
          "items": [
            "AI-Powered Applications",
            "AI Chatbots & Virtual Assistants",
            "Custom Business Tools",
            "API Integrations"
          ]
        },
        {
          "name": "Digital Performance",
          "text": "Digital assets and measurement systems that support online growth.",
          "items": [
            "SEO-Ready Website Structures",
            "Conversion-Focused Landing Pages",
            "Analytics Dashboards",
            "Performance Reports"
          ]
        },
        {
          "name": "Visual Content",
          "text": "Visual assets created for brands, campaigns, and digital platforms.",
          "items": [
            "Motion Graphics & Animations",
            "Promotional Videos",
            "Social Media Creatives",
            "Digital Brand Assets"
          ]
        },
        {
          "name": "Business Systems",
          "text": "Practical systems that improve business operations.",
          "items": [
            "Automated Workflows",
            "Admin Panels & Dashboards",
            "Lead Management Systems",
            "Reporting & Integration Pipelines"
          ]
        }
      ]
    }
  },
  "projects": [
    {
      "slug": "css-arena",
      "name": "CSS Arena",
      "year": "2026",
      "role": "Design & Development",
      "accent": "#9259EE",
      "screenshot": true,
      "pageVideo": true,
      "excerpt": "Live CSS battle platform",
      "description": "A CSS battle platform built for the Vivacity 2K26 tech fest. Contestants recreate a target design in HTML and CSS against the clock, and every attempt is scored pixel by pixel, across more than 60 machines on an offline LAN.",
      "deliverables": [
        "Code editor",
        "Pixel-accurate scoring",
        "Live timer",
        "Offline LAN setup"
      ],
      "github": "https://github.com/meetRaval09/css-arena",
      "certificates": [
        {
          "name": "Meet Raval",
          "src": "/media/css-arena/certificate-meet.webp"
        },
        {
          "name": "Prem Kajiwala",
          "src": "/media/css-arena/certificate-prem.webp"
        }
      ],
      "shots": 3,
      "photos": true,
      "video": "/media/css-arena/preview.mp4"
    },
    {
      "slug": "taskpilot",
      "name": "TaskPilot",
      "year": "2026",
      "role": "Design & Development",
      "accent": "#E63946",
      "screenshot": true,
      "pageVideo": true,
      "excerpt": "Local-first task scheduler",
      "description": "A local-first task scheduler for planning the day, tracking what got done and staying focused. It brings a dashboard with your day at a glance, a month calendar, analytics on streaks and trends, desktop reminders, and themes from dark to sandstone.",
      "deliverables": [
        "Dashboard",
        "Calendar",
        "Analytics",
        "Desktop reminders"
      ],
      "github": "https://github.com/premkajiwala-hub/Task-Pilot",
      "shots": 3,
      "photos": true,
      "video": "/media/taskpilot/preview.mp4"
    },
    {
      "slug": "mesa-kitchen",
      "name": "Mesa Kitchen",
      "year": "2025",
      "role": "Front-end Development",
      "accent": "#B8343C",
      "excerpt": "Restaurant & reservations",
      "description": "A restaurant site built to make people hungry. Full-bleed food photography treated with a custom WebGL grade, and a reservation system wired straight into the floor plan.",
      "deliverables": [
        "Front-end build",
        "WebGL image grade",
        "Reservations",
        "CMS"
      ],
      "github": "",
      "shots": 3,
      "video": "/media/sample/preview.mp4"
    },
    {
      "slug": "atlas-fitness",
      "name": "Atlas Fitness",
      "year": "2025",
      "role": "Design & Development",
      "accent": "#1F8F6A",
      "excerpt": "Class booking platform",
      "description": "A booking platform for a studio running forty classes a week. Members see a schedule that loads instantly; staff see a dashboard that replaced three spreadsheets.",
      "deliverables": [
        "Product design",
        "Booking platform",
        "Staff dashboard",
        "Automation"
      ],
      "github": "",
      "shots": 3,
      "video": "/media/sample/preview.mp4"
    },
    {
      "slug": "verde-grocer",
      "name": "Verde Grocer",
      "year": "2025",
      "role": "Development & Systems",
      "accent": "#6B8F1F",
      "excerpt": "Local grocery storefront",
      "description": "An online storefront for a grocer with eight hundred products and no time to manage a website. We built the store, and the automation that keeps stock, pricing and delivery slots in sync on their own.",
      "deliverables": [
        "Storefront",
        "Inventory sync",
        "Delivery slots",
        "Infrastructure"
      ],
      "github": "",
      "shots": 3,
      "video": "/media/sample/preview.mp4"
    }
  ]
};
