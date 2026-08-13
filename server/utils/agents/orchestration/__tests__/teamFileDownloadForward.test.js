"use strict";

const { handleTeamOrchestration } = require("../handleTeamChat");

describe("handleTeamOrchestration fileDownload forwarding", () => {
  it("forwards fileDownload events with content unchanged", async () => {
    const writeChunk = jest.fn();
    const artifact = {
      filename: "plan.md",
      b64Content: "data:text/markdown;base64,AAA",
    };
    const service = {
      run: jest.fn().mockImplementation(async ({ onEvent }) => {
        onEvent({ type: "fileDownload", content: artifact });
        return { text: "done", sources: [], steps: [], runId: "run-1" };
      }),
    };

    await handleTeamOrchestration({
      response: { on: jest.fn() },
      workspace: { id: "workspace-1" },
      message: "@team make a plan",
      user: { id: "user-1" },
      thread: null,
      assistantId: null,
      uuid: "uuid-file",
      service,
      listEmployees: jest.fn().mockResolvedValue([{ assistantId: "a1" }]),
      generateText: jest.fn(),
      persistChat: jest.fn().mockResolvedValue(undefined),
      writeChunk,
    });

    const fileDownloadCall = writeChunk.mock.calls.find(
      ([, chunk]) => chunk.type === "fileDownload"
    );
    expect(fileDownloadCall).toBeDefined();
    expect(fileDownloadCall[1].content).toBe(artifact);
    expect(fileDownloadCall[1].content.filename).toBe("plan.md");
    expect(fileDownloadCall[1].content.b64Content).toBe(
      "data:text/markdown;base64,AAA"
    );
  });
});
