const crypto = require("crypto");
const prisma = require("../utils/prisma");

const STUDIO_REVIEW_POLICY_VERSION = "1";

class FdeWorkflowDraftError extends Error {
  constructor(code, message, status = 409, path = "draft") {
    super(message);
    this.name = "FdeWorkflowDraftError";
    this.code = code;
    this.status = status;
    this.path = path;
  }
}

function canonicalizeJcs(value) {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new FdeWorkflowDraftError(
        "STUDIO_CANONICAL_JSON_INVALID",
        "canonical JSON contains a non-finite number",
        400,
        "spec"
      );
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalizeJcs(item)).join(",")}]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys
      .map((key) => `${JSON.stringify(key)}:${canonicalizeJcs(value[key])}`)
      .join(",")}}`;
  }
  throw new FdeWorkflowDraftError(
    "STUDIO_CANONICAL_JSON_INVALID",
    "canonical JSON contains an unsupported value",
    400,
    "spec"
  );
}

function sha256(value) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function computeSpecDigest(spec) {
  return sha256(canonicalizeJcs(spec));
}

function computeReviewSubjectDigest({
  specDigest,
  compilerVersion,
  targetVersion,
  schemaVersion,
  engine,
  resolvedBindings,
  studioReviewPolicyVersion,
}) {
  return sha256(
    canonicalizeJcs({
      specDigest,
      compilerVersion,
      targetVersion,
      schemaVersion,
      engine,
      resolvedBindings,
      studioReviewPolicyVersion,
    })
  );
}

function parseJson(value, fallback) {
  if (value && typeof value === "object") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function requireStateVersion(draft, expectedStateVersion) {
  if (draft.stateVersion !== expectedStateVersion) {
    throw new FdeWorkflowDraftError(
      "STUDIO_DRAFT_STALE",
      "draft changed before this operation completed"
    );
  }
}

function requireDraft(draft) {
  if (!draft) {
    throw new FdeWorkflowDraftError(
      "STUDIO_DRAFT_NOT_FOUND",
      "draft not found",
      404
    );
  }
  return draft;
}

function isProviderConflict(error) {
  if (["P1008", "P2002", "P2028", "P2034"].includes(error?.code)) return true;
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("database is locked") ||
    message.includes("transaction already closed") ||
    message.includes("transaction api error")
  );
}

async function draftTransaction(prismaClient, callback) {
  try {
    return await prismaClient.$transaction(callback, {
      isolationLevel: "Serializable",
    });
  } catch (error) {
    if (isProviderConflict(error)) {
      throw new FdeWorkflowDraftError(
        "STUDIO_DRAFT_CONFLICT",
        "draft changed concurrently"
      );
    }
    throw error;
  }
}

function draftInputData(args, { revision, parentDraftId = null }) {
  const specJson = canonicalizeJcs(args.spec);
  const specDigest = sha256(specJson);
  const resolvedBindings = args.resolvedBindings || {};
  const missingBindings = args.missingBindings || [];
  const studioReviewPolicyVersion =
    args.studioReviewPolicyVersion || STUDIO_REVIEW_POLICY_VERSION;
  const reviewSubjectDigest = computeReviewSubjectDigest({
    specDigest,
    compilerVersion: args.compilerVersion,
    targetVersion: args.targetVersion,
    schemaVersion: args.schemaVersion,
    engine: args.engine,
    resolvedBindings,
    studioReviewPolicyVersion,
  });
  return {
    workspaceId: Number(args.workspaceId),
    fdeSessionId: args.fdeSessionId || null,
    fdeFromTurnId: args.fdeFromTurnId || null,
    fdeToTurnId: args.fdeToTurnId || null,
    diffJson: args.diffJson || null,
    studioReviewPolicyVersion,
    lineageKey: args.lineageKey,
    revision,
    parentDraftId,
    name: args.name,
    contract: args.contract || "studio-v1",
    targetVersion: args.targetVersion,
    schemaVersion: args.schemaVersion,
    compilerVersion: args.compilerVersion,
    sourceIrVersion: args.sourceIrVersion,
    sourceIrHash: args.sourceIrHash,
    specJson,
    specDigest,
    reviewSubjectDigest,
    status: missingBindings.length ? "draft" : "ready",
    engine: args.engine,
    resolvedBindingsJson: canonicalizeJcs(resolvedBindings),
    missingBindingsJson: canonicalizeJcs(missingBindings),
    reviewStatus: "not_requested",
    reviewedSubjectDigest: null,
    assignedReviewerId: null,
    reviewedByUserId: null,
    reviewedAt: null,
    publishedByUserId: null,
    publishedAt: null,
    createdByUserId: args.createdByUserId || null,
  };
}

function sameImport(current, next) {
  const fields = [
    "fdeSessionId",
    "fdeFromTurnId",
    "fdeToTurnId",
    "diffJson",
    "studioReviewPolicyVersion",
    "name",
    "contract",
    "targetVersion",
    "schemaVersion",
    "compilerVersion",
    "sourceIrVersion",
    "sourceIrHash",
    "specJson",
    "specDigest",
    "reviewSubjectDigest",
    "engine",
    "resolvedBindingsJson",
    "missingBindingsJson",
  ];
  return fields.every((field) => current[field] === next[field]);
}

async function updatedOrCurrent(
  tx,
  id,
  current,
  data,
  beforeConditionalWrite = null
) {
  if (beforeConditionalWrite) {
    await beforeConditionalWrite({ id, current, data });
  }
  const updated = await tx.fde_workflow_drafts.updateMany({
    where: { id, stateVersion: current.stateVersion },
    data: { ...data, stateVersion: { increment: 1 } },
  });
  if (updated.count !== 1) {
    throw new FdeWorkflowDraftError(
      "STUDIO_DRAFT_STALE",
      "draft changed before this operation completed"
    );
  }
  return (
    (await tx.fde_workflow_drafts.findUnique({ where: { id } })) || {
      ...current,
      ...data,
      stateVersion: current.stateVersion + 1,
    }
  );
}

function requireMutableDraft(draft) {
  if (draft.status === "published" || draft.status === "archived") {
    throw new FdeWorkflowDraftError(
      "STUDIO_DRAFT_IMMUTABLE",
      "published and archived draft revisions are immutable"
    );
  }
}

async function freshReviewContext({
  draft,
  tx,
  resolveFreshBindings,
  studioReviewPolicyVersion,
}) {
  if (typeof resolveFreshBindings !== "function") {
    throw new FdeWorkflowDraftError(
      "STUDIO_BINDING_RESOLVER_REQUIRED",
      "fresh bindings must be resolved inside the draft transaction"
    );
  }
  const spec = parseJson(draft.specJson, null);
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    throw new FdeWorkflowDraftError(
      "STUDIO_DRAFT_SPEC_INVALID",
      "stored workflow spec is invalid"
    );
  }
  const specDigest = computeSpecDigest(spec);
  const fresh = await resolveFreshBindings({ draft, tx });
  if (!fresh || !Array.isArray(fresh.missing) || !fresh.resolved) {
    throw new FdeWorkflowDraftError(
      "STUDIO_BINDING_RESOLUTION_INVALID",
      "fresh binding resolution returned an invalid result"
    );
  }
  const subject = computeReviewSubjectDigest({
    specDigest,
    compilerVersion: draft.compilerVersion,
    targetVersion: draft.targetVersion,
    schemaVersion: draft.schemaVersion,
    engine: draft.engine,
    resolvedBindings: fresh.resolved,
    studioReviewPolicyVersion,
  });
  return { ...fresh, specDigest, subject };
}

function createFdeWorkflowDraftModel(prismaClient = prisma, hooks = {}) {
  const model = {
    STATUS: {
      DRAFT: "draft",
      READY: "ready",
      PUBLISHED: "published",
      ARCHIVED: "archived",
    },

    REVIEW_STATUS: {
      NOT_REQUESTED: "not_requested",
      REQUESTED: "requested",
      APPROVED: "approved",
      REJECTED: "rejected",
    },

    async getById(id) {
      return prismaClient.fde_workflow_drafts.findUnique({ where: { id } });
    },

    async getInWorkspace(id, workspaceId) {
      return prismaClient.fde_workflow_drafts.findFirst({
        where: { id, workspaceId: Number(workspaceId) },
      });
    },

    async getLatestInLineage(workspaceId, lineageKey) {
      return prismaClient.fde_workflow_drafts.findFirst({
        where: {
          workspaceId: Number(workspaceId),
          lineageKey: String(lineageKey),
        },
        orderBy: { revision: "desc" },
      });
    },

    async listByWorkspace(workspaceId) {
      return prismaClient.fde_workflow_drafts.findMany({
        where: { workspaceId: Number(workspaceId) },
        orderBy: [{ lineageKey: "asc" }, { revision: "desc" }],
      });
    },

    async upsertRevision(args) {
      try {
        return await draftTransaction(prismaClient, async (tx) => {
          const current = await tx.fde_workflow_drafts.findFirst({
            where: {
              workspaceId: Number(args.workspaceId),
              lineageKey: args.lineageKey,
            },
            orderBy: { revision: "desc" },
          });
          if (args.parentDraftId) {
            const parent = await tx.fde_workflow_drafts.findFirst({
              where: {
                id: args.parentDraftId,
                workspaceId: Number(args.workspaceId),
                lineageKey: args.lineageKey,
              },
            });
            if (!parent) {
              throw new FdeWorkflowDraftError(
                "STUDIO_DRAFT_PARENT_NOT_FOUND",
                "parent draft is not in the workspace lineage",
                404,
                "parentDraftId"
              );
            }
          }
          const next = draftInputData(args, {
            revision: current ? current.revision : 1,
            parentDraftId: current?.parentDraftId || args.parentDraftId || null,
          });
          if (!current) return tx.fde_workflow_drafts.create({ data: next });
          if (sameImport(current, next)) return current;

          if (current.status === model.STATUS.PUBLISHED) {
            return tx.fde_workflow_drafts.create({
              data: draftInputData(args, {
                revision: current.revision + 1,
                parentDraftId: current.id,
              }),
            });
          }

          const subjectChanged =
            current.reviewSubjectDigest !== next.reviewSubjectDigest;
          const mutable = { ...next };
          delete mutable.workspaceId;
          delete mutable.lineageKey;
          delete mutable.revision;
          delete mutable.parentDraftId;
          delete mutable.createdByUserId;
          if (!subjectChanged) {
            delete mutable.reviewStatus;
            delete mutable.reviewedSubjectDigest;
            delete mutable.assignedReviewerId;
            delete mutable.reviewedByUserId;
            delete mutable.reviewedAt;
            delete mutable.publishedByUserId;
            delete mutable.publishedAt;
          }
          return updatedOrCurrent(
            tx,
            current.id,
            current,
            mutable,
            hooks.beforeConditionalWrite
          );
        });
      } catch (error) {
        if (error?.code === "P2002") {
          throw new FdeWorkflowDraftError(
            "STUDIO_DRAFT_CONFLICT",
            "draft revision changed concurrently"
          );
        }
        throw error;
      }
    },

    async requestReview({
      id,
      assignedReviewerId = null,
      expectedStateVersion,
    }) {
      return draftTransaction(prismaClient, async (tx) => {
        const draft = requireDraft(
          await tx.fde_workflow_drafts.findUnique({ where: { id } })
        );
        requireStateVersion(draft, expectedStateVersion);
        requireMutableDraft(draft);
        if (parseJson(draft.missingBindingsJson, []).length) {
          throw new FdeWorkflowDraftError(
            "STUDIO_BINDING_MISSING",
            "all workflow bindings must resolve before review"
          );
        }
        return updatedOrCurrent(
          tx,
          id,
          draft,
          {
            reviewStatus: model.REVIEW_STATUS.REQUESTED,
            assignedReviewerId,
            reviewedSubjectDigest: null,
            reviewedByUserId: null,
            reviewedAt: null,
          },
          hooks.beforeConditionalWrite
        );
      });
    },

    async approve({
      id,
      actorUserId,
      separationOfDutySatisfied,
      expectedStateVersion,
      resolveFreshBindings,
      studioReviewPolicyVersion = STUDIO_REVIEW_POLICY_VERSION,
    }) {
      return draftTransaction(prismaClient, async (tx) => {
        const draft = requireDraft(
          await tx.fde_workflow_drafts.findUnique({ where: { id } })
        );
        requireStateVersion(draft, expectedStateVersion);
        requireMutableDraft(draft);
        if (separationOfDutySatisfied !== true) {
          throw new FdeWorkflowDraftError(
            "STUDIO_REVIEW_SEPARATION_REQUIRED",
            "approval requires a distinct authenticated reviewer"
          );
        }
        if (draft.createdByUserId === actorUserId) {
          throw new FdeWorkflowDraftError(
            "STUDIO_REVIEW_SELF_APPROVAL",
            "a draft creator cannot approve the same draft"
          );
        }
        if (draft.reviewStatus !== model.REVIEW_STATUS.REQUESTED) {
          throw new FdeWorkflowDraftError(
            "STUDIO_REVIEW_NOT_REQUESTED",
            "draft is not awaiting review"
          );
        }
        const fresh = await freshReviewContext({
          draft,
          tx,
          resolveFreshBindings,
          studioReviewPolicyVersion,
        });
        if (fresh.missing.length) {
          throw new FdeWorkflowDraftError(
            "STUDIO_BINDING_MISSING",
            "all workflow bindings must resolve before approval"
          );
        }
        if (fresh.subject !== draft.reviewSubjectDigest) {
          throw new FdeWorkflowDraftError(
            "STUDIO_REVIEW_SUBJECT_CHANGED",
            "review subject changed and must be requested again"
          );
        }
        return updatedOrCurrent(
          tx,
          id,
          draft,
          {
            resolvedBindingsJson: canonicalizeJcs(fresh.resolved),
            missingBindingsJson: "[]",
            studioReviewPolicyVersion,
            reviewSubjectDigest: fresh.subject,
            reviewStatus: model.REVIEW_STATUS.APPROVED,
            reviewedSubjectDigest: fresh.subject,
            reviewedByUserId: actorUserId,
            reviewedAt: new Date(),
          },
          hooks.beforeConditionalWrite
        );
      });
    },

    async reject({ id, actorUserId, expectedStateVersion }) {
      return draftTransaction(prismaClient, async (tx) => {
        const draft = requireDraft(
          await tx.fde_workflow_drafts.findUnique({ where: { id } })
        );
        requireStateVersion(draft, expectedStateVersion);
        requireMutableDraft(draft);
        if (draft.reviewStatus !== model.REVIEW_STATUS.REQUESTED) {
          throw new FdeWorkflowDraftError(
            "STUDIO_REVIEW_NOT_REQUESTED",
            "draft is not awaiting review"
          );
        }
        return updatedOrCurrent(
          tx,
          id,
          draft,
          {
            reviewStatus: model.REVIEW_STATUS.REJECTED,
            reviewedSubjectDigest: null,
            reviewedByUserId: actorUserId,
            reviewedAt: new Date(),
          },
          hooks.beforeConditionalWrite
        );
      });
    },

    async publish({
      id,
      actorUserId,
      separationOfDutySatisfied,
      expectedStateVersion,
      resolveFreshBindings,
      studioReviewPolicyVersion = STUDIO_REVIEW_POLICY_VERSION,
    }) {
      return draftTransaction(prismaClient, async (tx) => {
        const draft = requireDraft(
          await tx.fde_workflow_drafts.findUnique({ where: { id } })
        );
        requireStateVersion(draft, expectedStateVersion);
        requireMutableDraft(draft);
        if (separationOfDutySatisfied !== true) {
          throw new FdeWorkflowDraftError(
            "STUDIO_REVIEW_SEPARATION_REQUIRED",
            "publication requires a distinct authenticated reviewer"
          );
        }
        if (!draft.diffJson) {
          throw new FdeWorkflowDraftError(
            "STUDIO_PUBLISH_DIFF_REQUIRED",
            "publication is disabled until a computed review diff exists"
          );
        }
        const fresh = await freshReviewContext({
          draft,
          tx,
          resolveFreshBindings,
          studioReviewPolicyVersion,
        });
        if (fresh.missing.length) {
          throw new FdeWorkflowDraftError(
            "STUDIO_BINDING_MISSING",
            "all workflow bindings must resolve before publication"
          );
        }
        if (
          draft.reviewStatus !== model.REVIEW_STATUS.APPROVED ||
          draft.reviewedSubjectDigest !== fresh.subject ||
          draft.reviewSubjectDigest !== fresh.subject
        ) {
          throw new FdeWorkflowDraftError(
            "STUDIO_REVIEW_REQUIRED",
            "publication requires approval of the current review subject"
          );
        }
        return updatedOrCurrent(
          tx,
          id,
          draft,
          {
            status: model.STATUS.PUBLISHED,
            resolvedBindingsJson: canonicalizeJcs(fresh.resolved),
            missingBindingsJson: "[]",
            studioReviewPolicyVersion,
            reviewSubjectDigest: fresh.subject,
            publishedByUserId: actorUserId,
            publishedAt: new Date(),
          },
          hooks.beforeConditionalWrite
        );
      });
    },
  };
  return model;
}

const FdeWorkflowDraft = createFdeWorkflowDraftModel();

module.exports = {
  FdeWorkflowDraft,
  FdeWorkflowDraftError,
  createFdeWorkflowDraftModel,
  STUDIO_REVIEW_POLICY_VERSION,
  canonicalizeJcs,
  computeReviewSubjectDigest,
  computeSpecDigest,
};
