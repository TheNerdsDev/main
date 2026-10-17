import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { resolve, join, relative, sep } from 'node:path';

const root = process.cwd();

/* Collect every generated index.html so Vite builds all routes. */
function collectPages(dir = root, found = {}, depth = 0) {
  if (depth > 3) return found;
  for (const entry of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git', 'src', 'scripts', 'public', 'cms', 'supabase', '.cms-trash', '.cms-tmp'].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectPages(full, found, depth + 1);
  }
  const indexFile = join(dir, 'index.html');
  if (existsSync(indexFile)) {
    /* `relative` + `sep` so entry names are clean on Windows as well as POSIX. */
    const name = dir === root ? 'main' : relative(root, dir).split(sep).join('-');
    found[name] = resolve(indexFile);
  }
  /* …and the page for an address with no page (scripts/generate-pages.mjs). */
  if (depth === 0 && existsSync(join(root, '404.html'))) found['404'] = resolve(root, '404.html');
  return found;
}

/**
 * An address that has moved is redirected, and one with no page gets the
 * 404 page (404.html), with a 404 status and the address left as typed —
 * in `npm run dev` and `npm run preview`, as on the host (public/.htaccess).
 * A folder asked for without its
 * trailing slash (/work) is sent on to it (/work/), as the host's server
 * does. Runs after Vite has matched the real pages (appType 'mpa' leaves
 * the rest alone instead of handing them the home page), and only for a
 * page request: never a script, picture or fetch.
 */
function notFoundPage() {
  /* The addresses that have moved, as the host has them: the
     `RedirectMatch 301 <pattern> <to>` lines of .htaccess (written by
     `npm run pages` from site.js redirects) — read on each request, so a
     rename in the CMS needs no restart. */
  const redirectsIn = (file) => {
    if (!existsSync(file)) return [];
    return readFileSync(file, 'utf8').split(/\r?\n/)
      .map((line) => line.match(/^\s*RedirectMatch\s+(30[1278])\s+(\S+)\s+(\S+)/))
      .filter(Boolean)
      .map(([, code, pattern, to]) => ({ code: Number(code), test: new RegExp(pattern), to }));
  };
  const handle = (dir, conf, send) => (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const [path, query = ''] = req.url.split('?');
    const name = decodeURIComponent(path);
    const moved = redirectsIn(conf).find((r) => r.test.test(name));
    if (moved) {
      res.statusCode = moved.code;
      res.setHeader('Location', `${moved.to}${query ? `?${query}` : ''}`);
      return res.end();
    }
    if (!(req.headers.accept || '').includes('text/html')) return next();
    if (name.endsWith('.html') && existsSync(join(dir, name))) return next();
    if (!name.endsWith('/') && existsSync(join(dir, name, 'index.html'))) {
      res.statusCode = 301;
      res.setHeader('Location', `${path}/${query ? `?${query}` : ''}`);
      return res.end();
    }
    const file = join(dir, '404.html');
    if (!existsSync(file)) return next();
    Promise.resolve(send(readFileSync(file, 'utf8'))).then((html) => {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end(req.method === 'HEAD' ? undefined : html);
    }, next);
  };
  return {
    name: 'nerds-404',
    configureServer(server) {
      return () => server.middlewares.use(handle(root, join(root, 'public', '.htaccess'), (html) => server.transformIndexHtml('/404.html', html)));
    },
    configurePreviewServer(server) {
      const out = resolve(root, server.config.build.outDir);
      return () => server.middlewares.use(handle(out, join(out, '.htaccess'), (html) => html));
    }
  };
}

export default defineConfig({
  /* Many pages, no single-page fallback: an address with no page is a 404
     (notFoundPage), not the home page. */
  appType: 'mpa',
  plugins: [glsl({ compress: false }), notFoundPage()],
  server: { host: true, port: 5173 },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    rollupOptions: { input: collectPages() }
  }
});
