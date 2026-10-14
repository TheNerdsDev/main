/*
 * `npm run cms`: the site (http://localhost:5173, as `npm run dev`) and the
 * CMS dashboard (http://localhost:5190) together. Ctrl+C stops both.
 * If the site is already running on 5173 (an `npm run dev` of your own),
 * that one is used and only the dashboard starts.
 */
import { spawn, execFileSync } from 'node:child_process';
import { createConnection } from 'node:net';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));

/** Whether something already answers on this port. */
const taken = (port) => new Promise((resolve) => {
  const sock = createConnection({ port, host: '127.0.0.1' });
  sock.once('connect', () => { sock.end(); resolve(true); });
  sock.once('error', () => resolve(false));
});

execFileSync(process.execPath, ['scripts/generate-pages.mjs'], { cwd: root, stdio: 'inherit' });

const kids = [];
if (await taken(5173)) {
  console.log('\n  The site is already running on http://localhost:5173 — using that one.\n');
} else {
  kids.push(spawn(process.execPath, [vite, '--port', '5173', '--strictPort'], { cwd: root, stdio: 'inherit' }));
}
/* (Opens the dashboard in the browser — unless CMS_NO_OPEN is set.) */
const dashboard = spawn(process.execPath, [vite, '--config', 'cms/vite.config.js', ...(process.env.CMS_NO_OPEN ? [] : ['--open'])], { cwd: root, stdio: 'inherit' });
kids.push(dashboard);

const stop = () => { kids.forEach((k) => k.kill()); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
dashboard.on('exit', stop);
