#!/usr/bin/env node

const { createRequire } = require("node:module");
const { resolve } = require("node:path");

const collectorPackageJsonPath = process.argv[2];
if (!collectorPackageJsonPath) {
  throw new Error("Collector package.json path is required");
}

const requireFromCollector = createRequire(resolve(collectorPackageJsonPath));
const anydoc = requireFromCollector("@firecrawl/anydoc");
if (typeof anydoc.toMarkdown !== "function") {
  throw new Error("@firecrawl/anydoc toMarkdown is not available");
}
