/*
 * The plain document: no WebGL, no loader, no page code — the HTML as it
 * was served, every word of it readable. For a browser without WebGL or
 * with reduced motion asked for (main.js), and as the last resort when the
 * site fails to start (App) — never a black screen behind the loader.
 */
export default function plainSite() {
  const html = document.documentElement;
  html.classList.add('no-webgl', 'loaded');
  html.classList.remove('is-transitioning', 'lenis', 'lenis-stopped');

  document.querySelector('.loader')?.remove();
  document.querySelector('.canvas')?.remove();
  document.querySelector('.overlay')?.remove();

  document.querySelectorAll('[data-email]').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.location.href = `mailto:${btn.getAttribute('data-email')}`;
    });
  });
}
