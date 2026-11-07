// Renders the app icon, Android adaptive-icon layers, splash image and favicon
// from the logo. Run after changing the mark: `node scripts/make-icons.mjs`.
// Keep the paths in step with STAGE in src/components/Logo.tsx.
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const STAGE = {
  leftCurtain: 'M14 16h17c-2 22-1 44 3 68H14Z',
  rightCurtain: 'M86 16H69c2 22 1 44-3 68h20Z',
  folds: 'M21 26c-1 18 0 38 2 56M27 26c-1 18 0 38 2 56M79 26c1 18 0 38-2 56M73 26c1 18 0 38-2 56',
  valance: 'M14 16h72v9c-4.5 4.4-13.5 4.4-18 0-4.5 4.4-13.5 4.4-18 0-4.5 4.4-13.5 4.4-18 0-4.5 4.4-13.5 4.4-18 0Z',
  trim: 'M14 16h72',
  floor: 'M10 86h80',
};
const RED = '#D7263D';
const DEEP = '#9E1730';
const HOUSE = '#141631';
const GOLD = '#F6C453';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'images');

const defs = `<defs>
  <linearGradient id="curtain" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${RED}"/><stop offset="1" stop-color="${DEEP}"/></linearGradient>
  <radialGradient id="light" cx="50" cy="84" r="34" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${GOLD}" stop-opacity=".6"/><stop offset="1" stop-color="${GOLD}" stop-opacity="0"/></radialGradient></defs>`;

// The stage in colour, scaled about the centre (adaptive icons crop to the middle ~61%)
const scene = (scale = 1) => `<g transform="translate(50 50) scale(${scale}) translate(-50 -50)">
  <rect x="14" y="16" width="72" height="68" fill="url(#light)"/>
  <path d="${STAGE.leftCurtain}" fill="url(#curtain)"/><path d="${STAGE.rightCurtain}" fill="url(#curtain)"/>
  <path d="${STAGE.folds}" stroke="${DEEP}" stroke-width="1.6" fill="none" stroke-linecap="round" opacity=".9"/>
  <path d="${STAGE.valance}" fill="${RED}"/>
  <path d="${STAGE.trim}" stroke="${GOLD}" stroke-width="3"/>
  <path d="${STAGE.floor}" stroke="${GOLD}" stroke-width="5" stroke-linecap="round"/></g>`;

// One colour (Android 13+ themed icons): curtains, valance and stage floor
const silhouette = (color, scale) => `<g transform="translate(50 50) scale(${scale}) translate(-50 -50)">
  <path d="${STAGE.leftCurtain}" fill="${color}"/><path d="${STAGE.rightCurtain}" fill="${color}"/>
  <path d="${STAGE.valance}" fill="${color}"/>
  <path d="${STAGE.floor}" stroke="${color}" stroke-width="5" stroke-linecap="round"/></g>`;

const svg = (body) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">${defs}${body}</svg>`;

function png(name, size, body) {
  const r = new Resvg(svg(body), { fitTo: { mode: 'width', value: size }, background: 'rgba(0,0,0,0)' });
  writeFileSync(join(out, name), r.render().asPng());
  console.log(`${name} ${size}x${size}`);
}

const house = `<rect width="100" height="100" fill="${HOUSE}"/>`;
// Full icon (iOS and fallback): the launcher rounds the corners itself
png('icon.png', 1024, `${house}${scene(0.92)}`);
// Android adaptive icon: dark background + the stage kept inside the safe zone
png('android-icon-background.png', 512, house);
png('android-icon-foreground.png', 512, scene(0.7));
png('android-icon-monochrome.png', 432, silhouette('#000000', 0.7));
// Splash: the stage on the dark splash background
png('splash-icon.png', 512, scene(1));
// Web favicon
png('favicon.png', 48, `<rect width="100" height="100" rx="22" fill="${HOUSE}"/>${scene(0.95)}`);
