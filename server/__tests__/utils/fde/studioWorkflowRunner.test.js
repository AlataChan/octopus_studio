const {
  StudioExecutionError,
  inputDigest,
  runStudioWorkflow,
} = require("../../../utils/fde/studioWorkflowRunner");
const { validSpec } = require("./studioSpecFixture");

function spec() {
  const value = validSpec();
  value.workflow.nodes.find((node) => node.type === "retrieval").dataset =
    "workspace_kb";
  value.workflow.nodes.find((node) => node.type === "llm").prompt =
    "Policy: ${policy.text}\nNote: ${input.visit_note}\nDraft it.";
  value.workflow.required_bindings.find(
    (binding) => binding.kind === "dataset"
  ).handle = "workspace_kb";
  return value;
}

function draft(overrides = {}) {
  return {
    id: "draft-a",
    workspaceId: 7,
    status: "published",
    engine: "mastra",
    sourceIrHash: "b".repeat(64),
    specJson: JSON.stringify(spec()),
    resolvedBindingsJson: JSON.stringify({
      dataset: {
        workspace_kb: { docId: "doc-a", vectorNamespace: "clinic-a" },
      },
      model: {
        "default-chat-model": { provider: "deterministic", model: "test" },
      },
    }),
    missingBindingsJson: "[]",
    reviewStatus: "approved",
    reviewSubjectDigest: "subject-a",
    reviewedSubjectDigest: "subject-a",
    ...overrides,
  };
}

function structuredSpec({
  outputType = "json",
  outputReference = "${draft.data}",
} = {}) {
  const value = spec();
  value.schema_version = "1.1";
  const llm = value.workflow.nodes.find((node) => node.type === "llm");
  llm.output_schema = {
    type: "object",
    additionalProperties: false,
    required: ["answer"],
    properties: { answer: { type: "string" } },
  };
  value.workflow.outputs = [
    { name: "structured", type: outputType, required: false },
  ];
  value.workflow.nodes.find((node) => node.type === "output").bindings = {
    structured: outputReference,
  };
  return value;
}

function memoryCheckpoints(seed = null) {
  let row = seed ? JSON.parse(JSON.stringify(seed)) : null;
  return {
    get: jest.fn(async () => row),
    create: jest.fn(async (value) => {
      row = {
        ...value,
        nodeOutputs: {},
        status: "idle",
        attemptToken: "initial",
        stateVersion: 0,
      };
      return row;
    }),
    claim: jest.fn(async ({ leaseOwner }) => {
      row = {
        ...row,
        status: "leased",
        leaseOwner,
        attemptToken: `attempt-${row.stateVersion + 1}`,
        stateVersion: row.stateVersion + 1,
      };
      return row;
    }),
    renew: jest.fn(async () => row),
    storeAttemptResult: jest.fn(async ({ nodeOutputs }) => {
      row = { ...row, nodeOutputs, stateVersion: row.stateVersion + 1 };
      return row;
    }),
    advance: jest.fn(async ({ nodeCursor, nodeOutputs, status = "leased" }) => {
      row = {
        ...row,
        nodeCursor,
        nodeOutputs,
        status,
        stateVersion: row.stateVersion + 1,
      };
      return row;
    }),
    fail: jest.fn(async () => {
      row = { ...row, status: "failed", stateVersion: row.stateVersion + 1 };
      return row;
    }),
    snapshot: () => row,
  };
}

function args(overrides = {}) {
  return {
    runId: "run-a",
    engine: "mastra",
    draft: draft(),
    workspace: { id: 7, slug: "clinic-a" },
    inputs: {
      patient_alias: "P-001",
      visit_note: "Follow up in two weeks.",
    },
    checkpointStore: memoryCheckpoints(),
    resolveDataset: jest.fn(async () => [
      { text: "Clinic policy marker", score: 0.91, docId: "doc-a" },
    ]),
    invokeModel: jest.fn(async ({ prompt }) => ({
      text: `DRAFT:${prompt.includes("Clinic policy marker")}`,
      usage: { totalTokens: 12 },
    })),
    emitEvent: jest.fn(async () => {}),
    leaseOwner: "worker-a",
    ...overrides,
  };
}

