import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const distDir = resolve("dist");
const sourcePath = resolve(distDir, "alata-chat-widget.js");
const legacyPath = resolve(distDir, "anythingllm-chat-widget.js");

const newGlobal = "EmbeddedAlata";
const legacyGlobal = "EmbeddedAnythingLLM";

const source = await readFile(sourcePath, "utf8");

if (!source.includes(newGlobal)) {
  throw new Error(`Expected ${sourcePath} to contain ${newGlobal}.`);
}

if (source.includes(legacyGlobal)) {
  throw new Error(`Expected ${sourcePath} to contain only the new UMD global.`);
}

const legacy = source.replaceAll(newGlobal, legacyGlobal);

if (!legacy.includes(legacyGlobal) || legacy.includes(newGlobal)) {
  throw new Error("Failed to generate legacy widget with the legacy UMD global.");
}

await writeFile(legacyPath, legacy);
