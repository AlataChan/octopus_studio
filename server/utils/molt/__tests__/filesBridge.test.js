const {
  buildTextUploadPayload,
  uploadTextFileToMolt,
} = require("../filesBridge");

describe("Molt files bridge", () => {
  test("buildTextUploadPayload encodes text as base64", () => {
    expect(
      buildTextUploadPayload({ filename: "notes.md", content: "hello" })
    ).toEqual({
      filename: "notes.md",
      dataBase64: Buffer.from("hello", "utf8").toString("base64"),
    });
  });

  test("uploadTextFileToMolt sends text payload through Molt client", async () => {
    const client = {
      uploadAgentFile: jest.fn(async () => ({
        data: { upload_id: "upload-1", filename: "notes.md" },
      })),
    };

    await expect(
      uploadTextFileToMolt({
        client,
        agentId: "main",
        filename: "notes.md",
        content: "hello",
      })
    ).resolves.toEqual({
      success: true,
      upload: { upload_id: "upload-1", filename: "notes.md" },
      raw: { data: { upload_id: "upload-1", filename: "notes.md" } },
    });
    expect(client.uploadAgentFile).toHaveBeenCalledWith("main", {
      filename: "notes.md",
      dataBase64: Buffer.from("hello", "utf8").toString("base64"),
    });
  });
});
