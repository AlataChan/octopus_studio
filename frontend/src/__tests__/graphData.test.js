import { describe, expect, it } from "vitest";
import { transformGraphData } from "@/components/WorkspaceGraph/graphData";

describe("transformGraphData", () => {
  it("preserves real nodes, derives assistant-doc links, and computes collaborators", () => {
    const result = transformGraphData({
      nodes: [
        {
          id: "assistant-1",
          type: "assistant",
          name: "Legal Agent",
          rank: 4,
          metadata: {
            description: "Reviews contracts",
            chatCount: 3,
            docCount: 1,
          },
        },
        {
          id: "assistant-2",
          type: "assistant",
          label: "OCR Agent",
          metadata: { description: "Reads documents" },
        },
        {
          id: "chat-1",
          type: "chat",
          label: "Contract chat",
          metadata: {
            prompt: "Review this contract",
            assistant: "Legal Agent",
            createdAt: "2026-06-14T10:00:00.000Z",
          },
        },
        {
          id: "doc-1",
          type: "doc",
          name: "contract.pdf",
          metadata: {
            filename: "contract.pdf",
            docType: "pdf",
            createdAt: "2026-06-14T09:00:00.000Z",
            path: "/workspace/contract.pdf",
          },
        },
        {
          id: "tag-1",
          type: "tag",
          label: "contracts",
        },
      ],
      links: [
        {
          source: "assistant-1",
          target: "chat-1",
          relation: "assistant",
          weight: 2,
        },
        {
          source: "assistant-2",
          target: "chat-1",
          type: "assistant",
          weight: 1,
        },
        {
          source: "chat-1",
          target: "doc-1",
          relation: "reference",
          weight: 1,
        },
        {
          source: "doc-1",
          target: "tag-1",
          relation: "tagged",
          weight: 1,
        },
      ],
    });

    expect(result.nodes.map((node) => node.id)).not.toEqual(
      expect.arrayContaining(["agent-luna", "agent-ethan", "agent-vera"])
    );
    expect(result.nodes).toHaveLength(5);

    expect(result.links).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: "assistant-1",
          target: "doc-1",
          relation: "assistant_doc",
        }),
        expect.objectContaining({
          source: "assistant-2",
          target: "doc-1",
          relation: "assistant_doc",
        }),
      ])
    );

    const assistant = result.nodes.find((node) => node.id === "assistant-1");
    expect(assistant).toEqual(
      expect.objectContaining({
        label: "Legal Agent",
        type: "assistant",
        rank: 4,
        description: "Reviews contracts",
        chatCount: 3,
        docCount: 1,
        degree: 2,
      })
    );
    expect(assistant.collaborators).toEqual([
      { agentId: "assistant-2", label: "OCR Agent", count: 1 },
    ]);

    const doc = result.nodes.find((node) => node.id === "doc-1");
    expect(doc).toEqual(
      expect.objectContaining({
        label: "contract.pdf",
        filename: "contract.pdf",
        docType: "pdf",
        path: "/workspace/contract.pdf",
        degree: 4,
      })
    );
  });

  it("does not fabricate assistant nodes when the source graph has none", () => {
    const result = transformGraphData({
      nodes: [
        { id: "chat-1", type: "chat", label: "Only chat" },
        { id: "doc-1", type: "doc", label: "Only doc" },
      ],
      links: [
        {
          source: "chat-1",
          target: "doc-1",
          relation: "reference",
        },
      ],
    });

    expect(result.nodes.some((node) => node.type === "assistant")).toBe(false);
    expect(result.links).toEqual([
      expect.objectContaining({
        source: "chat-1",
        target: "doc-1",
        relation: "reference",
      }),
    ]);
  });

  it("normalizes kb model-layer graph rows with new visible types", () => {
    const result = transformGraphData({
      nodes: [
        {
          nodeId: "page:wiki/concepts/RAG.md",
          type: "concept",
          label: "RAG",
          metadata: { source: "kb", aliases: ["retrieval"] },
        },
        {
          nodeId: "page:wiki/entities/LanceDB.md",
          type: "entity",
          label: "LanceDB",
          metadata: { source: "kb" },
        },
        {
          nodeId: "page:wiki/comparisons/KbVsVector.md",
          type: "comparison",
          label: "KB vs Vector",
          metadata: { source: "kb" },
        },
        {
          nodeId: "page:wiki/timelines/Roadmap.md",
          type: "timeline",
          label: "Roadmap",
          metadata: { source: "kb" },
        },
      ],
      edges: [
        {
          fromNodeId: "page:wiki/concepts/RAG.md",
          toNodeId: "page:wiki/entities/LanceDB.md",
          relation: "reference",
          weight: 1,
        },
        {
          fromNodeId: "page:wiki/comparisons/KbVsVector.md",
          toNodeId: "page:wiki/timelines/Roadmap.md",
          relation: "reference",
          weight: 1,
        },
      ],
    });

    expect(result.nodes.map((node) => node.type)).toEqual([
      "concept",
      "entity",
      "comparison",
      "timeline",
    ]);
    expect(result.links).toEqual([
      expect.objectContaining({
        source: "page:wiki/concepts/RAG.md",
        target: "page:wiki/entities/LanceDB.md",
        relation: "reference",
      }),
      expect.objectContaining({
        source: "page:wiki/comparisons/KbVsVector.md",
        target: "page:wiki/timelines/Roadmap.md",
        relation: "reference",
      }),
    ]);
  });

  it("returns an empty graph for empty input", () => {
    expect(transformGraphData({ nodes: [], links: [] })).toEqual({
      nodes: [],
      links: [],
    });
    expect(transformGraphData(null)).toEqual({ nodes: [], links: [] });
  });
});
