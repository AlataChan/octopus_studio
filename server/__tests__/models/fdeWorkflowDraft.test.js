jest.mock("../../utils/prisma", () => {
  const mock = {
    fde_workflow_drafts: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      findMany: jest.fn(),
    },
  };
  mock.$transaction = jest.fn(async (callback) => callback(mock));
  return mock;
});

const prisma = require("../../utils/prisma");
const {
  FdeWorkflowDraft,
  canonicalizeJcs,
  computeReviewSubjectDigest,
  computeSpecDigest,
} = require("../../models/fdeWorkflowDraft");

const baseSpec = () => ({
  target: "studio",
  schema_version: "1.0",
  workflow: { nodes: [], edges: [], name: "Clinic follow-up" },
});

function input(overrides = {}) {
  return {
    workspaceId: 7,
    lineageKey: "clinic-followup",
    name: "Clinic follow-up",
    spec: baseSpec(),
    compilerVersion: "studio-compiler/1",
    targetVersion: "1",
    schemaVersion: "1.0",
    engine: "mastra",
    sourceIrVersion: "0.3",
    sourceIrHash: "a".repeat(64),
    resolvedBindings: {
      "default-chat-model": { provider: "openai", model: "gpt-4o-mini" },
    },
    missingBindings: [],
    studioReviewPolicyVersion: "1",
    createdByUserId: 12,
    ...overrides,
  };
}

function storedRow(overrides = {}) {
  const args = input();
  const specDigest = computeSpecDigest(args.spec);
  const reviewSubjectDigest = computeReviewSubjectDigest({
    specDigest,
    compilerVersion: args.compilerVersion,
    targetVersion: args.targetVersion,
    schemaVersion: args.schemaVersion,
    engine: args.engine,
    resolvedBindings: args.resolvedBindings,
    studioReviewPolicyVersion: args.studioReviewPolicyVersion,
  });
  return {
    id: "draft-1",
    workspaceId: 7,
    lineageKey: "clinic-followup",
    revision: 1,
    stateVersion: 2,
    status: "ready",
    name: args.name,
    contract: "studio-v1",
    targetVersion: args.targetVersion,
    schemaVersion: args.schemaVersion,
    compilerVersion: args.compilerVersion,
    sourceIrVersion: args.sourceIrVersion,
    sourceIrHash: args.sourceIrHash,
    specJson: canonicalizeJcs(args.spec),
    specDigest,
    engine: args.engine,
    resolvedBindingsJson: canonicalizeJcs(args.resolvedBindings),
    missingBindingsJson: "[]",
    studioReviewPolicyVersion: args.studioReviewPolicyVersion,
    reviewSubjectDigest,
    reviewStatus: "approved",
    reviewedSubjectDigest: reviewSubjectDigest,
    reviewedByUserId: 44,
    reviewedAt: new Date("2026-08-09T00:00:00Z"),
    createdByUserId: 12,
    fdeSessionId: null,
    fdeFromTurnId: null,
    fdeToTurnId: null,
    diffJson: null,
    ...overrides,
  };
}

function freshResolver(overrides = {}) {
  return jest.fn().mockResolvedValue({
    resolved: input().resolvedBindings,
    missing: [],
    ...overrides,
  });
}

