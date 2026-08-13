const DEFAULT_LIGHT_THEME_LOGO_FILENAME = "octopus-studio-banner-light.png";
const DEFAULT_DARK_THEME_LOGO_FILENAME = "octopus-studio-banner-dark.png";

const LEGACY_DEFAULT_LOGO_FILENAMES = [
  "anything-llm.png",
  "anything-llm-light.png",
  "anything-llm-dark.png",
  "HA -w v02 long.png",
  "HA -b v02 long.png",
  "HA -w v02.png",
  "HA -b v02.png",
  "HA -w v02 cycle.png",
  "HA -b v02 cycle.png",
  "hire-agent-logo-light.png",
  "hire-agent-logo-dark.png",
];

const DEFAULT_LOGO_FILENAMES = [
  DEFAULT_LIGHT_THEME_LOGO_FILENAME,
  DEFAULT_DARK_THEME_LOGO_FILENAME,
  ...LEGACY_DEFAULT_LOGO_FILENAMES,
];

function isDefaultLogoFilename(filename) {
  return !!filename && DEFAULT_LOGO_FILENAMES.includes(filename);
}

module.exports = {
  DEFAULT_LIGHT_THEME_LOGO_FILENAME,
  DEFAULT_DARK_THEME_LOGO_FILENAME,
  DEFAULT_LOGO_FILENAMES,
  LEGACY_DEFAULT_LOGO_FILENAMES,
  isDefaultLogoFilename,
};
