import { execSync } from 'child_process';
import { buildSync } from 'esbuild';
import { cpSync, mkdirSync, chmodSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';

const require = createRequire(import.meta.url);

// Build overlay (browser bundle)
buildSync({
  entryPoints: ['overlay/overlay.ts'],
  bundle: true,
  format: 'iife',
  outfile: 'dist/overlay.js',
  target: 'es2020',
  minify: false,
});
console.log('Built dist/overlay.js');

// Build CLI + server (TypeScript)
execSync('npx tsc', { stdio: 'inherit' });
chmodSync('dist/cli.js', 0o755);
console.log('Built dist/ (TypeScript)');

// Copy Lucide font assets
mkdirSync('dist/fonts', { recursive: true });
for (const file of ['lucide.css', 'lucide.woff2', 'lucide.woff']) {
  cpSync(require.resolve(`lucide-static/font/${file}`), `dist/fonts/${file}`);
}
console.log('Copied Lucide fonts to dist/fonts/');

// Copy Geist Mono font assets
const geistDistDir = dirname(require.resolve('geist/font/mono'));
for (const file of ['GeistMono-Regular.woff2', 'GeistMono-Medium.woff2']) {
  cpSync(join(geistDistDir, 'fonts', 'geist-mono', file), `dist/fonts/${file}`);
}
console.log('Copied Geist Mono fonts to dist/fonts/');
