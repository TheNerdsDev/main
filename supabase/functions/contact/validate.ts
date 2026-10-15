/*
 * The rules for a phone number and an email address — the same as the
 * page's (src/core/validate.js); the function checks them again, so a
 * script can't skip what the form asks.
 */

/**
 * An Indian mobile number: ten digits, the first of them 6, 7, 8 or 9.
 * With or without +91 / 91 / a trunk 0, spaces or hyphens between the
 * digits; nothing else, and not ten of one digit.
 */
export const indianMobile = (value: string): boolean => {
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

const LOCAL = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$/;
const LABEL = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;
const TLD = /^(?:[A-Za-z]{2,24}|xn--[A-Za-z0-9-]{2,59})$/;

/** Whether it's a well-formed email address (see the page's emailOk). */
export const emailOk = (value: string): boolean => {
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

/** What a DNS lookup of one kind gives: the records, or null when there are none. */
type Lookup = (domain: string, kind: 'MX' | 'A' | 'AAAA') => Promise<unknown[] | null>;

const lookup: Lookup = async (domain, kind) => {
  try {
    const found = await Deno.resolveDns(domain, kind);
    return found as unknown[];
  } catch (err) {
    /* "No such record" — as opposed to the lookup itself failing. */
    if (err instanceof Deno.errors.NotFound) return null;
    throw err;
  }
};

/**
 * Whether mail can be delivered to a domain at all, from its DNS: no MX
 * and no address of its own, or a "null MX" (it says it takes no mail), is
 * a no. Nothing is sent and nobody confirms anything. A lookup that fails
 * — the runtime can't do it, or it times out — is a yes: it never turns a
 * real address away.
 */
export async function domainTakesMail(domain: string, ask: Lookup = lookup): Promise<boolean> {
  try {
    const timeout = new Promise<'late'>((resolve) => setTimeout(() => resolve('late'), 2500));
    const check = (async () => {
      const mx = (await ask(domain, 'MX')) as { exchange: string }[] | null;
      if (mx?.length) return mx.some((r) => r.exchange && r.exchange !== '.');
      for (const kind of ['A', 'AAAA'] as const) {
        const ip = await ask(domain, kind);
        if (ip?.length) return true;
      }
      return false;
    })();
    const result = await Promise.race([check, timeout]);
    return result === 'late' ? true : result;
  } catch {
    return true;
  }
}
