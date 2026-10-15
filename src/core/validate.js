/*
 * The contact form's rules for a phone number and an email address.
 * (supabase/functions/contact/validate.ts holds the same rules for the
 * server, which checks everything again; change one, change both.)
 */

/**
 * An Indian mobile number: ten digits, the first of them 6, 7, 8 or 9.
 * Typed with or without the country code (+91, 91) or a trunk 0 in front,
 * and with spaces or hyphens between the digits. Nothing else — no letters,
 * no other symbols, no other country's code — and not ten of one digit
 * (9999999999 is no one's number).
 */
export const indianMobile = (value) => {
  const v = String(value).trim();
  if (!/^\+?[\d\s-]+$/.test(v)) return false;

  let digits = v.replace(/\D/g, '');
  if (v.startsWith('+')) {
    if (!digits.startsWith('91')) return false;
    digits = digits.slice(2);
  } else if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  return /^[6-9]\d{9}$/.test(digits) && !/^(\d)\1{9}$/.test(digits);
};

/* An address's parts, each checked on its own (a loose "something@something.xx"
   lets through "a..b@x.com", "a@-x.com" and "a@x.c0m"). */
const LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TLD = /^(?:[A-Za-z]{2,24}|xn--[A-Za-z0-9-]{2,59})$/;

/**
 * Whether it's a well-formed email address: one @; a local part of
 * letters, digits and the usual symbols with no stray dots; a domain of
 * proper labels with at least one dot and a real-looking ending.
 */
export const emailOk = (value) => {
  const v = String(value).trim();
  if (v.length > 254) return false;
  const at = v.indexOf('@');
  if (at < 1 || at !== v.lastIndexOf('@')) return false;
  const local = v.slice(0, at);
  const domain = v.slice(at + 1);
  if (local.length > 64 || !LOCAL.test(local)) return false;
  const labels = domain.split('.');
  if (labels.length < 2) return false;
  return labels.every((l) => LABEL.test(l)) && TLD.test(labels[labels.length - 1]);
};

/**
 * Whether mail can be delivered to a domain at all — looked up in DNS
 * (public DNS-over-HTTPS), so there's nothing to send and nothing for the
 * person to confirm: no code, no link. A domain that doesn't exist (a typo:
 * gmial.con), or that says it takes no mail, is a no. Anything that stops
 * the lookup — offline, blocked, slow — is a yes: it never holds up a real
 * address.
 */
export async function domainTakesMail(domain, { fetchImpl = fetch, timeout = 2500 } = {}) {
  const ask = async (base, type) => {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeout);
    try {
      const res = await fetchImpl(`${base}?name=${encodeURIComponent(domain)}&type=${type}`, {
        headers: { accept: 'application/dns-json' },
        signal: ctl.signal
      });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  };

  for (const base of ['https://cloudflare-dns.com/dns-query', 'https://dns.google/resolve']) {
    const mx = await ask(base, 'MX');
    if (!mx) continue;
    if (mx.Status === 3) return false;   // NXDOMAIN: no such domain
    const records = (mx.Answer || []).filter((r) => r.type === 15);
    /* A lone "0 ." is a null MX: the domain says it takes no mail. */
    if (records.length) return records.some((r) => !/^\s*0\s+\.?\s*$/.test(r.data));
    /* No MX: mail goes to the domain's own address, if it has one. */
    for (const type of ['A', 'AAAA']) {
      const ip = await ask(base, type);
      if (!ip) return true;
      if ((ip.Answer || []).some((r) => r.type === (type === 'A' ? 1 : 28))) return true;
    }
    return false;
  }
  return true;
}
