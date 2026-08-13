function hasDependency(depName) {
  try {
    require.resolve(depName);
    return true;
  } catch {
    return false;
  }
}

function hasPuppeteer() {
  return hasDependency("puppeteer-core") || hasDependency("puppeteer");
}

function hasTesseract() {
  return hasDependency("tesseract.js");
}

function hasFFmpegStatic() {
  return hasDependency("ffmpeg-static");
}

function hasXenovaTransformers() {
  return hasDependency("@xenova/transformers");
}

function isLightweightMode() {
  const raw = process.env.LIGHTWEIGHT_MODE;
  if (raw === undefined) return true;
  const normalized = String(raw).trim().toLowerCase();
  return !["false", "0", "no", "off"].includes(normalized);
}

module.exports = {
  hasDependency,
  hasPuppeteer,
  hasTesseract,
  hasFFmpegStatic,
  hasXenovaTransformers,
  isLightweightMode,
};
