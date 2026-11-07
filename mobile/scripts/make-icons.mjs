// Renders the app icon, Android adaptive-icon layers, splash image and favicon
// from the logo. Run after changing the mark: `node scripts/make-icons.mjs`.
// Keep ARCH / PLAY / STAGE in step with MARK in src/components/Logo.tsx.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const ARCH = 'M22 66V46a28 22 0 0 1 56 0v20';
const PLAY = 'M44.5 39v22l18-11Z';
const STAGE = 'M15 76h70';
const RED = '#D7263D';
const DEEP = '#9E1730';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'images');

const gradient = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="${RED}"/><stop offset="1" stop-color="${DEEP}"/></linearGradient></defs>`;

// The mark, scaled about the centre (adaptive icons crop to the middle ~61%)
const glyph = (color, scale = 1) => `<g transform="translate(50 50) scale(${scale}) translate(-50 -50)">
  <path d="${ARCH}" fill="none" stroke="${color}" stroke-width="7" stroke-linecap="round"/>
  <path d="${PLAY}" fill="${color}" stroke="${color}" stroke-width="4" stroke-linejoin="round"/>
  <path d="${STAGE}" stroke="${color}" stroke-width="6" stroke-linecap="round"/></g>`;

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${body}</svg>`;

function png(name, size, body) {
  const r = new Resvg(svg(body), { fitTo: { mode: 'width', value: size }, background: 'rgba(0,0,0,0)' });
  writeFileSync(join(out, name), r.render().asPng());
  console.log(`${name} ${size}x${size}`);
}

// Full icon (iOS and fallback): the launcher rounds the corners itself
png('icon.png', 1024, `${gradient}<rect width="100" height="100" fill="url(#g)"/>${glyph('#FFFFFF', 0.82)}`);
// Android adaptive icon: background + foreground kept inside the safe zone
png('android-icon-background.png', 512, `${gradient}<rect width="100" height="100" fill="url(#g)"/>`);
png('android-icon-foreground.png', 512, glyph('#FFFFFF', 0.66));
// Android 13+ themed icons: one colour, the system tints it
png('android-icon-monochrome.png', 432, glyph('#000000', 0.66));
// Splash: white mark on the red splash background
png('splash-icon.png', 512, glyph('#FFFFFF', 1));
// Web favicon
png('favicon.png', 48, `${gradient}<rect width="100" height="100" rx="22" fill="url(#g)"/>${glyph('#FFFFFF', 0.9)}`);
