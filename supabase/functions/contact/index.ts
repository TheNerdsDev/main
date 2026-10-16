/*
 * The contact form's endpoint (a Supabase Edge Function, Deno).
 *
 * Checks an enquiry, saves it to public.enquiries, and emails it to us
 * through Resend with the sender as the reply-to — so answering it is just
 * hitting Reply. It's saved either way; if the email fails, the row's
 * `emailed` stays false. Once it sends from our own domain, the client
 * also gets a short thank-you; replying to that reaches us.
 *
 * From our own domain, the thank-you goes first, and what becomes of it
 * says whether their address is real: delivered, and the enquiry reaches
 * us from enquiries@ (allow-listed in our mailbox: the Inbox); bounced —
 * the address doesn't exist — and it comes from unverified@, marked so
 * (our mailbox files that sender under Spam). Neither is our own inbox's
 * address: mail "from" our own address, arriving from outside (Resend),
 * looks like spoofing to our host's filter, and went to Spam however real.
 *
 * Deployed public (--no-verify-jwt: the site has no key to send), and
 * guarded instead by: an origin list, a bot trap field, a minimum fill
 * time, a per-sender rate limit, and the same checks as the form.
 *
 * Settings (supabase secrets): RESEND_API_KEY, CONTACT_TO (comma-separated),
 * CONTACT_FROM, CONTACT_REPLY_TO, ALLOWED_ORIGINS (comma-separated),
 * RATE_SALT; CONTACT_THANKS=off to stop the thank-you. Optional:
 * CONTACT_NOTIFY_FROM / CONTACT_UNVERIFIED_FROM (default enquiries@ and
 * unverified@ on CONTACT_FROM's domain).
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
 * Setup, step by step: supabase/README.md.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { domainTakesMail, emailOk, indianMobile } from './validate.ts';

/* Supabase's runtime: keeps the function alive for work finished after it
   has answered. */
declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const env = (key: string, fallback = '') => Deno.env.get(key) ?? fallback;
const list = (value: string) => value.split(',').map((s) => s.trim()).filter(Boolean);

const ORIGINS = list(env('ALLOWED_ORIGINS'));
const TO = list(env('CONTACT_TO'));
const FROM = env('CONTACT_FROM', 'The Nerds <onboarding@resend.dev>');
const FROM_ADDRESS = (FROM.match(/<([^>]+)>/)?.[1] ?? FROM).trim();
/* Where a client's reply to the thank-you goes. */
const REPLY_TO = env('CONTACT_REPLY_TO') || TO[0] || FROM_ADDRESS;
/* Resend's shared test sender can only write to the account's own address:
   the thank-you needs our own, verified domain. */
const THANKS = env('CONTACT_THANKS', 'on') !== 'off' && !FROM_ADDRESS.endsWith('@resend.dev');
const RESEND_KEY = env('RESEND_API_KEY');
/* Who an enquiry reaches us from: never our inbox's own address (see the
   top). Real address → NOTIFY_FROM (allow-listed: Inbox); one that bounced
   → UNVERIFIED_FROM (filtered to Spam). */
const DOMAIN = FROM_ADDRESS.slice(FROM_ADDRESS.lastIndexOf('@') + 1);
const NOTIFY_FROM = env('CONTACT_NOTIFY_FROM', `enquiries@${DOMAIN}`);
const UNVERIFIED_FROM = env('CONTACT_UNVERIFIED_FROM', `unverified@${DOMAIN}`);
/* How long the enquiry may wait for the thank-you's fate, and how often to
   ask. A missing mailbox is refused on the spot (Gmail and most hosts answer
   in a second or two); past this, the enquiry is sent as usual. */
const VERDICT_WAIT_MS = 12_000;
const VERDICT_EVERY_MS = 1_500;
const SALT = env('RATE_SALT', 'the-nerds');

const SITE = { name: 'The Nerds' };

/* The form's fields, and the same rules the page checks
   (src/content/site.js → contact.form.fields). */
type Rule = { label: string; max: number; required?: boolean; kind?: 'email' | 'phone' };
const FIELDS: Record<string, Rule> = {
  name: { label: 'Name', max: 120, required: true },
  email: { label: 'Email', max: 200, required: true, kind: 'email' },
  phone: { label: 'Phone', max: 30, kind: 'phone' },
  company: { label: 'Company', max: 120 },
  about: { label: 'About them', max: 2000 },
  idea: { label: 'What they have in mind', max: 4000, required: true }
};

const MIN_FILL_MS = 3000;   // faster than this is a script, not a person
const LIMIT = 5;            // enquiries per sender…
const WINDOW_MIN = 10;      // …per this many minutes

const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false }
});

