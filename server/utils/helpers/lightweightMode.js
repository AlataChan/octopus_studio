function isLightweightMode() {
  const raw = process.env.LIGHTWEIGHT_MODE;
  if (raw === undefined) return true;
  const normalized = String(raw).trim().toLowerCase();
  return !["false", "0", "no", "off"].includes(normalized);
}

module.exports = { isLightweightMode };
