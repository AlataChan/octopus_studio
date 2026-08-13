const {
  normalizeArtifactType,
  listArtifactsForThread,
  createArtifactFromChat,
} = require("../../utils/artifacts");

describe("Artifacts Utils", () => {
  describe("normalizeArtifactType", () => {
    it("should normalize valid types", () => {
      expect(normalizeArtifactType("spec")).toBe("spec");
      expect(normalizeArtifactType("SOP")).toBe("sop");
      expect(normalizeArtifactType("code")).toBe("code");
      expect(normalizeArtifactType("summary")).toBe("summary");
      expect(normalizeArtifactType("note")).toBe("note");
    });

    it("should fallback to note for invalid types", () => {
      expect(normalizeArtifactType("")).toBe("note");
      expect(normalizeArtifactType(null)).toBe("note");
      expect(normalizeArtifactType("canvas")).toBe("note");
      expect(normalizeArtifactType("unknown")).toBe("note");
    });
  });

  describe("listArtifactsForThread", () => {
    it("should return only ArtifactRef entries", async () => {
      const thread = {
        metadata: JSON.stringify({
          artifacts_generated: [
            "file1.js",
            { name: "legacy artifact" },
            { kind: "artifact", id: "artifact_1", title: "A1" },
            { kind: "artifact", id: "", title: "invalid" },
            { kind: "artifact", title: "missing id" },
            { kind: "artifact", id: "artifact_2", title: "A2" },
          ],
        }),
      };

      const result = await listArtifactsForThread(thread);
      expect(result).toEqual([
        { kind: "artifact", id: "artifact_1", title: "A1" },
        { kind: "artifact", id: "artifact_2", title: "A2" },
      ]);
    });
  });

  describe("createArtifactFromChat", () => {
    it("should return existing artifact when chatId already referenced", async () => {
      const existing = {
        kind: "artifact",
        id: "artifact_existing",
        title: "Existing Artifact",
        versions: [{ versionId: "v1", sourceChatId: 123 }],
      };

      const result = await createArtifactFromChat({
        workspace: { id: 1 },
        thread: {
          id: 1,
          metadata: JSON.stringify({ artifacts_generated: [existing] }),
        },
        user: null,
        chat: { id: 123, response: JSON.stringify({ text: "hello" }) },
      });

      expect(result).toEqual(existing);
    });
  });
});