describe("Studio workflow runner", () => {
  it.each([
    ["unpublished", { status: "ready" }, "STUDIO_RUN_PUBLISHED_REQUIRED"],
    [
      "unapproved",
      { reviewStatus: "requested", reviewedSubjectDigest: null },
      "STUDIO_RUN_REVIEW_REQUIRED",
    ],
    [
      "unbound",
      { missingBindingsJson: '[{"kind":"model"}]' },
      "STUDIO_RUN_BINDING_MISSING",
    ],
  ])(
    "blocks %s drafts before retrieval or model calls",
    async (_name, change, code) => {
      const resolveDataset = jest.fn();
      const invokeModel = jest.fn();
      await expect(
        runStudioWorkflow(
          args({ draft: draft(change), resolveDataset, invokeModel })
        )
      ).rejects.toMatchObject({ code });
      expect(resolveDataset).not.toHaveBeenCalled();
      expect(invokeModel).not.toHaveBeenCalled();
    }
  );

  it("executes the four-node graph topologically with the defined output shapes", async () => {
    const options = args();
    const result = await runStudioWorkflow(options);

    expect(result.status).toBe("succeeded");
    expect(result.outputs).toEqual({ followup_message: "DRAFT:true" });
    expect(options.resolveDataset).toHaveBeenCalledWith({
      workspace: { id: 7, slug: "clinic-a" },
      binding: { docId: "doc-a", vectorNamespace: "clinic-a" },
      query: "Follow up in two weeks.",
      topK: 5,
    });
    expect(options.invokeModel.mock.calls[0][0].prompt).toContain(
      "Clinic policy marker"
    );
    expect(options.checkpointStore.snapshot().nodeOutputs.nodes.policy).toEqual(
      {
        chunks: [{ text: "Clinic policy marker", score: 0.91, docId: "doc-a" }],
        text: "Clinic policy marker",
      }
    );
    expect(options.checkpointStore.snapshot().status).toBe("completed");
  });

  it("parses and validates structured model output and binds data only to a json port", async () => {
    const value = structuredSpec();
    const generatedText = '{"answer":"Use the published return policy."}';
    const options = args({
      draft: draft({ specJson: JSON.stringify(value) }),
      invokeModel: jest.fn(async () => ({ text: generatedText })),
    });

    const result = await runStudioWorkflow(options);

    expect(result.outputs).toEqual({
      structured: { answer: "Use the published return policy." },
    });
    expect(options.invokeModel).toHaveBeenCalledWith(
      expect.objectContaining({
        outputSchema: value.workflow.nodes[2].output_schema,
      })
    );
    expect(options.checkpointStore.snapshot().nodeOutputs.nodes.draft).toEqual({
      text: generatedText,
      data: { answer: "Use the published return policy." },
    });
  });

  it.each([
    ["malformed JSON", "not-json"],
    ["schema mismatch", '{"answer":7}'],
  ])(
    "fails closed without retry for %s structured output",
    async (_label, text) => {
      const value = structuredSpec();
      const invokeModel = jest.fn(async () => ({ text }));
      const options = args({
        draft: draft({ specJson: JSON.stringify(value) }),
        invokeModel,
      });

      await expect(runStudioWorkflow(options)).rejects.toMatchObject({
        code: "STUDIO_EXEC_OUTPUT_SCHEMA_INVALID",
      });
      expect(invokeModel).toHaveBeenCalledTimes(1);
      expect(options.checkpointStore.storeAttemptResult).not.toHaveBeenCalled();
    }
  );

  it.each([
    ["object in a prompt", "${draft.data}", "STUDIO_EXEC_REFERENCE_NOT_STRING"],
    [
      "unknown structured field",
      "${draft.answer}",
      "STUDIO_EXEC_UNRESOLVED_REFERENCE",
    ],
  ])("fails closed for %s", async (_label, prompt, code) => {
    const value = structuredSpec();
    const output = value.workflow.nodes.find((node) => node.type === "output");
    value.workflow.nodes.push({
      id: "second",
      type: "llm",
      model: "default-chat-model",
      prompt,
    });
    value.workflow.edges = value.workflow.edges.filter(
      (edge) => !(edge.from === "draft" && edge.to === "out")
    );
    value.workflow.edges.push(
      { from: "draft", to: "second" },
      { from: "second", to: output.id }
    );

    await expect(
      runStudioWorkflow(
        args({ draft: draft({ specJson: JSON.stringify(value) }) })
      )
    ).rejects.toMatchObject({ code });
  });

  it("rejects a structured object binding to a non-json output port", async () => {
    const value = structuredSpec({ outputType: "string" });
    await expect(
      runStudioWorkflow(
        args({ draft: draft({ specJson: JSON.stringify(value) }) })
      )
    ).rejects.toMatchObject({ code: "STUDIO_EXEC_REFERENCE_NOT_STRING" });
  });

  it("rejects interpolating structured data into a larger json binding", async () => {
    const value = structuredSpec({
      outputReference: "prefix:${draft.data}",
    });
    await expect(
      runStudioWorkflow(
        args({ draft: draft({ specJson: JSON.stringify(value) }) })
      )
    ).rejects.toMatchObject({ code: "STUDIO_EXEC_REFERENCE_NOT_STRING" });
  });

  it("does not echo rejected structured output in its stable error", async () => {
    const value = structuredSpec();
    const rejected = '{"answer":7,"marker":"do-not-echo-391"}';
    try {
      await runStudioWorkflow(
        args({
          draft: draft({ specJson: JSON.stringify(value) }),
          invokeModel: jest.fn(async () => ({ text: rejected })),
        })
      );
      throw new Error("expected structured validation to fail");
    } catch (error) {
      expect(error).toMatchObject({
        code: "STUDIO_EXEC_OUTPUT_SCHEMA_INVALID",
      });
      expect(error.message).not.toContain("do-not-echo-391");
      expect(JSON.stringify(error)).not.toContain("do-not-echo-391");
    }
  });

  it("emits a start and completion boundary for every node", async () => {
    const options = args();
    await runStudioWorkflow(options);
    expect(options.emitEvent.mock.calls.map(([event]) => event.type)).toEqual([
      "status.started",
      "step.started",
      "step.completed",
      "step.started",
      "tool.result",
      "step.completed",
      "step.started",
      "cost.updated",
      "step.completed",
      "step.started",
      "step.completed",
      "status.succeeded",
    ]);
  });

  it("caps redacted output previews at 200 characters", async () => {
    const options = args({
      invokeModel: jest.fn(async () => ({
        text: `Bearer token ${"x".repeat(500)}`,
      })),
    });
    await runStudioWorkflow(options);
    const ends = options.emitEvent.mock.calls
      .map(([event]) => event)
      .filter((event) => event.type === "step.completed");
    expect(
      ends.every((event) => event.payload.outputPreview.length <= 200)
    ).toBe(true);
    expect(JSON.stringify(ends)).not.toContain("Bearer token x");
  });

  it.each([
    ["bare node", "${policy}", "STUDIO_EXEC_REFERENCE_INVALID"],
    ["array field", "${policy.chunks}", "STUDIO_EXEC_REFERENCE_NOT_STRING"],
    ["unknown input", "${input.unknown}", "STUDIO_EXEC_UNRESOLVED_REFERENCE"],
  ])("fails closed for a %s reference", async (_name, prompt, code) => {
    const value = spec();
    value.workflow.nodes.find((node) => node.type === "llm").prompt = prompt;
    await expect(
      runStudioWorkflow(
        args({ draft: draft({ specJson: JSON.stringify(value) }) })
      )
    ).rejects.toMatchObject({ code });
  });

  it("rejects unsupported nodes and cycles before partial execution", async () => {
    const unsupported = spec();
    unsupported.workflow.nodes.push({ id: "unsafe", type: "http" });
    const first = args({
      draft: draft({ specJson: JSON.stringify(unsupported) }),
    });
    await expect(runStudioWorkflow(first)).rejects.toMatchObject({
      code: "STUDIO_EXEC_UNSUPPORTED_NODE",
    });
    expect(first.resolveDataset).not.toHaveBeenCalled();

    const cyclic = spec();
    cyclic.workflow.edges.push({ from: "out", to: "policy" });
    await expect(
      runStudioWorkflow(
        args({ draft: draft({ specJson: JSON.stringify(cyclic) }) })
      )
    ).rejects.toMatchObject({ code: "STUDIO_EXEC_CYCLE" });
  });

  it("refuses a cross-tenant vector namespace before retrieval", async () => {
    const bindings = JSON.parse(draft().resolvedBindingsJson);
    bindings.dataset.workspace_kb.vectorNamespace = "foreign-workspace";
    const options = args({
      draft: draft({ resolvedBindingsJson: JSON.stringify(bindings) }),
    });
    await expect(runStudioWorkflow(options)).rejects.toMatchObject({
      code: "STUDIO_EXEC_DATASET_TENANT_MISMATCH",
    });
    expect(options.resolveDataset).not.toHaveBeenCalled();
  });

  it("does not retry or switch engines after a model failure", async () => {
    const invokeModel = jest.fn(async () => {
      throw new Error("provider failure");
    });
    const options = args({ invokeModel });
    await expect(runStudioWorkflow(options)).rejects.toThrow(
      "provider failure"
    );
    expect(invokeModel).toHaveBeenCalledTimes(1);
    expect(options.checkpointStore.fail).toHaveBeenCalled();
  });

  it("honors a persisted cancellation before dispatching the next node", async () => {
    const options = args({ isCancelled: jest.fn(async () => true) });
    await expect(runStudioWorkflow(options)).rejects.toMatchObject({
      code: "STUDIO_RUN_CANCELLED",
    });
    expect(options.resolveDataset).not.toHaveBeenCalled();
    expect(options.invokeModel).not.toHaveBeenCalled();
  });

  it("resumes in a fresh runner from persisted outputs and reuses a stored llm result", async () => {
    const inputs = {
      patient_alias: "P-001",
      visit_note: "Follow up in two weeks.",
    };
    const checkpointStore = memoryCheckpoints({
      runId: "run-a",
      nodeCursor: "draft",
      inputDigest: inputDigest(inputs),
      nodeOutputs: {
        nodes: {
          start: { inputs },
          policy: {
            chunks: [{ text: "persisted policy", score: 1, docId: "doc-a" }],
            text: "persisted policy",
          },
        },
        attemptResults: {
          draft: {
            attemptToken: "old-process",
            result: { text: "persisted draft" },
          },
        },
      },
      status: "idle",
      attemptToken: "old-process",
      stateVersion: 4,
    });
    const invokeModel = jest.fn();

    const result = await runStudioWorkflow(
      args({
        inputs,
        checkpointStore,
        invokeModel,
        leaseOwner: "fresh-process",
      })
    );

    expect(result.outputs.followup_message).toBe("persisted draft");
    expect(invokeModel).not.toHaveBeenCalled();
    expect(checkpointStore.snapshot().status).toBe("completed");
  });

  it("rejects input changes and engine changes on resume", async () => {
    const checkpointStore = memoryCheckpoints({
      runId: "run-a",
      nodeCursor: "start",
      inputDigest: inputDigest({ patient_alias: "old", visit_note: "old" }),
      nodeOutputs: {},
      status: "idle",
      attemptToken: "old",
      stateVersion: 1,
    });
    await expect(
      runStudioWorkflow(args({ checkpointStore }))
    ).rejects.toMatchObject({
      code: "STUDIO_EXEC_INPUT_CHANGED",
    });
    await expect(
      runStudioWorkflow(args({ engine: "octopus" }))
    ).rejects.toMatchObject({
      code: "STUDIO_EXEC_ENGINE_MISMATCH",
    });
  });

  it("exports the stable execution error type", () => {
    expect(new StudioExecutionError("CODE", "message")).toMatchObject({
      code: "CODE",
    });
  });
});
