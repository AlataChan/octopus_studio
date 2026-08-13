jest.mock("../../utils/prisma", () => ({
  run_artifacts: { create: jest.fn() },
}));

const prisma = require("../../utils/prisma");
const { RunArtifact } = require("../../models/runArtifact");

describe("RunArtifact persistence", () => {
  it("redacts metadata values before writing", async () => {
    prisma.run_artifacts.create.mockResolvedValue({ id: "artifact-a" });
    await RunArtifact.create({
      runId: "run-a",
      artifactType: "report",
      storageRef: "report.txt",
      metadata: { note: "Bearer artifact-secret" },
    });
    const metadata = prisma.run_artifacts.create.mock.calls[0][0].data.metadata;
    expect(metadata).toContain("[REDACTED]");
    expect(metadata).not.toContain("artifact-secret");
  });
});
