#!/usr/bin/env node

const path = require("path");

process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  `file:${path.resolve(__dirname, "../storage/anythingllm.db")}`;

const prisma = require("../utils/prisma");
const { WorkspaceAssistant } = require("../models/workspaceAssistant");
const {
  installAssistantTemplatesToWorkspace,
} = require("./lib/installWorkspaceAssistants");

async function main() {
  const workspaceSlug = process.argv[2];

  if (!workspaceSlug) {
    throw new Error(
      "Usage: node server/scripts/installAssistantLibraryToWorkspace.js <workspace-slug>"
    );
  }

  const result = await installAssistantTemplatesToWorkspace({
    prisma,
    WorkspaceAssistant,
    workspaceSlug,
  });

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error("[installAssistantLibraryToWorkspace] Failed:", error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
