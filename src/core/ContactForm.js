import gsap from 'gsap';

/* Where enquiries go: the Supabase function's URL, from .env
   (VITE_CONTACT_ENDPOINT — see supabase/README.md). */
const ENDPOINT = import.meta.env.VITE_CONTACT_ENDPOINT;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE = /^[+\d\s().-]+$/;

/**
 * The contact page's enquiry form. Checks it here (the function checks it
 * again), sends it to the function — which saves it to the database and
 * emails it to us — and shows the thank-you at once: the checks here are
 * the function's own, so once they pass it's as good as through. Only if
 * the sending then fails does the form come back, as filled in, with an
 * error and our address to fall back on. Its words come from the page
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
    /* A field with something in it is marked filled (pages.css). A red one
       goes back to normal the moment it's being put right — clicked into,
       tabbed to, typed in — and the next submit checks it again. (Not when
       the form itself moves there after a submit: that one stays red until
       it's touched.) */
    form.addEventListener('input', (e) => {
      const field = e.target.closest('.field');
      field?.classList.toggle('is-filled', !!e.target.value.trim());
      this.unmark(field);
    });
    form.addEventListener('focusin', (e) => { if (!this.moving) this.unmark(e.target.closest('.field')); });
    form.addEventListener('pointerdown', (e) => this.unmark(e.target.closest('.field')));
  }

  /** A red field back to plain: no colour, no message. */
  unmark(field) {
    if (!field?.classList.contains('is-invalid')) return;
    field.classList.remove('is-invalid');
    field.querySelector('.field-input')?.setAttribute('aria-invalid', 'false');
    const out = field.querySelector('.field-error');
    if (out) out.textContent = '';
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

  /** A submit's verdict on one field: red with what's wrong, or green
      when it's filled in and fine (an empty optional one stays plain). */
  setState(field, code) {
    if (!field) return;
    const input = field.querySelector('.field-input');
    field.classList.toggle('is-invalid', !!code);
    field.classList.toggle('is-valid', !code && !!input?.value.trim());
    input?.setAttribute('aria-invalid', code ? 'true' : 'false');
    const out = field.querySelector('.field-error');
    if (out) out.textContent = code ? this.text[code] || this.text.required : '';
  }

  showErrors(errors) {
    this.form.querySelectorAll('.field').forEach((f) => this.setState(f, errors[f.dataset.field]));
    const first = this.form.querySelector('.field.is-invalid .field-input');
    /* (Moved there by the form, not by them: it stays red — see unmark.) */
    this.moving = true;
    first?.focus();
    this.moving = false;
  }

  onSubmit = (e) => {
    e.preventDefault();
    if (this.busy) return;

    const data = {};
    new FormData(this.form).forEach((v, k) => { data[k] = String(v).trim(); });
    const errors = this.check(data);
    this.showErrors(errors);   // (also clears any left from a try before)
    if (Object.keys(errors).length) return;
    this.status.classList.remove('is-error');
    this.status.textContent = '';
    if (!ENDPOINT) {
      console.warn('[ContactForm] VITE_CONTACT_ENDPOINT is not set — see supabase/README.md');
      this.fail();
      return;
    }

    /* Thanked straight away; it goes in the background. */
    this.busy = true;
    this.done();
    this.post(data);
  };

  /**
   * Off to the function. Sent as plain text (the function reads it as
   * JSON either way): that's a "simple" request, with no permission check
   * first — one round trip, not two. keepalive: it still goes through if
   * they leave the page straight after.
   */
  async post(data) {
    try {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
        body: JSON.stringify({ ...data, elapsed: Date.now() - this.opened, page: location.pathname })
      });
      if (res.ok) {
        this.busy = false;
        return;
      }
      const body = await res.json().catch(() => ({}));
      this.undo();
      if (res.status === 422 && body.errors) {
        this.showErrors(body.errors);
        return;
      }
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      console.warn('[ContactForm]', err);
      this.undo();
      this.fail();
    }
  }

  /** Sent: the fields give way to the thank-you. */
  done() {
    this.form.classList.add('is-sent');
    this.sent.hidden = false;
    this.sent.focus({ preventScroll: true });
    gsap.from(this.sent.children, { opacity: 0, y: 16, duration: 0.8, ease: 'power3.out', stagger: 0.08 });
  }

  /** It didn't go after all: back to the form, just as they filled it in. */
  undo() {
    this.busy = false;
    gsap.killTweensOf(this.sent.children);
    gsap.set(this.sent.children, { clearProps: 'opacity,transform' });
    this.sent.hidden = true;
    this.form.classList.remove('is-sent');
    this.button.focus({ preventScroll: true });
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
