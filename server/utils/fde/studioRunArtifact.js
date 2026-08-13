const fs = require("fs/promises");
const path = require("path");
const { RunArtifact } = require("../../models/runArtifact");
const { RunEvent } = require("../../models/runEvent");
const { sanitizeArtifactData } = require("./artifactRedaction");
const { artifactEvidence } = require("./runEvidence");

function storageRoot() {
  if (process.env.STORAGE_DIR) return path.resolve(process.env.STORAGE_DIR);
  return path.resolve(__dirname, "../../../storage");
}

async function persistStudioOutputArtifact({
  runId,
  outputs,
  artifactModel = RunArtifact,
  eventModel = RunEvent,
}) {
  const relativePath = path.join(
    "run-artifacts",
    String(runId),
    "studio-output.json"
  );
  const absolutePath = path.join(storageRoot(), relativePath);
  const body = sanitizeArtifactData({ outputs });
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, body, "utf8");
  const artifact = await artifactModel.create({
    runId: String(runId),
    artifactType: artifactModel.ARTIFACT_TYPE.DOWNLOAD_FILE,
    label: "studio-output.json",
    storageRef: relativePath,
    mimeType: "application/json",
    sizeBytes: Buffer.byteLength(body),
    metadata: { contract: "studio-v1" },
  });
  const event = artifactEvidence({
    artifactId: artifact.id,
    artifactType: artifact.artifactType,
  });
  await eventModel.append({ runId: String(runId), ...event });
  return artifact;
}

module.exports = { persistStudioOutputArtifact };
