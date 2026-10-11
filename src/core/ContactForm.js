import gsap from 'gsap';

/* Where enquiries go: the Supabase function's URL, from .env
   (VITE_CONTACT_ENDPOINT — see supabase/README.md). */
const ENDPOINT = import.meta.env.VITE_CONTACT_ENDPOINT;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[+\d\s().-]+$/;

/**
 * The contact page's enquiry form. Checks it here (the function checks it
 * again), sends it to the function — which saves it to the database and
 * emails it to us — and shows how that went: sending, the thank-you, or
 * an error with our address to fall back on. Its words come from the page
 * (site.js → generate-pages.mjs).
 *
 * Errors come back from the function as codes per field (required,
 * email, phone, long), the same ones checked here.
 */
export default class ContactForm {
  constructor(form) {
    this.form = form;
    this.button = form.querySelector('button[type="submit"]');
    this.status = form.querySelector('.form-status');
    this.sent = form.querySelector('.form-sent');
    /* Our address, for the error message. (Not data-email: that marks a
       click-to-copy button, and would turn the whole form into one.) */
    this.email = form.dataset.mailto;
    this.text = JSON.parse(form.dataset.messages || '{}');
    /* When the form came on screen: a person takes a while to fill it in,
       a script doesn't (the function checks this). */
    this.opened = Date.now();

    form.addEventListener('submit', this.onSubmit);
    /* An error clears as soon as the field is touched again. */
    form.addEventListener('input', (e) => this.setError(e.target.closest('.field'), null));
  }

  /** What's wrong, as { field: code }; empty when it's good to go. */
  check(data) {
    const errors = {};
    this.form.querySelectorAll('.field-input').forEach((input) => {
      const v = data[input.name] || '';
      if (input.required && !v) errors[input.name] = 'required';
      else if (v.length > input.maxLength) errors[input.name] = 'long';
      else if (v && input.type === 'email' && !EMAIL.test(v)) errors[input.name] = 'email';
      else if (v && input.type === 'tel') {
        const digits = v.replace(/\D/g, '').length;
        if (!PHONE.test(v) || digits < 7 || digits > 15) errors[input.name] = 'phone';
      }
    });
    return errors;
  }

  setError(field, code) {
    if (!field) return;
    const input = field.querySelector('.field-input');
    field.classList.toggle('is-invalid', !!code);
    input?.setAttribute('aria-invalid', code ? 'true' : 'false');
    const out = field.querySelector('.field-error');
    if (out) out.textContent = code ? this.text[code] || this.text.required : '';
  }

  showErrors(errors) {
    this.form.querySelectorAll('.field').forEach((f) => this.setError(f, errors[f.dataset.field]));
    const first = this.form.querySelector('.field.is-invalid .field-input');
    first?.focus();
  }

  setBusy(on) {
    this.busy = on;
    this.button.disabled = on;
    this.form.setAttribute('aria-busy', String(on));
    this.status.classList.remove('is-error');
    this.status.textContent = on ? this.text.sending : '';
  }

  onSubmit = async (e) => {
    e.preventDefault();
    if (this.busy) return;

    const data = {};
    new FormData(this.form).forEach((v, k) => { data[k] = String(v).trim(); });
    const errors = this.check(data);
    this.showErrors(errors);   // (also clears any left from a try before)
    if (Object.keys(errors).length) return;
    if (!ENDPOINT) {
      console.warn('[ContactForm] VITE_CONTACT_ENDPOINT is not set — see supabase/README.md');
      this.fail();
      return;
    }

    this.setBusy(true);
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, elapsed: Date.now() - this.opened, page: location.pathname })
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok) {
        this.done();
        return;
      }
      if (res.status === 422 && body.errors) {
        this.setBusy(false);
        this.showErrors(body.errors);
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.warn('[ContactForm]', err);
      this.setBusy(false);
      this.fail();
    }
  };

  /** Sent: the fields give way to the thank-you. */
  done() {
    this.busy = false;
    this.form.removeAttribute('aria-busy');
    this.form.classList.add('is-sent');
    this.sent.hidden = false;
    this.sent.focus({ preventScroll: true });
    gsap.from(this.sent.children, { opacity: 0, y: 16, duration: 0.8, ease: 'power3.out', stagger: 0.08 });
  }

  /** Couldn't send: say so, with our address to write to instead. */
  fail() {
    this.status.classList.add('is-error');
    this.status.textContent = `${this.text.failed} `;
    const a = document.createElement('a');
    a.href = `mailto:${this.email}`;
    a.textContent = this.email;
    this.status.append(a, '.');
  }
}