/* Our own dev servers, on any port: this computer, or another device on the
   same home/office network (whose address changes from network to network).
   Only reachable on that network, so nothing on the internet gets in. */
const LOCAL = /^http:\/\/(localhost|127(\.\d{1,3}){3}|\[::1\]|10(\.\d{1,3}){3}|192\.168(\.\d{1,3}){2}|172\.(1[6-9]|2\d|3[01])(\.\d{1,3}){2})(:\d{1,5})?$/;

const allowed = (origin: string) => !ORIGINS.length || ORIGINS.includes(origin) || LOCAL.test(origin);

function corsHeaders(origin: string): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    Vary: 'Origin'
  };
  if (allowed(origin)) h['Access-Control-Allow-Origin'] = origin || '*';
  return h;
}

const reply = (status: number, body: unknown, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers });

async function sha256(text: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/* What became of the thank-you: their address is real, doesn't exist, or
   couldn't be told in time (or there was no thank-you to tell by). */
type Verdict = 'real' | 'bounced' | 'unknown';

const WARNING: Record<Verdict, string> = {
  real: '',
  bounced: 'Their email address doesn’t exist — the thank-you sent to it bounced. Likely fake: don’t rely on replying.',
  unknown: ''
};

/** The email to us: every field, the empty ones as a dash. */
function message(data: Record<string, string | null>, verdict: Verdict = 'unknown') {
  const rows = Object.entries(FIELDS).map(([key, rule]) => [rule.label, data[key] || '—']);
  const warn = WARNING[verdict];
  const text = (warn ? `⚠ ${warn}\n\n` : '') + rows.map(([label, value]) => `${label}:\n${value}`).join('\n\n');
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">
${warn ? `<p style="margin:0 0 16px;padding:10px 14px;border-radius:8px;background:#fdecea;color:#8a1c12">⚠ ${esc(warn)}</p>\n` : ''}<h2 style="margin:0 0 16px">New enquiry from ${esc(data.name ?? '')}</h2>
<table cellpadding="8" style="border-collapse:collapse">${rows
    .map(([label, value]) => `<tr><td style="vertical-align:top;color:#666;white-space:nowrap">${esc(label)}</td><td style="white-space:pre-wrap">${esc(value)}</td></tr>`)
    .join('')}</table>
<p style="color:#666;font-size:13px">Reply to this email to answer them directly.</p></div>`;
  return { text, html };
}

/** The thank-you to the client: just our message, under our name. */
const THANKS_NOTE = [
  'Thanks for getting in touch with The Nerds! We’ve received your message, and our team will be happy to get back to you within 24 hours.',
  'We’re glad you reached out and look forward to connecting with you!'
];

function thanks(data: Record<string, string | null>) {
  const first = (data.name ?? '').split(/\s+/)[0] || 'there';
  const subject = `Thanks for reaching out, ${first}!`;
  const text = THANKS_NOTE.join('\n\n');
  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#f2f1ec">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2f1ec"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden">
<tr><td style="background:#05060f;padding:26px 32px">
<div style="font-family:Impact,'Arial Narrow Bold','Arial Narrow',Arial,sans-serif;font-size:26px;letter-spacing:2px;color:#f4f3ee;text-transform:uppercase">${esc(SITE.name)}</div>
</td></tr>
<tr><td style="padding:32px 32px 16px;font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;color:#1a1a1a">
${THANKS_NOTE.map((p) => `<p style="margin:0 0 16px">${esc(p)}</p>`).join('\n')}
</td></tr>
</table>
</td></tr></table>
</body></html>`;
  return { subject, text, html };
}

/** One email through Resend: its id if it was accepted, else null. */
async function send(email: Record<string, unknown>, what: string): Promise<string | null> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(email)
  });
  if (!res.ok) {
    console.error(`[contact] ${what} failed`, res.status, await res.text());
    return null;
  }
  try {
    return String((await res.json()).id ?? '') || 'sent';
  } catch {
    return 'sent';
  }
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * What became of an email we sent (Resend's last event for it): delivered
 * — or opened, clicked, even reported — means the address is real; bounced
 * means it isn't. Asked every moment until one or the other, or until
 * VERDICT_WAIT_MS has gone by.
 */
async function verdict(id: string): Promise<Verdict> {
  const until = Date.now() + VERDICT_WAIT_MS;
  while (Date.now() < until) {
    await pause(VERDICT_EVERY_MS);
    try {
      const res = await fetch(`https://api.resend.com/emails/${id}`, { headers: { Authorization: `Bearer ${RESEND_KEY}` } });
      /* A Sending-access key may send but not look: it will never tell, so
         don't keep the enquiry waiting on it. */
      if (res.status === 401 || res.status === 403) {
        console.warn('[contact] RESEND_API_KEY cannot read an email’s status (it needs Full access): addresses not checked');
        return 'unknown';
      }
      if (!res.ok) continue;
      const last = String((await res.json()).last_event ?? '');
      if (last === 'bounced') return 'bounced';
      if (['delivered', 'opened', 'clicked', 'complained'].includes(last)) return 'real';
      /* Their server said "try later": that can take hours to settle. */
      if (last === 'delivery_delayed') return 'unknown';
    } catch {
      /* asked again in a moment */
    }
  }
  return 'unknown';
}

/* For a display name in a From line: no quotes, brackets or line breaks. */
const displayName = (s: string) => s.replace(/["<>\r\n,;]/g, '').trim().slice(0, 60);

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  const headers = corsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply(405, { error: 'method' }, headers);
  if (!allowed(origin)) return reply(403, { error: 'origin' }, headers);

  const raw = await req.text();
  if (raw.length > 20_000) return reply(413, { error: 'too large' }, headers);
  let input: Record<string, unknown>;
  try {
    input = JSON.parse(raw);
    if (!input || typeof input !== 'object') throw new Error();
  } catch {
    return reply(400, { error: 'json' }, headers);
  }

  /* A bot: the trap filled in, or sent faster than anyone types. Answer as
     if it worked (so it doesn't learn), keep nothing. */
  if (String(input.website ?? '').trim() || !(Number(input.elapsed) >= MIN_FILL_MS)) {
    return reply(200, { ok: true }, headers);
  }

  const data: Record<string, string | null> = {};
  const errors: Record<string, string> = {};
  for (const [key, rule] of Object.entries(FIELDS)) {
    const v = String(input[key] ?? '').trim();
    if (rule.required && !v) errors[key] = 'required';
    else if (v.length > rule.max) errors[key] = 'long';
    else if (v && rule.kind === 'email' && !emailOk(v)) errors[key] = 'email';
    else if (v && rule.kind === 'phone' && !indianMobile(v)) errors[key] = 'phone';
    data[key] = v || null;
  }
  /* The address's domain must be one mail can reach (its DNS: nothing is
     sent, nobody confirms anything). */
  if (!errors.email && data.email && !(await domainTakesMail(data.email.slice(data.email.lastIndexOf('@') + 1)))) {
    errors.email = 'emailDomain';
  }
  if (Object.keys(errors).length) return reply(422, { errors }, headers);

  /* At most LIMIT per sender per WINDOW_MIN, known by a hash of their IP. */
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown';
  const ipHash = await sha256(`${SALT}:${ip}`);
  const since = new Date(Date.now() - WINDOW_MIN * 60_000).toISOString();
  const { count } = await db
    .from('enquiries')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .gte('created_at', since);
  if ((count ?? 0) >= LIMIT) return reply(429, { error: 'slow down' }, headers);

  const { data: row, error } = await db
    .from('enquiries')
    .insert({ ...data, page: String(input.page ?? '').slice(0, 200) || null, ip_hash: ipHash })
    .select('id')
    .single();
  if (error || !row) {
    console.error('[contact] save failed', error);
    return reply(500, { error: 'save' }, headers);
  }

  if (!RESEND_KEY || !TO.length) {
    console.warn('[contact] RESEND_API_KEY or CONTACT_TO not set: saved, not emailed');
    return reply(200, { ok: true }, headers);
  }

  /* Saved, so it's safe: answer now, and send the emails after — the
     visitor doesn't wait on them. */
  const emails = (async () => {
    /* From our own domain: the thank-you first, and its fate decides how the
       enquiry reaches us (see the top). On Resend's test sender there's no
       thank-you, so nothing to tell by: straight to us, as it is. */
    let seen: Verdict = 'unknown';
    if (THANKS) {
      const id = await send({ from: FROM, to: [data.email], reply_to: REPLY_TO, ...thanks(data) }, 'thank-you');
      if (id && id !== 'sent') seen = await verdict(id);
    }
    const { text, html } = message(data, seen);
    /* To us — from "Their Name via The Nerds", so the inbox shows who it is. */
    const who = displayName(data.name ?? '');
    const sender = seen === 'bounced' ? UNVERIFIED_FROM : NOTIFY_FROM;
    const usOk = await send({
      from: THANKS ? `${who || 'Someone'} via ${SITE.name} <${sender}>` : FROM,
      to: TO,
      reply_to: data.email,
      subject: `${seen === 'bounced' ? '[Unverified] ' : ''}New enquiry from ${data.name}`,
      text,
      html
    }, 'email to us');
    if (usOk) await db.from('enquiries').update({ emailed: true }).eq('id', row.id);
  })().catch((err) => console.error('[contact] emails failed', err));

  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(emails);
  else await emails;
  return reply(200, { ok: true }, headers);
});
