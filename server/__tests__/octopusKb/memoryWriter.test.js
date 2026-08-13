describe("octopus-kb consolidated memory writer", () => {
  const anchored = {
    session_intent: "Build a durable memory layer",
    main_topics: ["octopus-kb", "memory"],
    key_decisions: ["Use kb pages as the memory source of truth"],
    pending_tasks: ["Wire retention"],
    artifacts: ["memoryWriter.js"],
    related_entities: ["Customer alice@example.com", "sk-secret-token"],
    summary_text:
      "The team decided to persist consolidated memory. Contact alice@example.com with sk-secret-token.",
  };

  function enabledOptions(overrides = {}) {
    return {
      env: { OCTOPUS_KB_MEMORY_ENABLED: "true" },
      SystemSettingsModel: { get: jest.fn(async () => null) },
      ...overrides,
    };
  }

  it("writes a scrubbed typed note page at a deterministic idempotent path", async () => {
    const writePage = jest.fn(async () => ({ path: "ok" }));
    const kbClient = {
      healthcheck: jest.fn(async () => true),
      writePage,
    };
    const { writeConsolidatedMemory } = require("../../utils/octopusKb/memoryWriter");

    const result = await writeConsolidatedMemory({
      slug: "workspace-a",
      threadId: "thread:1",
      anchored,
      summaryUpdatedAt: "2026-06-16T01:02:03.004Z",
      kbClient,
      ...enabledOptions(),
    });

    expect(result.path).toBe(
      "wiki/memory/workspace-a/thread-1/2026-06-16T01-02-03.004Z.md"
    );
    expect(kbClient.healthcheck).toHaveBeenCalledWith("workspace-a");
    expect(writePage).toHaveBeenCalledWith(
      "workspace-a",
      expect.objectContaining({
        path: "wiki/memory/workspace-a/thread-1/2026-06-16T01-02-03.004Z.md",
        type: "note",
        role: "note",
        layer: "wiki",
        frontmatter: expect.objectContaining({
          kind: "summary",
          created: "2026-06-16T01:02:03.004Z",
          summary: expect.stringContaining("persist consolidated memory"),
          related_entities: [
            "Customer [REDACTED_EMAIL]",
            "octopus-kb",
            "memory",
          ],
        }),
      })
    );
    const page = writePage.mock.calls[0][1];
    expect(page.body).not.toContain("alice@example.com");
    expect(page.body).not.toContain("sk-secret-token");
    expect(JSON.stringify(page.frontmatter.related_entities)).not.toContain(
      "alice@example.com"
    );
    expect(JSON.stringify(page.frontmatter.related_entities)).not.toContain(
      "sk-secret-token"
    );
    expect(page.frontmatter.related_entities).not.toContain("[REDACTED_SECRET]");

    await writeConsolidatedMemory({
      slug: "workspace-a",
      threadId: "thread:1",
      anchored,
      summaryUpdatedAt: "2026-06-16T01:02:03.004Z",
      kbClient,
      ...enabledOptions(),
    });
    expect(writePage.mock.calls[1][1].path).toBe(writePage.mock.calls[0][1].path);
  });

  it("returns null without throwing when disabled", async () => {
    const kbClient = {
      healthcheck: jest.fn(async () => true),
      writePage: jest.fn(),
    };
    const { writeConsolidatedMemory } = require("../../utils/octopusKb/memoryWriter");

    await expect(
      writeConsolidatedMemory({
        slug: "workspace-a",
        threadId: 1,
        anchored,
        summaryUpdatedAt: "2026-06-16T01:02:03.004Z",
        kbClient,
        env: {},
        SystemSettingsModel: { get: jest.fn(async () => null) },
      })
    ).resolves.toBeNull();
    expect(kbClient.writePage).not.toHaveBeenCalled();
  });

  it("returns null without throwing when healthcheck fails or write rejects", async () => {
    const { writeConsolidatedMemory } = require("../../utils/octopusKb/memoryWriter");

    await expect(
      writeConsolidatedMemory({
        slug: "workspace-a",
        threadId: 1,
        anchored,
        summaryUpdatedAt: "2026-06-16T01:02:03.004Z",
        kbClient: {
          healthcheck: jest.fn(async () => false),
          writePage: jest.fn(),
        },
        ...enabledOptions(),
      })
    ).resolves.toBeNull();

    await expect(
      writeConsolidatedMemory({
        slug: "workspace-a",
        threadId: 1,
        anchored,
        summaryUpdatedAt: "2026-06-16T01:02:03.004Z",
        kbClient: {
          healthcheck: jest.fn(async () => true),
          writePage: jest.fn(async () => {
            throw new Error("disk full");
          }),
        },
        ...enabledOptions(),
      })
    ).resolves.toBeNull();
  });
});
