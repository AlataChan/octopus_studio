#!/usr/bin/env node

const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const allowlistPath = path.join(repoRoot, ".production-todo-allowlist.txt");
const scanRoots = ["server/", "frontend/src/", "embed/src/"];
const includeGlobs = ["*.js", "*.jsx", "*.ts", "*.tsx"];
const excludedPathParts = [
  "__tests__",
  "/tests/",
  ".test.js",
  ".test.jsx",
  ".test.ts",
  ".test.tsx",
  ".spec.js",
  ".spec.jsx",
  ".spec.ts",
  ".spec.tsx",
  "/dist/",
  "/node_modules/",
  "server/data/presetTemplates.gstack.js",
];

function normalizePath(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/^\.\//, "");
}

function normalizeTodoContent(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ");
}

function hashTodoContent(value) {
  return crypto
    .createHash("sha256")
    .update(normalizeTodoContent(value))
    .digest("hex");
}

function todoKey(filePath, hash) {
  return `${filePath}::${hash}`;
}

function isExcluded(filePath) {
  const normalized = normalizePath(filePath);
  return excludedPathParts.some((part) => normalized.includes(part));
}

function parseGrepLine(line) {
  const match = line.match(/^([^:]+):(\d+):(.*)$/);
  if (!match) return null;

  const filePath = normalizePath(match[1]);
  if (isExcluded(filePath)) return null;

  const content = match[3].trim();
  const normalized = normalizeTodoContent(content);
  const hash = hashTodoContent(content);

  return {
    filePath,
    line: Number(match[2]),
    content,
    normalized,
    hash,
    key: todoKey(filePath, hash),
  };
}

function discoverTodos() {
  const grepArgs = [
    "-rn",
    ...includeGlobs.map((glob) => `--include=${glob}`),
    "--exclude=presetTemplates.gstack.js",
    "TODO",
    ...scanRoots,
  ];
  const result = spawnSync("grep", grepArgs, {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 8 * 1024 * 1024,
  });

  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(
      result.stderr || `grep exited with status ${result.status}`
    );
  }

  return result.stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map(parseGrepLine)
    .filter(Boolean);
}

function parseAllowlistLine(rawLine, lineNumber) {
  const line = rawLine.trim();
  if (!line || line.startsWith("#")) return null;

  const match = line.match(/^(.+?)\s+::\s+([a-f0-9]{64})\s+::\s+(.+)$/i);
  if (!match) {
    return {
      invalid: true,
      lineNumber,
      rawLine,
    };
  }

  const filePath = normalizePath(match[1].trim());
  const hash = match[2].toLowerCase();

  return {
    filePath,
    hash,
    reasonOwner: match[3].trim(),
    key: todoKey(filePath, hash),
    lineNumber,
    rawLine,
  };
}

function readAllowlist() {
  if (!fs.existsSync(allowlistPath)) {
    return { entries: [], invalidEntries: [] };
  }

  const lines = fs.readFileSync(allowlistPath, "utf8").split(/\r?\n/);
  const parsed = lines
    .map((line, index) => parseAllowlistLine(line, index + 1))
    .filter(Boolean);

  return {
    entries: parsed.filter((entry) => !entry.invalid),
    invalidEntries: parsed.filter((entry) => entry.invalid),
  };
}

function groupTodosByKey(todos) {
  const grouped = new Map();

  for (const todo of todos) {
    const existing = grouped.get(todo.key) || [];
    existing.push(todo);
    grouped.set(todo.key, existing);
  }

  return grouped;
}

function formatTodoComment(todo) {
  return `# last seen: ${todo.filePath}:${todo.line} | ${todo.content}`;
}

function formatAllowlistLine(todo, reasonOwner = "<reason> | <owner>") {
  return `${todo.filePath} :: ${todo.hash} :: ${reasonOwner}`;
}

function printSuggestedAllowlistEntry(todo) {
  console.error("Suggested allowlist entry:");
  console.error(formatTodoComment(todo));
  console.error(formatAllowlistLine(todo));
}

function main() {
  const listOnly = process.argv.includes("--list");
  const strict = process.argv.includes("--strict");
  const todos = discoverTodos();
  const discoveredByKey = groupTodosByKey(todos);

  if (listOnly) {
    for (const todosForKey of discoveredByKey.values()) {
      const todo = todosForKey[0];
      console.log(formatTodoComment(todo));
      console.log(formatAllowlistLine(todo));
    }
    return;
  }

  const { entries, invalidEntries } = readAllowlist();
  const allowlistKeys = new Set(entries.map((entry) => entry.key));
  const unauthorizedKeys = [...discoveredByKey.keys()].filter(
    (key) => !allowlistKeys.has(key)
  );
  const staleEntries = entries.filter(
    (entry) => !discoveredByKey.has(entry.key)
  );
  let hasFailure = false;

  if (invalidEntries.length > 0) {
    hasFailure = true;
    for (const entry of invalidEntries) {
      console.error(
        `INVALID ALLOWLIST ENTRY: ${allowlistPath}:${entry.lineNumber} ${entry.rawLine}`
      );
    }
  }

  if (unauthorizedKeys.length > 0) {
    hasFailure = true;
    for (const key of unauthorizedKeys) {
      const todosForKey = discoveredByKey.get(key);
      const todo = todosForKey[0];
      console.error(
        `UNAUTHORIZED TODO: ${todo.filePath}:${todo.line} ${todo.content}`
      );
      if (todosForKey.length > 1) {
        console.error(
          `Duplicate occurrences covered by the same entry: ${todosForKey
            .map((item) => `${item.filePath}:${item.line}`)
            .join(", ")}`
        );
      }
      printSuggestedAllowlistEntry(todo);
    }
  }

  if (staleEntries.length > 0) {
    if (strict) hasFailure = true;
    for (const entry of staleEntries) {
      console.error(
        `STALE ALLOWLIST ENTRY: ${entry.filePath} :: ${entry.hash} (${allowlistPath}:${entry.lineNumber})`
      );
    }
  }

  if (hasFailure) process.exit(1);

  const staleSuffix =
    staleEntries.length > 0 ? `, ${staleEntries.length} stale warning(s)` : "";
  console.log(
    `All TODOs accounted for (${todos.length} tracked, ${entries.length} allowlist entries${staleSuffix})`
  );
}

main();
