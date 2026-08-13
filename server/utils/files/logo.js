const path = require("path");
const fs = require("fs");
const { getType } = require("mime");
const { v4 } = require("uuid");
const { SystemSettings } = require("../../models/systemSettings");
const { normalizePath, isWithin } = require(".");
const {
  DEFAULT_DARK_THEME_LOGO_FILENAME,
  DEFAULT_LIGHT_THEME_LOGO_FILENAME,
  isDefaultLogoFilename,
} = require("./defaultLogos");

/**
 * Octopus Studio default logo filenames.
 * 说明：
 * - octopus-studio-banner-light.png has dark text for light UI backgrounds.
 * - octopus-studio-banner-dark.png has light text for dark UI backgrounds.
 * - 文件位于前端 Vite 的 public 目录中（frontend/public）
 * - 构建后会被复制到 frontend/dist 根目录
 * - 在服务端通过 server/public -> ../frontend/dist 的链接进行访问
 */
const LOGO_FILENAME = DEFAULT_LIGHT_THEME_LOGO_FILENAME;
const LOGO_FILENAME_DARK = DEFAULT_DARK_THEME_LOGO_FILENAME;

/**
 * Checks if the filename is the default logo filename for dark or light mode.
 * @param {string} filename - The filename to check.
 * @returns {boolean} Whether the filename is the default logo filename.
 */
function isDefaultFilename(filename) {
  return isDefaultLogoFilename(filename);
}

function validFilename(newFilename = "") {
  return !isDefaultFilename(newFilename);
}

/**
 * 按当前主题返回默认 logo 文件名。
 * 约定：
 * - darkMode = true  时，使用深色 UI 版本（浅色文字），即 LOGO_FILENAME_DARK
 * - darkMode = false 时，使用浅色 UI 版本（深色文字），即 LOGO_FILENAME
 *
 * @param {boolean} darkMode - 是否为深色主题。
 * @returns {string} 对应主题下应使用的 logo 文件名。
 */
function getDefaultFilename(darkMode = true) {
  return darkMode ? LOGO_FILENAME_DARK : LOGO_FILENAME;
}

async function determineLogoFilepath(defaultFilename = LOGO_FILENAME) {
  const currentLogoFilename = await SystemSettings.currentLogoFilename();

  // 自定义 logo 始终存放在 storage/assets 目录下
  const assetsBasePath = process.env.STORAGE_DIR
    ? path.join(process.env.STORAGE_DIR, "assets")
    : path.join(__dirname, "../../storage/assets");
  // 默认 logo 资源在构建后会位于 server/public（链接到 frontend/dist）
  const publicBasePath = path.join(__dirname, "../../public");

  const defaultAssetsPath = path.join(assetsBasePath, defaultFilename);
  const defaultPublicPath = path.join(publicBasePath, defaultFilename);

  // 如果已经配置了自定义 logo，优先读取 storage/assets 下的文件
  if (currentLogoFilename && validFilename(currentLogoFilename)) {
    const customLogoPath = path.join(
      assetsBasePath,
      normalizePath(currentLogoFilename)
    );
    if (!isWithin(path.resolve(assetsBasePath), path.resolve(customLogoPath))) {
      // 安全保护：路径不在预期目录下时，退回默认 logo 逻辑
      if (fs.existsSync(defaultAssetsPath)) return defaultAssetsPath;
      if (fs.existsSync(defaultPublicPath)) return defaultPublicPath;
      return defaultAssetsPath;
    }

    if (fs.existsSync(customLogoPath)) return customLogoPath;
    if (fs.existsSync(defaultAssetsPath)) return defaultAssetsPath;
    if (fs.existsSync(defaultPublicPath)) return defaultPublicPath;
    return defaultAssetsPath;
  }

  // 没有自定义 logo，则按顺序尝试：storage/assets -> server/public
  if (fs.existsSync(defaultAssetsPath)) return defaultAssetsPath;
  if (fs.existsSync(defaultPublicPath)) return defaultPublicPath;
  return defaultAssetsPath;
}

function fetchLogo(logoPath) {
  if (!fs.existsSync(logoPath)) {
    return {
      found: false,
      buffer: null,
      size: 0,
      mime: "none/none",
    };
  }

  const mime = getType(logoPath);
  const buffer = fs.readFileSync(logoPath);
  return {
    found: true,
    buffer,
    size: buffer.length,
    mime,
  };
}

async function renameLogoFile(originalFilename = null) {
  const extname = path.extname(originalFilename) || ".png";
  const newFilename = `${v4()}${extname}`;
  const assetsDirectory = process.env.STORAGE_DIR
    ? path.join(process.env.STORAGE_DIR, "assets")
    : path.join(__dirname, `../../storage/assets`);
  const originalFilepath = path.join(
    assetsDirectory,
    normalizePath(originalFilename)
  );
  if (!isWithin(path.resolve(assetsDirectory), path.resolve(originalFilepath)))
    throw new Error("Invalid file path.");

  // The output always uses a random filename.
  const outputFilepath = process.env.STORAGE_DIR
    ? path.join(process.env.STORAGE_DIR, "assets", normalizePath(newFilename))
    : path.join(__dirname, `../../storage/assets`, normalizePath(newFilename));

  fs.renameSync(originalFilepath, outputFilepath);
  return newFilename;
}

async function removeCustomLogo(logoFilename = LOGO_FILENAME) {
  if (!logoFilename || !validFilename(logoFilename)) return false;
  const assetsDirectory = process.env.STORAGE_DIR
    ? path.join(process.env.STORAGE_DIR, "assets")
    : path.join(__dirname, `../../storage/assets`);

  const logoPath = path.join(assetsDirectory, normalizePath(logoFilename));
  if (!isWithin(path.resolve(assetsDirectory), path.resolve(logoPath)))
    throw new Error("Invalid file path.");
  if (fs.existsSync(logoPath)) fs.unlinkSync(logoPath);
  return true;
}

module.exports = {
  fetchLogo,
  renameLogoFile,
  removeCustomLogo,
  validFilename,
  getDefaultFilename,
  determineLogoFilepath,
  isDefaultFilename,
  LOGO_FILENAME,
  LOGO_FILENAME_DARK,
};
