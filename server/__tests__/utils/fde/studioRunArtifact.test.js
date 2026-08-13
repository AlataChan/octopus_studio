const fs = require("fs");
const os = require("os");
const path = require("path");

describe("Studio output artifact", () => {
  let directory;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "fde-output-"));
    process.env.STORAGE_DIR = directory;
  });

  afterEach(() => {
    delete process.env.STORAGE_DIR;
    fs.rmSync(directory, { recursive: true, force: true });
    jest.resetModules();
  });

  it("writes a redacted JSON artifact and emits artifact evidence", async () => {
    const create = jest.fn(async (data) => ({ id: "artifact-a", ...data }));
    const append = jest.fn(async (event) => event);
    const {
      persistStudioOutputArtifact,
    } = require("../../../utils/fde/studioRunArtifact");

    const artifact = await persistStudioOutputArtifact({
      runId: "run-a",
      outputs: { followup_message: "Bearer artifact-secret" },
      artifactModel: {
        ARTIFACT_TYPE: { DOWNLOAD_FILE: "download_file" },
        create,
      },
      eventModel: { append },
    });

    const body = fs.readFileSync(
      path.join(directory, artifact.storageRef),
      "utf8"
    );
    expect(body).toContain("[REDACTED]");
    expect(body).not.toContain("artifact-secret");
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: "run-a",
        artifactType: "download_file",
        mimeType: "application/json",
      })
    );
    expect(append).toHaveBeenCalledWith({
      runId: "run-a",
      type: "artifact.created",
      payload: { artifactId: "artifact-a", artifactType: "download_file" },
    });
  });
});
