// Draws DayFlow's icons from one design: phone-app sources (assets/), web app icons (icons/)
// and the white Android notification icon. Run: node tools/make-icons.js
// Then: npx @capacitor/assets generate --android   (phone icons + splash from assets/)
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const root = path.join(__dirname, "..");
const out = (...p) => path.join(root, ...p);
fs.mkdirSync(out("assets"), { recursive: true });

const TEAL = "#0e6b58";
const NAVY = "#070b18";
// The logo's lines and dot on a 512 canvas; `scale` shrinks it toward the centre (safe zones).
const glyph = (scale = 1, color = "#ffffff", dot = "#e69f00") => {
  const t = `translate(${256 * (1 - scale)} ${256 * (1 - scale)}) scale(${scale})`;
  return `<g transform="${t}">
    <path d="M146 176h128M146 264h220M146 352h92" stroke="${color}" stroke-width="40" stroke-linecap="round" fill="none"/>
    <circle cx="366" cy="176" r="44" fill="${dot}"/></g>`;
};
const svg = (body, bg) =>
  Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${bg || ""}${body}</svg>`);
const rounded = `<rect width="512" height="512" rx="112" fill="${TEAL}"/>`;
const square = `<rect width="512" height="512" fill="${TEAL}"/>`;

const png = (input, size, file) => sharp(input, { density: 600 }).resize(size, size).png().toFile(file);

(async () => {
  // Phone app sources for @capacitor/assets
  await png(svg(glyph(1), square), 1024, out("assets", "icon-only.png"));
  await png(svg(glyph(0.62)), 1024, out("assets", "icon-foreground.png")); // inside the adaptive-icon safe zone
  await png(svg("", square), 1024, out("assets", "icon-background.png"));
  const splash = (bg) =>
    sharp({ create: { width: 2732, height: 2732, channels: 4, background: bg } })
      .composite([{ input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="560" height="560">${rounded}${glyph(1)}</svg>`), gravity: "center" }])
      .png();
  await splash(NAVY).toFile(out("assets", "splash.png"));
  await splash(NAVY).toFile(out("assets", "splash-dark.png"));

  // Web app (Add to Home Screen)
  await png(svg(glyph(1), rounded), 192, out("icons", "icon-192.png"));
  await png(svg(glyph(1), rounded), 512, out("icons", "icon-512.png"));
  await png(svg(glyph(0.8), square), 512, out("icons", "maskable-512.png")); // full-bleed, glyph in the safe zone
  await png(svg(glyph(0.86), square), 180, out("icons", "apple-touch-icon.png")); // iOS rounds the corners itself

  // Android notification icon: white on transparent (Android tints it)
  const sizes = { mdpi: 24, hdpi: 36, xhdpi: 48, xxhdpi: 72, xxxhdpi: 96 };
  for (const [dpi, size] of Object.entries(sizes)) {
    const dir = out("android", "app", "src", "main", "res", `drawable-${dpi}`);
    fs.mkdirSync(dir, { recursive: true });
    await png(svg(glyph(1.1, "#ffffff", "#ffffff")), size, path.join(dir, "ic_stat_dayflow.png"));
  }
  console.log("Icons written.");
})();
