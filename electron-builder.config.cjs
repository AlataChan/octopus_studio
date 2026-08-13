/**
 * electron-builder.config.cjs
 *
 * Dynamic configuration for electron-builder that uses staged sidecars
 * instead of copying directly from workspace directories.
 *
 * The staging directory should be populated by:
 *   node scripts/electron/stage-sidecars.mjs --arch=<arch>
 *
 * Environment variables:
 *   SIDECAR_DIR - Path to staged sidecars (default: .electron-build/sidecars)
 */

const path = require("path");
const fs = require("fs");
const {
  verifyPackagedSidecars,
} = require("./scripts/electron/verify-sidecar-boot.cjs");

// Use staged sidecars directory (populated by stage-sidecars.mjs)
const SIDECAR_DIR = process.env.SIDECAR_DIR || ".electron-build/sidecars";
const BUILD_RESOURCES_DIR = path.join(__dirname, "electron/build-resources");

// White-label icon resolution.
// A customer-provided square PNG (>=512px) lets electron-builder auto-generate
// the .icns/.ico. Drop one in via `yarn brand:icon <icon.png>`. Falls back to the
// bundled defaults so existing builds are unaffected.
function firstExistingResource(...names) {
  for (const name of names) {
    const candidate = path.join(BUILD_RESOURCES_DIR, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  return path.join(BUILD_RESOURCES_DIR, names[names.length - 1]);
}
const MAC_ICON = firstExistingResource("icon.png", "icon.icns");
const DMG_ICON = firstExistingResource("dmg.png", "icon.png", "dmg.icns");
const SIDECAR_RESOURCE_SIGN_IGNORE = [
  // Sidecars live under Contents/Resources and are executed via the signed
  // Electron binary. Treat them as sealed resources of the main bundle instead
  // of recursively timestamp-signing tens of thousands of files.
  ...["frontend", "server", "collector", "alata-im-gateway"].map(
    (name) => String.raw`^.*\/Contents\/Resources\/${name}\/.*$`
  ),
  // Electron helper/framework resource payloads are sealed by their parent
  // bundle signatures. Signing locale packs and other data assets one-by-one
  // adds no value and makes timestamping unreliable.
  String.raw`^.*\/Contents\/Frameworks\/.*\/Resources\/.*$`,
];

module.exports = {
  appId: process.env.BRAND_APP_ID || "com.alata.studio",
  productName: process.env.BRAND_PRODUCT_NAME || "Octopus Studio",
  copyright: "Copyright © 2025 Octopus Studio",

  directories: {
    output: "dist-electron",
    buildResources: BUILD_RESOURCES_DIR,
  },

  // Files to include in app.asar
  files: [
    "electron/**/*",
    "frontend/dist/**/*",
    "package.json",
    "!**/.git/**/*",
    "!**/tests/**/*",
    "!**/__tests__/**/*",
    "!**/storage/**/*",
    "!**/*.md",
    "!**/*.map",
    "!**/LICENSE*",
    "!**/CHANGELOG*",
  ],

  // Extra resources (sidecars) - from staging directory
  extraResources: [
    {
      from: path.join(SIDECAR_DIR, "server"),
      to: "server",
      filter: ["**/*"],
    },
    {
      from: path.join(SIDECAR_DIR, "collector"),
      to: "collector",
      filter: ["**/*"],
    },
    {
      from: path.join(SIDECAR_DIR, "alata-im-gateway"),
      to: "alata-im-gateway",
      filter: ["**/*"],
    },
    {
      from: path.join(SIDECAR_DIR, "frontend/dist"),
      to: "frontend/dist",
      filter: ["**/*"],
    },
  ],

  // macOS configuration (single-arch: arm64 only)
  mac: {
    icon: MAC_ICON,
    target: [
      {
        target: "dmg",
        arch: ["arm64"],
      },
    ],
    category: "public.app-category.productivity",
    entitlements: "electron/entitlements.mac.plist",
    entitlementsInherit: "electron/entitlements.mac.plist",
    hardenedRuntime: true,
    gatekeeperAssess: false,
    sign: "scripts/electron/mac-sign-with-retry.cjs",
    signIgnore: SIDECAR_RESOURCE_SIGN_IGNORE,
    extendInfo: {
      NSMicrophoneUsageDescription:
        "This app requires microphone access for audio transcription features.",
      NSCameraUsageDescription:
        "This app may require camera access for certain features.",
    },
  },

  // DMG installer configuration
  dmg: {
    icon: DMG_ICON,
    title: "${productName} ${version}",
    contents: [
      {
        x: 130,
        y: 220,
      },
      {
        x: 410,
        y: 220,
        type: "link",
        path: "/Applications",
      },
    ],
  },

  // Disable publishing (we handle releases separately)
  publish: null,

  // Build hooks for additional validation
  afterPack: async (context) => {
    const appOutDir = context.appOutDir;
    console.log(`\n[afterPack] App built at: ${appOutDir}`);
    console.log(`[afterPack] Architecture: ${context.arch}`);

    // Quick sanity check
    const fs = require("fs");
    const resourcesDir = path.join(
      appOutDir,
      `${context.packager.appInfo.productFilename}.app`,
      "Contents/Resources"
    );

    const serverIndex = path.join(resourcesDir, "server/index.js");
    const collectorIndex = path.join(resourcesDir, "collector/index.js");
    const gatewayEntry = path.join(
      resourcesDir,
      "alata-im-gateway/bin/alata-gateway.js"
    );

    const missingEntries = [
      [serverIndex, "server/index.js"],
      [collectorIndex, "collector/index.js"],
      [gatewayEntry, "alata-im-gateway/bin/alata-gateway.js"],
    ].filter(([entry]) => !fs.existsSync(entry));
    if (missingEntries.length > 0) {
      throw new Error(
        `[afterPack] Missing packaged sidecar entries:\n${missingEntries
          .map(([, label]) => `- ${label}`)
          .join("\n")}`
      );
    }

    console.log("[afterPack] Basic structure check complete.");
    await verifyPackagedSidecars({
      appOutDir,
      productFilename: context.packager.appInfo.productFilename,
      serverManagerPath: path.join(__dirname, "electron/main/serverManager.cjs"),
    });
    console.log("[afterPack] Sidecar boot guard complete.\n");
  },
};
