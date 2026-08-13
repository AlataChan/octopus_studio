#!/usr/bin/env node

const jest = require("jest");

function mapArgs(argv) {
  const out = [];
  for (const arg of argv) {
    if (arg === "--testPathPattern") {
      out.push("--testPathPatterns");
      continue;
    }
    if (arg.startsWith("--testPathPattern=")) {
      out.push(arg.replace("--testPathPattern=", "--testPathPatterns="));
      continue;
    }
    out.push(arg);
  }
  return out;
}

jest.run(mapArgs(process.argv.slice(2)));

