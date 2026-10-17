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
 *   role          kept, not shown on the site at present
 */
export default {
  "maintenance": {
    "on": false,
    "title": "We’ll be right back",
    "message": "We’re giving the site a tune-up — new work and a few fixes. It’ll be back shortly.",
    "back": ""
  },
  "home": {
    "showcase": 4
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
      "description": "A CSS battle platform built for the Vivacity 2K26 tech fest. Contestants recreate a target design in HTML and CSS against the clock, and every attempt is scored pixel by pixel, across more than 60 machines on an offline LAN.",
      "searchDescription": "A CSS battle platform for the Vivacity 2K26 tech fest: recreate a design against the clock, scored pixel by pixel across 60+ machines on an offline LAN.",
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
      "video": "/media/css-arena/preview.mp4",
      "videoFrom": 2.5
    },
    {
      "slug": "taskpilot",
      "name": "TaskPilot",
      "year": "2026",
      "role": "Design & Development",
      "accent": "#E63946",
      "screenshot": true,
      "pageVideo": true,
      "description": "A local-first task scheduler for planning the day, tracking what got done and staying focused. It brings a dashboard with your day at a glance, a month calendar, analytics on streaks and trends, desktop reminders, and themes from dark to sandstone.",
      "searchDescription": "A local-first task scheduler with a daily dashboard, month calendar, streak analytics and desktop reminders, for planning the day and staying focused.",
      "github": "https://github.com/premkajiwala-hub/Task-Pilot",
      "shots": 3,
      "photos": true,
      "video": "/media/taskpilot/preview.mp4",
      "videoFrom": 3,
      "videoTo": 19.9
    },
    {
      "slug": "mewar-sync",
      "name": "Mewar Sync",
      "year": "2026",
      "role": "Front-end Development",
      "accent": "#D4A24C",
      "description": "Mewar Sync is an AI-powered platform empowering traditional artisans through voice-based accounting, smart inventory management, financial tracking, and digital tools while preserving India's rich cultural heritage.",
      "searchDescription": "An AI-powered platform for traditional artisans: voice-based accounting, smart inventory and financial tracking, preserving India’s cultural heritage.",
      "github": "https://github.com/premkajiwala-hub/Mewar_Sync.git",
      "shots": 3,
      "video": "/media/mewar-sync/preview.mp4",
      "videoFrom": 3,
      "videoTo": 19.9,
      "photos": true,
      "screenshot": false,
      "pageVideo": true
    },
    {
      "slug": "indus-brain",
      "name": "Indus Brain",
      "year": "2026",
      "role": "Design & Development",
      "accent": "#8A8A8A",
      "description": "IndusBrain is an AI-powered knowledge platform for industrial plants. It reads manuals, logs and standards, builds a knowledge graph, and answers engineering questions with cited evidence, flagging contradictions between documents instead of guessing. Runs fully on your own machine.",
      "searchDescription": "An AI knowledge platform for industrial plants that answers engineering questions from manuals, logs and standards, with cited evidence. Runs locally.",
      "github": "https://github.com/indusbrain/indusbrain.git",
      "shots": 3,
      "video": "/media/indus-brain/preview.mp4",
      "photos": true,
      "screenshot": false,
      "pageVideo": true,
      "thumbFocus": 0.05,
      "videoFrom": 3,
      "videoTo": 21.2
    }
  ]
};
