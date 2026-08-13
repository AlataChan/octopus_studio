jest.mock("../../../utils/prisma", () => ({
  workspaces: { findUnique: jest.fn() },
  workspace_documents: { findFirst: jest.fn() },
}));

const prisma = require("../../../utils/prisma");
const {
  StudioWorkflowBindingError,
  resolveBindings,
} = require("../../../utils/fde/studioWorkflowBindings");

describe("resolveBindings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.workspaces.findUnique.mockResolvedValue({
      id: 7,
      slug: "clinic-a",
      chatProvider: "openai",
      chatModel: "gpt-4o-mini",
    });
    prisma.workspace_documents.findFirst.mockResolvedValue({
      docId: "doc-7",
      docpath: "workspace_kb",
    });
  });

  it("resolves only the named model fields and workspace namespace", async () => {
    const result = await resolveBindings({
      workspaceId: 7,
      requiredBindings: [
        { kind: "model", handle: "default-chat-model", required: true },
        { kind: "dataset", handle: "workspace_kb", required: true },
      ],
    });

    expect(result).toEqual({
      resolved: {
        model: {
          "default-chat-model": {
            provider: "openai",
            model: "gpt-4o-mini",
          },
        },
        dataset: {
          workspace_kb: { docId: "doc-7", vectorNamespace: "clinic-a" },
        },
      },
      missing: [],
    });
    expect(prisma.workspace_documents.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: 7, docpath: "workspace_kb" },
      select: { docId: true, docpath: true },
    });
    expect(JSON.stringify(result)).not.toMatch(/api.?key|secret|credential/i);
  });

  it("treats a nullable model as missing", async () => {
    prisma.workspaces.findUnique.mockResolvedValue({
      id: 7,
      slug: "clinic-a",
      chatProvider: "openai",
      chatModel: null,
    });

    const result = await resolveBindings({
      workspaceId: 7,
      requiredBindings: [
        { kind: "model", handle: "default-chat-model", required: true },
      ],
    });

    expect(result.resolved.model).toEqual({});
    expect(result.missing).toEqual([
      { kind: "model", handle: "default-chat-model" },
    ]);
  });

  it("never guesses another model handle", async () => {
    const result = await resolveBindings({
      workspaceId: 7,
      requiredBindings: [
        { kind: "model", handle: "configured-small-model", required: true },
      ],
    });

    expect(result.resolved.model).toEqual({});
    expect(result.missing).toEqual([
      { kind: "model", handle: "configured-small-model" },
    ]);
  });

  it("does not resolve a document from a different workspace", async () => {
    prisma.workspace_documents.findFirst.mockResolvedValue(null);

    const result = await resolveBindings({
      workspaceId: 7,
      requiredBindings: [
        { kind: "dataset", handle: "workspace_kb", required: true },
      ],
    });

    expect(result.resolved.dataset).toEqual({});
    expect(result.missing).toEqual([
      { kind: "dataset", handle: "workspace_kb" },
    ]);
    expect(prisma.workspace_documents.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { workspaceId: 7, docpath: "workspace_kb" },
      })
    );
  });

  it("fails closed for document-scoped dataset handles", async () => {
    const result = await resolveBindings({
      workspaceId: 7,
      requiredBindings: [
        { kind: "dataset", handle: "patient-handbook.pdf", required: true },
      ],
    });

    expect(result.missing).toEqual([
      { kind: "dataset", handle: "patient-handbook.pdf" },
    ]);
    expect(prisma.workspace_documents.findFirst).not.toHaveBeenCalled();
  });

  it("rejects an unknown binding kind without echoing the binding", async () => {
    await expect(
      resolveBindings({
        workspaceId: 7,
        requiredBindings: [
          { kind: "credential", handle: "do-not-echo", required: true },
        ],
      })
    ).rejects.toBeInstanceOf(StudioWorkflowBindingError);
    await expect(
      resolveBindings({
        workspaceId: 7,
        requiredBindings: [
          { kind: "credential", handle: "do-not-echo", required: true },
        ],
      })
    ).rejects.not.toThrow(/do-not-echo/);
  });

  it("can resolve through a caller-provided transaction client", async () => {
    const tx = {
      workspaces: {
        findUnique: jest.fn().mockResolvedValue({
          id: 7,
          slug: "clinic-a",
          chatProvider: "openai",
          chatModel: "gpt-4o-mini",
        }),
      },
      workspace_documents: { findFirst: jest.fn() },
    };

    await resolveBindings({
      workspaceId: 7,
      requiredBindings: [
        { kind: "model", handle: "default-chat-model", required: true },
      ],
      prismaClient: tx,
    });

    expect(tx.workspaces.findUnique).toHaveBeenCalled();
    expect(prisma.workspaces.findUnique).not.toHaveBeenCalled();
  });
});
