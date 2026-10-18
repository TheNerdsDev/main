import '@fontsource/anton/400.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
/* The subtext under each page's heading (.subtext): Latin only, regular and bold. */
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import '@fontsource/atkinson-hyperlegible/latin-700.css';
import './styles/main.css';

import store from './core/Store.js';
/* No WebGL, or the visitor asked for reduced motion: the plain document,
   wired up only where that still makes sense. */
import fallback from './core/plain.js';

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
