import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { resolve, join, relative, sep } from 'node:path';

const root = process.cwd();

/* Collect every generated index.html so Vite builds all routes. */
function collectPages(dir = root, found = {}, depth = 0) {
  if (depth > 3) return found;
  for (const entry of readdirSync(dir)) {
    if (['node_modules', 'dist', '.git', 'src', 'scripts', 'public'].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) collectPages(full, found, depth + 1);
  }
  const indexFile = join(dir, 'index.html');
  if (existsSync(indexFile)) {
    /* `relative` + `sep` so entry names are clean on Windows as well as POSIX. */
    const name = dir === root ? 'main' : relative(root, dir).split(sep).join('-');
    found[name] = resolve(indexFile);
  }
  return found;
}

export default defineConfig({
  plugins: [glsl({ compress: false })],
  server: { host: true, port: 5173 },
  build: {
    target: 'es2020',
    assetsInlineLimit: 0,
    rollupOptions: { input: collectPages() }
  }
});
