#!/usr/bin/env node

const { main } = require("../src");

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = Number.isInteger(code) ? code : 0;
  })
  .catch((error) => {
    console.error(error?.message || String(error));
    process.exitCode = 1;
  });
