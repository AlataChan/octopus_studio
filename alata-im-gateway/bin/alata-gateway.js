#!/usr/bin/env node

// Electron bundles Node 18 (no global File); bundled undici@7 needs it at load time. No-op on Node >=20 / Docker.
if (typeof globalThis.File === "undefined") {
  globalThis.File = require("node:buffer").File;
}

const { main } = require("../src/cli");

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = Number.isInteger(code) ? code : 0;
  })
  .catch((error) => {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
