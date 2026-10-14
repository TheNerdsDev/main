/*
 * The CMS dashboard (`npm run cms`): its own little app, on this computer
 * only (127.0.0.1), never part of the site's build — the site's
 * vite.config.js skips this folder.
 */
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import cmsApi from './server/api.js';

export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  publicDir: false,
  clearScreen: false,
  plugins: [cmsApi()],
  server: {
    host: '127.0.0.1',
    port: 5190,
    strictPort: true,
    /* Don't reload the dashboard when it rewrites the site's files. */
    watch: { ignored: ['**/originals/**', '**/server/**'] }
  }
});
