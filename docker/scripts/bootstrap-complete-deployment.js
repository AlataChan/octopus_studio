#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

process.env.NODE_ENV = process.env.NODE_ENV || "production";

const prisma = require("../../server/utils/prisma");
const {
  reseedWorkAgentAssistants,
} = require("../../server/utils/workAgent/runtimeSeed");
const { run: runAgencyImport } = require("../../scripts/import-agency-agents");

const SYSTEM_SETTINGS = [
  { label: "multi_user_mode", value: "false" },
  { label: "logo_filename", value: "anything-llm.png" },
];

function bundledAgencyRepoDir() {
  return path.resolve(__dirname, "../../scripts/import-agency-agents/.tmp-agency-agents");
}

function bundledAgencyCommitHash(repoDir) {
  try {
    const headRef = fs
      .readFileSync(path.join(repoDir, ".git", "HEAD"), "utf8")
      .trim();

    if (headRef.startsWith("ref: ")) {
      const refPath = headRef.replace(/^ref:\s+/, "");
      return fs
        .readFileSync(path.join(repoDir, ".git", refPath), "utf8")
        .trim()
        .slice(0, 12);
    }

    return headRef.slice(0, 12);
  } catch {
    return "bundled";
  }
}

async function ensureSystemSettings() {
  for (const setting of SYSTEM_SETTINGS) {
    const existing = await prisma.system_settings.findUnique({
      where: { label: setting.label },
    });

    if (existing) continue;

    await prisma.system_settings.create({
      data: setting,
    });
  }
}

async function ensureAssistantTemplates() {
  await reseedWorkAgentAssistants();
}

async function ensureGatewayApiKey() {
  const secret = String(process.env.ALATA_GATEWAY_API_KEY || "").trim();
  if (!secret) {
    console.warn(
      "[docker-bootstrap] ALATA_GATEWAY_API_KEY 未设置，将跳过 gateway API key 初始化。"
    );
    return;
  }

  const existing = await prisma.api_keys.findFirst({
    where: { secret },
  });

  if (existing) {
    if (existing.isActive !== true || existing.name !== "docker-im-gateway") {
      await prisma.api_keys.update({
        where: { id: existing.id },
        data: {
          isActive: true,
          name: "docker-im-gateway",
          rateLimit: null,
        },
      });
    }
    return;
  }

  await prisma.api_keys.create({
    data: {
      secret,
      createdBy: null,
      name: "docker-im-gateway",
      expiresAt: null,
      rateLimit: null,
      permissions: null,
      isActive: true,
    },
  });
}

async function importAgencyAgents() {
  const repoDir = bundledAgencyRepoDir();
  if (!fs.existsSync(repoDir)) {
    throw new Error(
      `Bundled agency-agents source is missing at ${repoDir}. Docker image is incomplete.`
    );
  }

  const report = await runAgencyImport(
    { forceUpdate: false, dryRun: false, division: null, file: null, wave: null },
    {
      repoDir,
      commitHash: bundledAgencyCommitHash(repoDir),
    }
  );

  if (report.errors > 0) {
    throw new Error(
      `agency-agents import finished with ${report.errors} error(s)`
    );
  }
}

async function main() {
  console.log("[docker-bootstrap] Ensuring complete deployment data...");

  await ensureSystemSettings();
  await ensureAssistantTemplates();
  await importAgencyAgents();
  await ensureGatewayApiKey();

  const assistantCount = await prisma.assistant_templates.count();
  const apiKeyCount = await prisma.api_keys.count();

  console.log(
    `[docker-bootstrap] Complete. assistants=${assistantCount} apiKeys=${apiKeyCount}`
  );
}

main()
  .catch((error) => {
    console.error("[docker-bootstrap] Failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
