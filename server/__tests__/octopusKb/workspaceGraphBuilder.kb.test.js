const fs = require("fs");
const os = require("os");
const path = require("path");

const mockKbClient = {
  enabled: jest.fn(),
  exportGraph: jest.fn(),
  ingest: jest.fn(),
  propose: jest.fn(),
  validate: jest.fn(),
  vaultPath: jest.fn(),
};
const mockKbClientCtor = jest.fn(() => mockKbClient);
const mockBuildLlmProfile = jest.fn();
const mockKbGraphToModel = jest.fn();
const mockClearWorkspaceGraph = jest.fn();
const mockBulkUpsert = jest.fn();
const mockReplaceWorkspaceGraph = jest.fn();
const mockReplaceKbProjectionGraph = jest.fn();
const mockApplyAnalytics = jest.fn();
const mockGetStats = jest.fn();
const mockDocumentWhere = jest.fn();
const mockDocumentContent = jest.fn();
const mockAppendAuditEvent = jest.fn();

jest.mock("../../utils/octopusKb/KbClient", () => ({
  KbClient: mockKbClientCtor,
  buildLlmProfile: mockBuildLlmProfile,
}));

jest.mock("../../utils/octopusKb/transform", () => ({
  kbGraphToModel: mockKbGraphToModel,
}));

jest.mock("../../models/workspaceGraph", () => ({
  WorkspaceGraph: {
    clearWorkspaceGraph: mockClearWorkspaceGraph,
    bulkUpsert: mockBulkUpsert,
    replaceWorkspaceGraph: mockReplaceWorkspaceGraph,
    replaceKbProjectionGraph: mockReplaceKbProjectionGraph,
    applyAnalytics: mockApplyAnalytics,
    getStats: mockGetStats,
  },
}));

jest.mock("../../models/documents", () => ({
  Document: {
    where: mockDocumentWhere,
    content: mockDocumentContent,
  },
}));

jest.mock("../../utils/octopusKb/audit", () => ({
  appendAuditEvent: mockAppendAuditEvent,
}));

jest.mock("../../models/systemSettings", () => ({
  SystemSettings: {
    get: jest.fn(async () => null),
  },
}));

const mockPrisma = {
  workspace_graph_builds: {
    update: jest.fn(),
  },
  workspaces: {
    findUnique: jest.fn(),
  },
  workspace_graph_nodes: {
    findMany: jest.fn(),
  },
  workspace_graph_edges: {
    findMany: jest.fn(),
  },
};

jest.mock("../../utils/prisma", () => mockPrisma);

