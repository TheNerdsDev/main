import '@fontsource/anton/400.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './styles/main.css';

import store from './core/Store.js';

/* --------------------------------------------------------------------
   No WebGL, or the visitor asked for reduced motion:
   serve the plain document and wire up only what still makes sense.
   -------------------------------------------------------------------- */
const fallback = () => {
  const html = document.documentElement;
  html.classList.add('no-webgl', 'loaded');
  html.classList.remove('is-transitioning');

  document.querySelector('.loader')?.remove();
  document.querySelector('.canvas')?.remove();
  document.querySelector('.overlay')?.remove();

  document.querySelectorAll('[data-email]').forEach((btn) => {
    btn.addEventListener('click', () => {
      window.location.href = `mailto:${btn.getAttribute('data-email')}`;
    });
  });
};

const boot = async () => {
  if (!store.hasWebGL) return fallback();

  try {
    const { default: App } = await import('./core/App.js');
    window.__app = new App();
  } catch (err) {
    console.error('[app] boot failed, falling back', err);
    fallback();
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
