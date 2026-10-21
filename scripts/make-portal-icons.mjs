// Draws the portal's icons (desktop app icon, browser-tab icon) from one picture and
// writes them into portal/src/icons.ts, which the portal serves. Run from the
// repository root after changing the picture:
//
//   node scripts/make-portal-icons.mjs
//
// Uses this repository's Playwright browser to turn the SVG into PNG files, so owners'
// portals never need to run it: icons.ts is committed.

import { writeFileSync } from "node:fs";
import { chromium } from "playwright";

/** The header's speech bubble with a tick, white on the portal's teal. */
function iconSvg({ rounded, scale }) {
  const offset = (512 - 32 * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
    `<rect width="512" height="512" rx="${rounded ? 112 : 0}" fill="#0d5c73"/>` +
    `<g transform="translate(${offset} ${offset + scale}) scale(${scale})">` +
    `<rect x="2" y="2" width="28" height="23" rx="7" fill="#ffffff"/>` +
    `<path d="M9 25 L9 30 L15 25 Z" fill="#ffffff"/>` +
    `<path d="M10 14 L14.5 18.5 L22.5 9.5" fill="none" stroke="#0d5c73" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>` +
    `</g></svg>`;
}

// Rounded corners for desktops and tabs; a full square, with the picture kept inside the
// middle, for systems that cut icons into their own shape (Android, some launchers).
const ROUNDED = iconSvg({ rounded: true, scale: 11 });
const FULL_SQUARE = iconSvg({ rounded: false, scale: 11 });
const MASKABLE = iconSvg({ rounded: false, scale: 8 });

const browser = await chromium.launch();
const page = await browser.newPage();

async function png(svg, size) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<html><body style="margin:0;background:transparent">` +
      `<img src="data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}" width="${size}" height="${size}" style="display:block">` +
      `</body></html>`,
  );
  await page.waitForFunction(() => document.querySelector("img").complete);
  return page.screenshot({ omitBackground: true, type: "png" });
}

/** A .ico file holding PNG images (every current browser and Windows reads these). */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = 6 + 16 * images.length;
  const entries = images.map(({ size, data }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0);
    entry.writeUInt8(size >= 256 ? 0 : size, 1);
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(data.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += data.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.data)]);
}

const files = {
  "icon-192.png": await png(ROUNDED, 192),
  "icon-512.png": await png(ROUNDED, 512),
  "icon-maskable-512.png": await png(MASKABLE, 512),
  // Apple adds its own rounded corners, and wants no see-through parts.
  "apple-touch-icon.png": await png(FULL_SQUARE, 180),
};
const favicon = ico([
  { size: 16, data: await png(ROUNDED, 16) },
  { size: 32, data: await png(ROUNDED, 32) },
  { size: 48, data: await png(ROUNDED, 48) },
]);
await browser.close();

const out = `// The portal's icons. Made by scripts/make-portal-icons.mjs in the repository root;
// don't edit by hand. Served by index.tsx at /icon.svg, /favicon.ico and /icons/*.png.

export const ICON_SVG = ${JSON.stringify(ROUNDED)};

/** .ico file with 16, 32 and 48 pixel images, base64. */
export const FAVICON_ICO = "${favicon.toString("base64")}";

/** PNG icons by file name, base64. */
export const PNG_ICONS: Record<string, string> = {
${Object.entries(files).map(([name, data]) => `  "${name}": "${data.toString("base64")}",`).join("\n")}
};
`;
writeFileSync(new URL("../portal/src/icons.ts", import.meta.url), out);
for (const [name, data] of Object.entries(files)) console.log(`${name}: ${data.length} bytes`);
console.log(`favicon.ico: ${favicon.length} bytes`);
