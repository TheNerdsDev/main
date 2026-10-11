/*
 * The contact form's endpoint (a Supabase Edge Function, Deno).
 *
 * Checks an enquiry, saves it to public.enquiries, and emails it to us
 * through Resend with the sender as the reply-to — so answering it is just
 * hitting Reply. It's saved either way; if the email fails, the row's
 * `emailed` stays false.
 *
 * Deployed public (--no-verify-jwt: the site has no key to send), and
 * guarded instead by: an origin list, a bot trap field, a minimum fill
 * time, a per-sender rate limit, and the same checks as the form.
 *
 * Settings (supabase secrets): RESEND_API_KEY, CONTACT_TO (comma-separated),
 * CONTACT_FROM, ALLOWED_ORIGINS (comma-separated), RATE_SALT.
 * SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by Supabase.
 * Setup, step by step: supabase/README.md.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';

const env = (key: string, fallback = '') => Deno.env.get(key) ?? fallback;
const list = (value: string) => value.split(',').map((s) => s.trim()).filter(Boolean);

const ORIGINS = list(env('ALLOWED_ORIGINS'));
const TO = list(env('CONTACT_TO'));
const FROM = env('CONTACT_FROM', 'The Nerds <onboarding@resend.dev>');
const RESEND_KEY = env('RESEND_API_KEY');
const SALT = env('RATE_SALT', 'the-nerds');

/* The form's fields, and the same rules the page checks
   (src/content/site.js → contact.form.fields). */
type Rule = { label: string; max: number; required?: boolean; kind?: 'email' | 'phone' };
const FIELDS: Record<string, Rule> = {
  name: { label: 'Name', max: 120, required: true },
  email: { label: 'Email', max: 200, required: true, kind: 'email' },
  phone: { label: 'Phone', max: 30, required: true, kind: 'phone' },
  company: { label: 'Company', max: 120 },
  about: { label: 'About them', max: 2000 },
  idea: { label: 'What they have in mind', max: 4000 }
};
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[+\d\s().-]+$/;

const MIN_FILL_MS = 3000;   // faster than this is a script, not a person
const LIMIT = 5;            // enquiries per sender…
const WINDOW_MIN = 10;      // …per this many minutes

const db = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false }
});

function corsHeaders(origin: string): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    Vary: 'Origin'
  };
  if (!ORIGINS.length || ORIGINS.includes(origin)) h['Access-Control-Allow-Origin'] = origin || '*';
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

/** The email to us: every field, the empty ones as a dash. */
function message(data: Record<string, string | null>) {
  const rows = Object.entries(FIELDS).map(([key, rule]) => [rule.label, data[key] || '—']);
  const text = rows.map(([label, value]) => `${label}:\n${value}`).join('\n\n');
  const html = `<div style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.5;color:#111">
<h2 style="margin:0 0 16px">New enquiry from ${esc(data.name ?? '')}</h2>
<table cellpadding="8" style="border-collapse:collapse">${rows
    .map(([label, value]) => `<tr><td style="vertical-align:top;color:#666;white-space:nowrap">${esc(label)}</td><td style="white-space:pre-wrap">${esc(value)}</td></tr>`)
    .join('')}</table>
<p style="color:#666;font-size:13px">Reply to this email to answer them directly.</p></div>`;
  return { text, html };
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin') ?? '';
  const headers = corsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (req.method !== 'POST') return reply(405, { error: 'method' }, headers);
  if (ORIGINS.length && !ORIGINS.includes(origin)) return reply(403, { error: 'origin' }, headers);

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
    else if (v && rule.kind === 'email' && !EMAIL.test(v)) errors[key] = 'email';
    else if (v && rule.kind === 'phone') {
      const digits = v.replace(/\D/g, '').length;
      if (!PHONE.test(v) || digits < 7 || digits > 15) errors[key] = 'phone';
    }
    data[key] = v || null;
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

  if (RESEND_KEY && TO.length) {
    const { text, html } = message(data);
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: FROM,
        to: TO,
        reply_to: data.email,
        subject: `New enquiry from ${data.name}`,
        text,
        html
      })
    });
    if (res.ok) await db.from('enquiries').update({ emailed: true }).eq('id', row.id);
    else console.error('[contact] email failed', res.status, await res.text());
  } else {
    console.warn('[contact] RESEND_API_KEY or CONTACT_TO not set: saved, not emailed');
  }

  return reply(200, { ok: true }, headers);
});
