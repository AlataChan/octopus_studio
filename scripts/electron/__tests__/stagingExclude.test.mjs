import assert from "node:assert/strict";
import test from "node:test";

import {
  EXCLUDE_NAME_PATTERNS,
  EXCLUDE_ROOT_DIRS,
  shouldExclude,
} from "../stagingExclude.mjs";

test("excludes root-only sidecar directories", () => {
  assert.equal(EXCLUDE_ROOT_DIRS.has("scripts"), true);
  assert.equal(shouldExclude("scripts"), true);
  assert.equal(shouldExclude("foo/scripts"), false);
});

test("keeps required runtime directories", () => {
  assert.equal(shouldExclude("swagger"), false);
  assert.equal(shouldExclude("utils/storage"), false);
});

test("preserves existing file and directory name exclusions", () => {
  assert.equal(EXCLUDE_NAME_PATTERNS.includes("node_modules"), true);
  assert.equal(shouldExclude("node_modules"), true);
  assert.equal(shouldExclude("foo.test.js"), true);
  assert.equal(shouldExclude(".env"), true);
  assert.equal(shouldExclude(".env.production"), true);
});
