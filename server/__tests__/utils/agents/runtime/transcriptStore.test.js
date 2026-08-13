const fs = require("fs");
const path = require("path");

const TranscriptStore = require("../../../../utils/agents/runtime/transcriptStore");

describe("TranscriptStore", () => {
  const storageDir = path.join(
    process.env.STORAGE_DIR || process.cwd(),
    "tmp-transcript-tests"
  );

  afterEach(() => {
    fs.rmSync(storageDir, { recursive: true, force: true });
  });

  test("append and flush persist transcript messages as jsonl", async () => {
    const store = new TranscriptStore("session:one", { storageDir });

    await store.append({ role: "user", content: "hello" });
    await store.append({ role: "assistant", content: "world" });
    await store.flush();

    const transcriptPath = path.join(
      storageDir,
      ".alataflow",
      "transcripts",
      "session-one.jsonl"
    );
    const fileContent = fs.readFileSync(transcriptPath, "utf8").trim().split("\n");

    expect(fileContent).toHaveLength(2);
    expect(JSON.parse(fileContent[0])).toMatchObject({
      role: "user",
      content: "hello",
    });
    expect(JSON.parse(fileContent[1])).toMatchObject({
      role: "assistant",
      content: "world",
    });
  });

  test("load returns persisted transcript history and [] for missing sessions", async () => {
    const store = new TranscriptStore("session-two", { storageDir });

    await store.append({ role: "user", content: "hello" });
    await store.flush();

    await expect(store.load("session-two")).resolves.toEqual([
      expect.objectContaining({
        role: "user",
        content: "hello",
      }),
    ]);
    await expect(store.load("missing-session")).resolves.toEqual([]);
  });
});