describe("WorkspaceGraphBuilder octopus-kb import path", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockKbClientCtor.mockImplementation(() => mockKbClient);
    mockPrisma.workspace_graph_builds.update.mockResolvedValue({});
    mockPrisma.workspaces.findUnique.mockResolvedValue({
      id: 7,
      slug: "workspace-slug",
    });
    mockGetStats.mockResolvedValue({ nodeCount: 2, edgeCount: 1 });
    mockBuildLlmProfile.mockResolvedValue(null);
    mockKbClient.ingest.mockResolvedValue(null);
    mockKbClient.propose.mockResolvedValue(null);
    mockKbClient.validate.mockResolvedValue(null);
    mockKbClient.vaultPath.mockResolvedValue(
      fs.mkdtempSync(path.join(os.tmpdir(), "octopus-kb-builder-"))
    );
    mockReplaceKbProjectionGraph.mockResolvedValue({
      nodesCreated: 1,
      edgesCreated: 0,
    });
    mockApplyAnalytics.mockResolvedValue({ nodesUpdated: 1 });
    mockPrisma.workspace_graph_nodes.findMany.mockResolvedValue([
      { nodeId: "page:wiki/concepts/X.md" },
    ]);
    mockPrisma.workspace_graph_edges.findMany.mockResolvedValue([]);
    mockDocumentWhere.mockResolvedValue([]);
    mockDocumentContent.mockResolvedValue({ title: "Doc", content: "# Doc" });
    mockAppendAuditEvent.mockResolvedValue(null);
    delete process.env.OCTOPUS_KB_CURATION_ENABLED;
    delete process.env.OCTOPUS_KB_CURATION_MAX_FILES;
    delete process.env.OCTOPUS_KB_CURATION_MAX_BYTES;
  });

  it("imports a non-empty kb graph after validating it and clears stale graph rows first", async () => {
    mockKbClient.enabled.mockResolvedValue(true);
    mockKbClient.exportGraph.mockResolvedValue({
      nodes: [{ id: "page:wiki/concepts/X.md", title: "X" }],
      edges: [],
    });
    mockKbGraphToModel.mockReturnValue({
      nodes: [
        {
          nodeId: "page:wiki/concepts/X.md",
          label: "X",
          type: "concept",
          rank: 1,
          metadata: { source: "kb" },
        },
      ],
      edges: [],
    });
    mockClearWorkspaceGraph.mockResolvedValue({
      nodesDeleted: 3,
      edgesDeleted: 2,
    });
    mockBulkUpsert.mockResolvedValue({ nodesCreated: 1, edgesCreated: 0 });
    mockReplaceWorkspaceGraph.mockResolvedValue({
      nodesCreated: 1,
      edgesCreated: 0,
    });

    const {
      WorkspaceGraphBuilder,
    } = require("../../utils/graphBuilder/workspaceGraphBuilder");

    await WorkspaceGraphBuilder.build({
      workspaceId: 7,
      taskId: "task-kb",
      mode: "full",
      options: { includeDocs: true },
    });

    expect(mockKbClient.exportGraph).toHaveBeenCalledWith("workspace-slug");
    expect(mockKbGraphToModel).toHaveBeenCalledWith({
      nodes: [{ id: "page:wiki/concepts/X.md", title: "X" }],
      edges: [],
    });
    expect(mockReplaceKbProjectionGraph).toHaveBeenCalledWith({
      workspaceId: 7,
      nodes: [
        {
          nodeId: "page:wiki/concepts/X.md",
          label: "X",
          type: "concept",
          rank: 1,
          metadata: { source: "kb" },
        },
      ],
      edges: [],
    });
    expect(mockReplaceWorkspaceGraph).not.toHaveBeenCalled();
    expect(mockClearWorkspaceGraph).not.toHaveBeenCalled();
    expect(mockBulkUpsert).not.toHaveBeenCalled();
    expect(mockDocumentWhere).not.toHaveBeenCalled();
    expect(mockPrisma.workspace_graph_builds.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "task-kb" },
        data: expect.objectContaining({
          status: "completed",
          progress: 100,
          nodeCount: 2,
          edgeCount: 1,
        }),
      })
    );
  });

  it("keeps the previous graph when kb export is empty", async () => {
    mockKbClient.enabled.mockResolvedValue(true);
    mockKbClient.exportGraph.mockResolvedValue({ nodes: [], edges: [] });

    const {
      WorkspaceGraphBuilder,
    } = require("../../utils/graphBuilder/workspaceGraphBuilder");

    await WorkspaceGraphBuilder.build({
      workspaceId: 7,
      taskId: "task-empty",
      mode: "full",
      options: { includeDocs: true },
    });

    expect(mockClearWorkspaceGraph).not.toHaveBeenCalled();
    expect(mockBulkUpsert).not.toHaveBeenCalled();
    expect(mockReplaceWorkspaceGraph).not.toHaveBeenCalled();
    expect(mockReplaceKbProjectionGraph).not.toHaveBeenCalled();
    expect(mockDocumentWhere).not.toHaveBeenCalled();
    expect(mockPrisma.workspace_graph_builds.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "task-empty" },
        data: expect.objectContaining({
          status: "completed",
          progress: 100,
          nodeCount: 2,
          edgeCount: 1,
        }),
      })
    );
  });

  it("keeps the previous graph when kb export fails", async () => {
    mockKbClient.enabled.mockResolvedValue(true);
    mockKbClient.exportGraph.mockResolvedValue(null);

    const {
      WorkspaceGraphBuilder,
    } = require("../../utils/graphBuilder/workspaceGraphBuilder");

    await WorkspaceGraphBuilder.build({
      workspaceId: 7,
      taskId: "task-unhealthy",
      mode: "full",
      options: { includeDocs: true },
    });

    expect(mockClearWorkspaceGraph).not.toHaveBeenCalled();
    expect(mockBulkUpsert).not.toHaveBeenCalled();
    expect(mockReplaceWorkspaceGraph).not.toHaveBeenCalled();
    expect(mockReplaceKbProjectionGraph).not.toHaveBeenCalled();
    expect(mockDocumentWhere).not.toHaveBeenCalled();
    expect(mockPrisma.workspace_graph_builds.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "task-unhealthy" },
        data: expect.objectContaining({
          status: "completed",
          progress: 100,
          nodeCount: 2,
          edgeCount: 1,
        }),
      })
    );
  });

  it("aborts curation before graph replacement when document caps are exceeded", async () => {
    process.env.OCTOPUS_KB_CURATION_ENABLED = "true";
    process.env.OCTOPUS_KB_CURATION_MAX_BYTES = "10";
    mockKbClient.enabled.mockResolvedValue(true);
    mockBuildLlmProfile.mockResolvedValue({
      provider: "generic-openai",
      baseURL: "https://api.example/v1",
      apiKey: "secret",
      model: "model-a",
    });
    mockDocumentWhere.mockResolvedValue([
      { docId: "doc-a", filename: "a.md", docpath: "folder/a.md" },
    ]);
    mockDocumentContent.mockResolvedValue({
      title: "A",
      content: "This content is larger than ten bytes.",
    });

    const {
      WorkspaceGraphBuilder,
    } = require("../../utils/graphBuilder/workspaceGraphBuilder");

    await WorkspaceGraphBuilder.build({
      workspaceId: 7,
      taskId: "task-cap",
      mode: "full",
      options: { includeDocs: true },
    });

    expect(mockKbClient.ingest).not.toHaveBeenCalled();
    expect(mockKbClient.exportGraph).not.toHaveBeenCalled();
    expect(mockReplaceWorkspaceGraph).not.toHaveBeenCalled();
    expect(mockReplaceKbProjectionGraph).not.toHaveBeenCalled();
    expect(mockAppendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "workspace-slug",
        stage: "curation",
        status: "cap_exceeded",
      })
    );
    expect(mockPrisma.workspace_graph_builds.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        where: { id: "task-cap" },
        data: expect.objectContaining({
          status: "completed",
          progress: 100,
          nodeCount: 2,
          edgeCount: 1,
        }),
      })
    );
  });

  it("ingests documents, applies safe proposals, then imports the curated kb graph", async () => {
    process.env.OCTOPUS_KB_CURATION_ENABLED = "true";
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), "octopus-kb-vault-"));
    fs.mkdirSync(path.join(vault, "proposals"), { recursive: true });
    fs.writeFileSync(
      path.join(vault, "proposals", "a.json"),
      JSON.stringify({
        operations: [
          {
            op: "create_page",
            path: "wiki/concepts/A.md",
          },
        ],
      }),
      "utf8"
    );
    mockKbClient.enabled.mockResolvedValue(true);
    mockKbClient.vaultPath.mockResolvedValue(vault);
    mockBuildLlmProfile.mockResolvedValue({
      provider: "generic-openai",
      baseURL: "https://api.example/v1",
      apiKey: "secret",
      model: "model-a",
    });
    mockDocumentWhere.mockResolvedValue([
      { docId: "doc-a", filename: "a.md", docpath: "folder/a.md" },
    ]);
    mockDocumentContent.mockResolvedValue({
      title: "A",
      content: "# A\n\nCurated source.",
    });
    mockKbClient.ingest.mockResolvedValue({ path: "raw/a.md" });
    mockKbClient.propose.mockResolvedValue({
      path: "proposals/a.json",
      operations: 1,
    });
    mockKbClient.validate.mockResolvedValue({
      status: "applied",
      verdict: "accepted",
      audit_path: ".octopus-kb/audit/a.json",
    });
    mockKbClient.exportGraph.mockResolvedValue({
      nodes: [{ id: "page:wiki/concepts/A.md", title: "A" }],
      edges: [],
    });
    mockKbGraphToModel.mockReturnValue({
      nodes: [
        {
          nodeId: "page:wiki/concepts/A.md",
          label: "A",
          type: "concept",
          rank: 1,
          metadata: { source: "kb" },
        },
      ],
      edges: [],
    });

    const {
      WorkspaceGraphBuilder,
    } = require("../../utils/graphBuilder/workspaceGraphBuilder");

    await WorkspaceGraphBuilder.build({
      workspaceId: 7,
      taskId: "task-curated",
      mode: "full",
      options: { includeDocs: true },
    });

    expect(mockKbClient.ingest).toHaveBeenCalledWith("workspace-slug", {
      markdown: "# A\n\nCurated source.",
      title: "A",
      tags: ["workspace:7"],
    });
    expect(mockKbClient.propose).toHaveBeenCalledWith(
      "workspace-slug",
      "raw/a.md",
      expect.objectContaining({ apiKey: "secret" })
    );
    expect(mockKbClient.validate).toHaveBeenCalledWith(
      "workspace-slug",
      "proposals/a.json",
      expect.objectContaining({
        apply: true,
        profile: expect.objectContaining({ model: "model-a" }),
      })
    );
    expect(mockReplaceKbProjectionGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 7,
        nodes: expect.arrayContaining([
          expect.objectContaining({ type: "concept" }),
        ]),
      })
    );
    expect(mockAppendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "workspace-slug",
        stage: "apply",
        status: "applied",
      })
    );
  });

  it("skips apply when a proposal targets files outside the vault wiki directory", async () => {
    process.env.OCTOPUS_KB_CURATION_ENABLED = "true";
    const vault = fs.mkdtempSync(path.join(os.tmpdir(), "octopus-kb-vault-"));
    fs.mkdirSync(path.join(vault, "proposals"), { recursive: true });
    fs.writeFileSync(
      path.join(vault, "proposals", "unsafe.json"),
      JSON.stringify({
        operations: [
          {
            op: "create_page",
            path: "../outside.md",
          },
        ],
      }),
      "utf8"
    );
    mockKbClient.enabled.mockResolvedValue(true);
    mockKbClient.vaultPath.mockResolvedValue(vault);
    mockBuildLlmProfile.mockResolvedValue({
      provider: "generic-openai",
      baseURL: "https://api.example/v1",
      apiKey: "secret",
      model: "model-a",
    });
    mockDocumentWhere.mockResolvedValue([
      { docId: "doc-a", filename: "a.md", docpath: "folder/a.md" },
    ]);
    mockDocumentContent.mockResolvedValue({
      title: "A",
      content: "# A\n\nUnsafe target source.",
    });
    mockKbClient.ingest.mockResolvedValue({ path: "raw/a.md" });
    mockKbClient.propose.mockResolvedValue({
      path: "proposals/unsafe.json",
      operations: 1,
    });
    mockKbClient.exportGraph.mockResolvedValue({
      nodes: [{ id: "page:raw/a.md", title: "A" }],
      edges: [],
    });
    mockKbGraphToModel.mockReturnValue({
      nodes: [
        {
          nodeId: "page:raw/a.md",
          label: "A",
          type: "doc",
          rank: 1,
          metadata: { source: "kb" },
        },
      ],
      edges: [],
    });

    const {
      WorkspaceGraphBuilder,
    } = require("../../utils/graphBuilder/workspaceGraphBuilder");

    await WorkspaceGraphBuilder.build({
      workspaceId: 7,
      taskId: "task-unsafe",
      mode: "full",
      options: { includeDocs: true },
    });

    expect(mockKbClient.validate).not.toHaveBeenCalled();
    expect(mockAppendAuditEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "workspace-slug",
        stage: "validate",
        status: "unsafe_target",
        path: "proposals/unsafe.json",
      })
    );
    expect(mockReplaceKbProjectionGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        workspaceId: 7,
        nodes: expect.arrayContaining([
          expect.objectContaining({ type: "doc" }),
        ]),
      })
    );
  });
});
