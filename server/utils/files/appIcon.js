const path = require("path");
const fs = require("fs");
const { getType } = require("mime");
const { normalizePath, isWithin } = require(".");

/**
 * App Icon (white-label) support.
 *
 * A customer uploads a single square master PNG in Settings → Branding. On upload
 * we derive a small set of PNGs (favicon, apple-touch, 192, 512) plus a 1024 master
 * with `sharp`, store them in `storage/assets/`, and record the base id in the
 * `app_icon` SystemSetting. The base id doubles as a cache-buster (`?v=<baseId>`).
 *
 * Default (no custom icon) => `app_icon` is null and the app falls back to the
 * static `/favicon.png` (or the legacy `meta_page_favicon` URL).
 */

// sizeKey -> pixel dimension. These keys are also the served URL path names
// (e.g. GET /system/app-icon/favicon.png -> key "favicon").
const ICON_SIZES = {
  favicon: 32,
  "apple-touch": 180,
  "icon-192": 192,
  "icon-512": 512,
};
const MASTER_KEY = "master";
const MASTER_SIZE = 1024;
const FILENAME_PREFIX = "app-icon-";

function assetsDir() {
  return process.env.STORAGE_DIR
    ? path.join(process.env.STORAGE_DIR, "assets")
    : path.join(__dirname, "../../storage/assets");
}

function iconFilename(baseId = "", sizeKey = "favicon") {
  return `${FILENAME_PREFIX}${baseId}-${sizeKey}.png`;
}

/**
 * Resolves the on-disk path for a derivative, guarding against path traversal.
 * @param {string} baseId
 * @param {string} sizeKey
 * @returns {string} absolute filepath
 */
function appIconFilepath(baseId = "", sizeKey = "favicon") {
  const dir = assetsDir();
  const filepath = path.join(dir, normalizePath(iconFilename(baseId, sizeKey)));
  if (!isWithin(path.resolve(dir), path.resolve(filepath)))
    throw new Error("Invalid app icon path.");
  return filepath;
}

function isValidSizeKey(sizeKey = "") {
  return sizeKey === MASTER_KEY || ICON_SIZES.hasOwnProperty(sizeKey);
}

/**
 * Generate the full derivative set from a source image into storage/assets.
 * @param {string} sourcePath - absolute path to the uploaded source image
 * @param {string} baseId - unique id (uuid) used in filenames + cache-busting
 * @returns {Promise<string>} the baseId
 */
async function generateAppIconSet(sourcePath, baseId) {
  if (!fs.existsSync(sourcePath))
    throw new Error("Source image for app icon not found.");
  const sharp = require("sharp");
  const dir = assetsDir();
  fs.mkdirSync(dir, { recursive: true });

  const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
  const targets = [...Object.entries(ICON_SIZES), [MASTER_KEY, MASTER_SIZE]];

  for (const [sizeKey, dimension] of targets) {
    const outPath = appIconFilepath(baseId, sizeKey);
    await sharp(sourcePath)
      .resize(dimension, dimension, {
        fit: "contain",
        background: transparent,
      })
      .png()
      .toFile(outPath);
  }
  return baseId;
}

/**
 * Reads a derivative file for serving.
 * @returns {{found:boolean, buffer:Buffer|null, size:number, mime:string}}
 */
function fetchAppIcon(baseId = "", sizeKey = "favicon") {
  try {
    if (!baseId || !isValidSizeKey(sizeKey))
      return { found: false, buffer: null, size: 0, mime: "none/none" };
    const filepath = appIconFilepath(baseId, sizeKey);
    if (!fs.existsSync(filepath))
      return { found: false, buffer: null, size: 0, mime: "none/none" };
    const buffer = fs.readFileSync(filepath);
    return {
      found: true,
      buffer,
      size: buffer.length,
      mime: getType(filepath) || "image/png",
    };
  } catch (error) {
    console.error("fetchAppIcon error:", error.message);
    return { found: false, buffer: null, size: 0, mime: "none/none" };
  }
}

/**
 * Removes every derivative for a given baseId. Safe to call with null/unknown id.
 * @returns {boolean}
 */
function removeAppIconSet(baseId = null) {
  if (!baseId) return false;
  const allKeys = [...Object.keys(ICON_SIZES), MASTER_KEY];
  for (const sizeKey of allKeys) {
    try {
      const filepath = appIconFilepath(baseId, sizeKey);
      if (fs.existsSync(filepath)) fs.unlinkSync(filepath);
    } catch (error) {
      console.error("removeAppIconSet error:", error.message);
    }
  }
  return true;
}

/**
 * Current app icon baseId from settings, or null when using the default.
 * @returns {Promise<string|null>}
 */
async function currentAppIcon() {
  try {
    const { SystemSettings } = require("../../models/systemSettings");
    const setting = await SystemSettings.get({ label: "app_icon" });
    const value = setting?.value || null;
    return value && value !== "null" ? value : null;
  } catch (error) {
    console.error("currentAppIcon error:", error.message);
    return null;
  }
}

module.exports = {
  ICON_SIZES,
  MASTER_KEY,
  MASTER_SIZE,
  isValidSizeKey,
  assetsDir,
  iconFilename,
  appIconFilepath,
  generateAppIconSet,
  fetchAppIcon,
  removeAppIconSet,
  currentAppIcon,
};
