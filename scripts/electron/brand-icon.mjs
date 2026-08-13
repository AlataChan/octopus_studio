#!/usr/bin/env node
/**
 * brand-icon.mjs — White-label desktop icon helper.
 *
 * Takes one square source image and writes electron/build-resources/icon.png
 * (and dmg.png). electron-builder auto-generates the macOS .icns / Windows .ico
 * from this 1024x1024 PNG on the next build — no platform-specific tooling needed.
 *
 * Usage:
 *   yarn electron:brand-icon <path-to-square-icon.(png|jpg|webp)>
 *
 * Then build the branded app, e.g.:
 *   BRAND_PRODUCT_NAME="Acme AI" BRAND_APP_ID="com.acme.ai" yarn electron:build:arm64
 *
 * To revert to the default Octopus Studio icon, delete
 * electron/build-resources/icon.png (and dmg.png); the config falls back to the
 * bundled .icns files.
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "../..");
const BUILD_RESOURCES_DIR = path.join(REPO_ROOT, "electron/build-resources");
const MIN_SIZE = 512;
const OUTPUT_SIZE = 1024;

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

async function main() {
  const src = process.argv[2];
  if (!src) {
    fail(
      "Usage: yarn electron:brand-icon <path-to-square-icon.png>\n" +
        "  (square image, at least 512x512; 1024x1024 recommended)"
    );
  }

  const srcPath = path.resolve(process.cwd(), src);
  if (!fs.existsSync(srcPath)) fail(`Source icon not found: ${srcPath}`);

  const meta = await sharp(srcPath).metadata();
  const { width, height } = meta;
  if (!width || !height) fail("Could not read image dimensions.");
  if (width !== height)
    fail(`Icon must be square. Got ${width}x${height}.`);
  if (width < MIN_SIZE)
    fail(`Icon must be at least ${MIN_SIZE}x${MIN_SIZE}. Got ${width}x${height}.`);

  fs.mkdirSync(BUILD_RESOURCES_DIR, { recursive: true });
  const iconOut = path.join(BUILD_RESOURCES_DIR, "icon.png");
  const dmgOut = path.join(BUILD_RESOURCES_DIR, "dmg.png");

  await sharp(srcPath)
    .resize(OUTPUT_SIZE, OUTPUT_SIZE, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toFile(iconOut);
  fs.copyFileSync(iconOut, dmgOut);

  console.log(`✓ Wrote ${path.relative(REPO_ROOT, iconOut)}`);
  console.log(`✓ Wrote ${path.relative(REPO_ROOT, dmgOut)}`);
  console.log("");
  console.log("Next — build the branded desktop app, e.g.:");
  console.log(
    '  BRAND_PRODUCT_NAME="Acme AI" BRAND_APP_ID="com.acme.ai" yarn electron:build:arm64'
  );
  console.log(
    "(electron-builder will auto-generate .icns/.ico from icon.png)"
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
