describe("kbGraphToModel", () => {
  it("maps octopus-kb graph nodes and edges into WorkspaceGraph model rows", () => {
    const { kbGraphToModel } = require("../../utils/octopusKb/transform");

    const result = kbGraphToModel({
      nodes: [
        {
          id: "page:wiki/concepts/X.md",
          title: "X",
          type: "concept",
          role: "concept",
          layer: "wiki",
          aliases: ["x-ray"],
        },
        {
          id: "page:raw/source.md",
          title: "Source",
          type: "raw_source",
          role: "source",
          layer: "source",
          aliases: [],
        },
        {
          id: "alias:customer",
          title: "customer",
          type: "alias",
        },
      ],
      edges: [
        {
          source: "page:wiki/concepts/X.md",
          target: "page:raw/source.md",
          relation_type: "wikilink",
        },
        {
          source: "alias:customer",
          target: "page:wiki/concepts/X.md",
          relation_type: "alias",
        },
      ],
    });

    expect(result.nodes).toEqual([
      {
        nodeId: "page:wiki/concepts/X.md",
        label: "X",
        type: "concept",
        metadata: {
          role: "concept",
          layer: "wiki",
          aliases: ["x-ray"],
          source: "kb",
        },
      },
      {
        nodeId: "page:raw/source.md",
        label: "Source",
        type: "doc",
        metadata: {
          role: "source",
          layer: "source",
          aliases: [],
          source: "kb",
        },
      },
      {
        nodeId: "alias:customer",
        label: "customer",
        type: "tag",
        metadata: {
          role: null,
          layer: null,
          aliases: [],
          source: "kb",
        },
      },
    ]);
    expect(result.edges).toEqual([
      {
        fromNodeId: "page:wiki/concepts/X.md",
        toNodeId: "page:raw/source.md",
        relation: "reference",
        weight: 1,
        metadata: { source: "kb" },
        group: "kb",
      },
      {
        fromNodeId: "alias:customer",
        toNodeId: "page:wiki/concepts/X.md",
        relation: "tag",
        weight: 1,
        metadata: { source: "kb" },
        group: "kb",
      },
    ]);
  });

  it("passes through kb-visible types and falls back safely", () => {
    const { kbGraphToModel } = require("../../utils/octopusKb/transform");
    const { nodes, edges } = kbGraphToModel({
      nodes: [
        { id: "concept", title: "Concept", type: "concept" },
        { id: "entity", title: "Entity", type: "entity" },
        { id: "comparison", title: "Comparison", type: "comparison" },
        { id: "timeline", title: "Timeline", type: "timeline" },
        { id: "meta", title: "Meta", type: "meta" },
        { id: "unknown", title: "Unknown", type: "other" },
      ],
      edges: [
        { source: "concept", target: "entity", relation_type: "supersedes" },
        { source: "entity", target: "concept", relation_type: "refines" },
        { source: "unknown", target: "concept", relation_type: "other" },
      ],
    });

    expect(nodes.map((node) => node.type)).toEqual([
      "concept",
      "entity",
      "comparison",
      "timeline",
      "custom",
      "custom",
    ]);
    expect(edges.map((edge) => edge.relation)).toEqual([
      "supersedes",
      "refines",
      "custom",
    ]);
  });

  it("keeps raw-only fixtures sparse while curated fixtures expose richer node types", () => {
    const { kbGraphToModel } = require("../../utils/octopusKb/transform");

    const rawOnly = kbGraphToModel({
      nodes: [
        {
          id: "page:raw/source.md",
          title: "Source",
          type: "raw_source",
        },
      ],
      edges: [],
    });
    const curated = kbGraphToModel({
      nodes: [
        {
          id: "page:wiki/concepts/Retrieval.md",
          title: "Retrieval",
          type: "concept",
        },
        {
          id: "page:wiki/entities/Alata.md",
          title: "Alata",
          type: "entity",
        },
        {
          id: "page:wiki/comparisons/Vector-vs-Graph.md",
          title: "Vector vs Graph",
          type: "comparison",
        },
        {
          id: "page:wiki/timelines/Build.md",
          title: "Build timeline",
          type: "timeline",
        },
      ],
      edges: [
        {
          source: "page:wiki/concepts/Retrieval.md",
          target: "page:wiki/entities/Alata.md",
          relation_type: "wikilink",
        },
      ],
    });

    const rawTypes = new Set(rawOnly.nodes.map((node) => node.type));
    const curatedTypes = new Set(curated.nodes.map((node) => node.type));

    expect([...rawTypes]).toEqual(["doc"]);
    expect(curatedTypes.size).toBeGreaterThan(rawTypes.size);
    expect(curated.nodes.map((node) => node.type)).toEqual([
      "concept",
      "entity",
      "comparison",
      "timeline",
    ]);
  });
});
