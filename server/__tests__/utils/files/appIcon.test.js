const fs = require("fs");
const path = require("path");
const sharp = require("sharp");
const {
  ICON_SIZES,
  MASTER_KEY,
  MASTER_SIZE,
  isValidSizeKey,
  iconFilename,
  appIconFilepath,
  generateAppIconSet,
  fetchAppIcon,
  removeAppIconSet,
} = require("../../../utils/files/appIcon");

// STORAGE_DIR is set to "__tests__/.storage" by __tests__/setup.js,
// so assets land in __tests__/.storage/assets.
const BASE_ID = "test-appicon-0001";
const SOURCE = path.join(__dirname, "__appicon_source__.png");

async function makeSquareSource(size = 800) {
  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: { r: 10, g: 120, b: 200, alpha: 1 },
    },
  })
    .png()
    .toFile(SOURCE);
}

afterAll(() => {
  removeAppIconSet(BASE_ID);
  if (fs.existsSync(SOURCE)) fs.unlinkSync(SOURCE);
});

describe("appIcon util", () => {
  test("isValidSizeKey accepts known keys and master, rejects junk", () => {
    expect(isValidSizeKey("favicon")).toBe(true);
    expect(isValidSizeKey("icon-512")).toBe(true);
    expect(isValidSizeKey(MASTER_KEY)).toBe(true);
    expect(isValidSizeKey("../etc/passwd")).toBe(false);
    expect(isValidSizeKey("")).toBe(false);
  });

  test("iconFilename follows the app-icon-<id>-<size>.png pattern", () => {
    expect(iconFilename(BASE_ID, "favicon")).toBe(
      `app-icon-${BASE_ID}-favicon.png`
    );
  });

  test("generateAppIconSet writes every derivative + master at the right dimensions", async () => {
    await makeSquareSource(800);
    const returned = await generateAppIconSet(SOURCE, BASE_ID);
    expect(returned).toBe(BASE_ID);

    for (const [sizeKey, dimension] of Object.entries(ICON_SIZES)) {
      const filepath = appIconFilepath(BASE_ID, sizeKey);
      expect(fs.existsSync(filepath)).toBe(true);
      const meta = await sharp(filepath).metadata();
      expect(meta.width).toBe(dimension);
      expect(meta.height).toBe(dimension);
      expect(meta.format).toBe("png");
    }

    const masterPath = appIconFilepath(BASE_ID, MASTER_KEY);
    expect(fs.existsSync(masterPath)).toBe(true);
    const masterMeta = await sharp(masterPath).metadata();
    expect(masterMeta.width).toBe(MASTER_SIZE);
  });

  test("fetchAppIcon returns a buffer for a generated derivative", () => {
    const { found, buffer, size, mime } = fetchAppIcon(BASE_ID, "favicon");
    expect(found).toBe(true);
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(size).toBeGreaterThan(0);
    expect(mime).toBe("image/png");
  });

  test("fetchAppIcon returns not-found for an invalid size key", () => {
    const { found } = fetchAppIcon(BASE_ID, "bogus");
    expect(found).toBe(false);
  });

  test("removeAppIconSet deletes all derivatives", () => {
    removeAppIconSet(BASE_ID);
    for (const sizeKey of [...Object.keys(ICON_SIZES), MASTER_KEY]) {
      expect(fs.existsSync(appIconFilepath(BASE_ID, sizeKey))).toBe(false);
    }
  });
});