describe("FdeWorkflowDraft", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(async (callback) =>
      callback(prisma)
    );
    prisma.fde_workflow_drafts.updateMany.mockResolvedValue({ count: 1 });
  });

  it("uses RFC-8785-style canonical bytes for stable spec digests", () => {
    const left = { z: 1, a: { y: true, x: [3, "two"] } };
    const right = { a: { x: [3, "two"], y: true }, z: 1 };

    expect(canonicalizeJcs(left)).toBe('{"a":{"x":[3,"two"],"y":true},"z":1}');
    expect(computeSpecDigest(left)).toBe(computeSpecDigest(right));
    expect(computeSpecDigest(left)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("creates revision one with server-computed digests", async () => {
    prisma.fde_workflow_drafts.findFirst.mockResolvedValue(null);
    prisma.fde_workflow_drafts.create.mockImplementation(async ({ data }) => ({
      id: "draft-1",
      ...data,
    }));

    const result = await FdeWorkflowDraft.upsertRevision(input());

    expect(result.revision).toBe(1);
    expect(result.status).toBe("ready");
    expect(result.specDigest).toBe(computeSpecDigest(baseSpec()));
    expect(result.reviewSubjectDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(result.reviewStatus).toBe("not_requested");
  });

  it("loads the latest revision only inside a workspace lineage", async () => {
    prisma.fde_workflow_drafts.findFirst.mockResolvedValue(storedRow());

    await FdeWorkflowDraft.getLatestInLineage(7, "clinic-followup");

    expect(prisma.fde_workflow_drafts.findFirst).toHaveBeenCalledWith({
      where: { workspaceId: 7, lineageKey: "clinic-followup" },
      orderBy: { revision: "desc" },
    });
  });

  it("returns an identical latest revision without writing", async () => {
    const current = storedRow({ reviewStatus: "not_requested" });
    prisma.fde_workflow_drafts.findFirst.mockResolvedValue(current);

    const result = await FdeWorkflowDraft.upsertRevision(input());

    expect(result).toBe(current);
    expect(prisma.fde_workflow_drafts.create).not.toHaveBeenCalled();
    expect(prisma.fde_workflow_drafts.updateMany).not.toHaveBeenCalled();
  });

  it.each([
    [
      "specDigest",
      { spec: { ...baseSpec(), workflow: { nodes: [{ id: "new" }] } } },
    ],
    ["compilerVersion", { compilerVersion: "studio-compiler/2" }],
    ["targetVersion", { targetVersion: "2" }],
    ["schemaVersion", { schemaVersion: "1.1" }],
    ["engine", { engine: "future-engine" }],
    [
      "resolvedBindings",
      {
        resolvedBindings: {
          "default-chat-model": { provider: "openai", model: "gpt-5" },
        },
      },
    ],
    ["studioReviewPolicyVersion", { studioReviewPolicyVersion: "2" }],
  ])("resets approval atomically when %s changes", async (_field, change) => {
    const current = storedRow();
    prisma.fde_workflow_drafts.findFirst.mockResolvedValue(current);
    prisma.fde_workflow_drafts.findUnique.mockResolvedValue({
      ...current,
      reviewStatus: "not_requested",
      reviewedSubjectDigest: null,
    });

    await FdeWorkflowDraft.upsertRevision(input(change));

    expect(prisma.fde_workflow_drafts.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: current.id, stateVersion: current.stateVersion },
        data: expect.objectContaining({
          reviewStatus: "not_requested",
          reviewedSubjectDigest: null,
          reviewedByUserId: null,
          reviewedAt: null,
          stateVersion: { increment: 1 },
        }),
      })
    );
  });

  it("resets an approved 1.0 draft when recompilation produces schema 1.1", async () => {
    const current = storedRow();
    prisma.fde_workflow_drafts.findFirst.mockResolvedValue(current);
    prisma.fde_workflow_drafts.findUnique.mockResolvedValue({
      ...current,
      schemaVersion: "1.1",
      reviewStatus: "not_requested",
      reviewedSubjectDigest: null,
    });
    const recompiledSpec = { ...baseSpec(), schema_version: "1.1" };

    await FdeWorkflowDraft.upsertRevision(
      input({ spec: recompiledSpec, schemaVersion: "1.1" })
    );

    expect(prisma.fde_workflow_drafts.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: current.id, stateVersion: current.stateVersion },
        data: expect.objectContaining({
          schemaVersion: "1.1",
          reviewStatus: "not_requested",
          reviewedSubjectDigest: null,
          reviewedByUserId: null,
          reviewedAt: null,
        }),
      })
    );
  });

  it("creates a child revision instead of mutating a published row", async () => {
    const current = storedRow({ status: "published" });
    prisma.fde_workflow_drafts.findFirst.mockResolvedValue(current);
    prisma.fde_workflow_drafts.create.mockImplementation(async ({ data }) => ({
      id: "draft-2",
      ...data,
    }));

    const result = await FdeWorkflowDraft.upsertRevision(
      input({ compilerVersion: "studio-compiler/2" })
    );

    expect(result).toMatchObject({ revision: 2, parentDraftId: "draft-1" });
    expect(prisma.fde_workflow_drafts.updateMany).not.toHaveBeenCalled();
  });

  it("rejects a parent outside the workspace lineage", async () => {
    prisma.fde_workflow_drafts.findFirst
      .mockResolvedValueOnce(storedRow())
      .mockResolvedValueOnce(null);

    await expect(
      FdeWorkflowDraft.upsertRevision(
        input({ parentDraftId: "foreign-parent" })
      )
    ).rejects.toMatchObject({ code: "STUDIO_DRAFT_PARENT_NOT_FOUND" });
    expect(prisma.fde_workflow_drafts.create).not.toHaveBeenCalled();
    expect(prisma.fde_workflow_drafts.updateMany).not.toHaveBeenCalled();
  });

  it("rejects an optimistic write with a stale stateVersion", async () => {
    prisma.fde_workflow_drafts.findUnique.mockResolvedValue(
      storedRow({ diffJson: "{}" })
    );

    await expect(
      FdeWorkflowDraft.approve({
        id: "draft-1",
        actorUserId: 44,
        separationOfDutySatisfied: true,
        expectedStateVersion: 1,
        resolveFreshBindings: freshResolver(),
        studioReviewPolicyVersion: "1",
      })
    ).rejects.toMatchObject({ code: "STUDIO_DRAFT_STALE" });
  });

  it("forbids self-approval with a named error", async () => {
    prisma.fde_workflow_drafts.findUnique.mockResolvedValue(
      storedRow({ reviewStatus: "requested", createdByUserId: 12 })
    );

    await expect(
      FdeWorkflowDraft.approve({
        id: "draft-1",
        actorUserId: 12,
        separationOfDutySatisfied: true,
        expectedStateVersion: 2,
        resolveFreshBindings: freshResolver(),
        studioReviewPolicyVersion: "1",
      })
    ).rejects.toMatchObject({ code: "STUDIO_REVIEW_SELF_APPROVAL" });
  });

  it("cannot publish while a fresh binding is missing", async () => {
    prisma.fde_workflow_drafts.findUnique.mockResolvedValue(
      storedRow({ diffJson: "{}" })
    );

    await expect(
      FdeWorkflowDraft.publish({
        id: "draft-1",
        actorUserId: 55,
        separationOfDutySatisfied: true,
        expectedStateVersion: 2,
        resolveFreshBindings: freshResolver({
          resolved: {},
          missing: ["workspace_kb"],
        }),
        studioReviewPolicyVersion: "1",
      })
    ).rejects.toMatchObject({ code: "STUDIO_BINDING_MISSING" });
  });

  it("makes duplicate approve lose optimistic concurrency", async () => {
    const requested = storedRow({ reviewStatus: "requested" });
    prisma.fde_workflow_drafts.findUnique.mockResolvedValue(requested);
    prisma.fde_workflow_drafts.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      FdeWorkflowDraft.approve({
        id: requested.id,
        actorUserId: 44,
        separationOfDutySatisfied: true,
        expectedStateVersion: requested.stateVersion,
        resolveFreshBindings: freshResolver(),
      })
    ).rejects.toMatchObject({ code: "STUDIO_DRAFT_STALE", status: 409 });
  });

  it("makes import racing approve lose optimistic concurrency", async () => {
    const requested = storedRow({ reviewStatus: "requested" });
    prisma.fde_workflow_drafts.findFirst.mockResolvedValue(requested);
    prisma.fde_workflow_drafts.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      FdeWorkflowDraft.upsertRevision(
        input({ compilerVersion: "studio-compiler/2" })
      )
    ).rejects.toMatchObject({ code: "STUDIO_DRAFT_STALE", status: 409 });
  });

  it("makes approve racing publish fail on stale state", async () => {
    const approved = storedRow({ diffJson: "{}" });
    prisma.fde_workflow_drafts.findUnique.mockResolvedValue(approved);

    await expect(
      FdeWorkflowDraft.publish({
        id: approved.id,
        actorUserId: 55,
        separationOfDutySatisfied: true,
        expectedStateVersion: approved.stateVersion - 1,
        resolveFreshBindings: freshResolver(),
      })
    ).rejects.toMatchObject({ code: "STUDIO_DRAFT_STALE", status: 409 });
  });

  it("makes publish racing publish lose its conditional write", async () => {
    const approved = storedRow({ diffJson: "{}" });
    prisma.fde_workflow_drafts.findUnique.mockResolvedValue(approved);
    prisma.fde_workflow_drafts.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      FdeWorkflowDraft.publish({
        id: approved.id,
        actorUserId: 55,
        separationOfDutySatisfied: true,
        expectedStateVersion: approved.stateVersion,
        resolveFreshBindings: freshResolver(),
      })
    ).rejects.toMatchObject({ code: "STUDIO_DRAFT_STALE", status: 409 });
  });

  it.each(["requestReview", "approve", "reject", "publish"])(
    "never mutates a published row through %s",
    async (operation) => {
      const published = storedRow({
        status: "published",
        reviewStatus: operation === "requestReview" ? "approved" : "requested",
        diffJson: "{}",
      });
      prisma.fde_workflow_drafts.findUnique.mockResolvedValue(published);
      const args = {
        id: published.id,
        actorUserId: 44,
        assignedReviewerId: null,
        separationOfDutySatisfied: true,
        expectedStateVersion: published.stateVersion,
        resolveFreshBindings: freshResolver(),
      };

      await expect(FdeWorkflowDraft[operation](args)).rejects.toMatchObject({
        code: "STUDIO_DRAFT_IMMUTABLE",
        status: 409,
      });
      expect(prisma.fde_workflow_drafts.updateMany).not.toHaveBeenCalled();
    }
  );

  it("recomputes specDigest from specJson before approving", async () => {
    const requested = storedRow({
      reviewStatus: "requested",
      specJson: canonicalizeJcs({ ...baseSpec(), tampered: true }),
    });
    prisma.fde_workflow_drafts.findUnique.mockResolvedValue(requested);

    await expect(
      FdeWorkflowDraft.approve({
        id: requested.id,
        actorUserId: 44,
        separationOfDutySatisfied: true,
        expectedStateVersion: requested.stateVersion,
        resolveFreshBindings: freshResolver(),
      })
    ).rejects.toMatchObject({ code: "STUDIO_REVIEW_SUBJECT_CHANGED" });
    expect(prisma.fde_workflow_drafts.updateMany).not.toHaveBeenCalled();
  });

  it("resolves bindings through the active transaction client", async () => {
    const requested = storedRow({ reviewStatus: "requested" });
    prisma.fde_workflow_drafts.findUnique.mockResolvedValue(requested);
    prisma.fde_workflow_drafts.findUnique.mockResolvedValueOnce(requested);
    const resolver = freshResolver();

    await FdeWorkflowDraft.approve({
      id: requested.id,
      actorUserId: 44,
      separationOfDutySatisfied: true,
      expectedStateVersion: requested.stateVersion,
      resolveFreshBindings: resolver,
    });

    expect(resolver).toHaveBeenCalledWith({ draft: requested, tx: prisma });
  });

  it("uses serializable transactions for binding and approval consistency", async () => {
    const requested = storedRow({ reviewStatus: "requested" });
    prisma.fde_workflow_drafts.findUnique.mockResolvedValue(requested);

    await FdeWorkflowDraft.approve({
      id: requested.id,
      actorUserId: 44,
      separationOfDutySatisfied: true,
      expectedStateVersion: requested.stateVersion,
      resolveFreshBindings: freshResolver(),
    });

    expect(prisma.$transaction).toHaveBeenLastCalledWith(expect.any(Function), {
      isolationLevel: "Serializable",
    });
  });

  it.each(["approve", "publish"])(
    "blocks %s after switching an existing draft to single-user mode",
    async (operation) => {
      const digest = storedRow().reviewSubjectDigest;
      const draft = storedRow({
        reviewStatus: operation === "approve" ? "requested" : "approved",
        reviewedSubjectDigest: operation === "publish" ? digest : null,
        diffJson: "{}",
        createdByUserId: 12,
      });
      prisma.fde_workflow_drafts.findUnique.mockResolvedValue(draft);

      await expect(
        FdeWorkflowDraft[operation]({
          id: draft.id,
          actorUserId: null,
          separationOfDutySatisfied: false,
          expectedStateVersion: draft.stateVersion,
          resolveFreshBindings: freshResolver(),
        })
      ).rejects.toMatchObject({
        code: "STUDIO_REVIEW_SEPARATION_REQUIRED",
        status: 409,
      });
      expect(prisma.fde_workflow_drafts.updateMany).not.toHaveBeenCalled();
    }
  );
});
