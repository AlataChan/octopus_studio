const prisma = require("../../utils/prisma");
const { FdeAuthoringSession } = require("../../models/fdeAuthoringSession");
const { FdeWorkflowDraft } = require("../../models/fdeWorkflowDraft");
const {
  persistStudioWorkflowSpec,
} = require("../../utils/fde/studioWorkflowImporter");
const { resolveBindings } = require("../../utils/fde/studioWorkflowBindings");
const {
  createStudioRun,
  freshApprovedDraft,
} = require("../../utils/fde/studioRunService");
const spec = require("./ecommerceFaqStudioSpec.json");

async function main() {
  const suffix = process.env.ECOMMERCE_E2E_SUFFIX;
  const workspace = await prisma.workspaces.create({
    data: {
      name: `E-commerce E2E ${suffix}`,
      slug: `ecommerce-e2e-${suffix}`,
    },
  });
  let authoring = await FdeAuthoringSession.create({
    workspaceId: workspace.id,
    fdeSessionId: `fde-ecommerce-session-${suffix}`,
    createdByUserId: 12,
  });
  authoring = await FdeAuthoringSession.recordTurn(
    authoring.id,
    `requirement-${suffix}`
  );
  authoring = await FdeAuthoringSession.recordTurn(
    authoring.id,
    `compiled-ir-${suffix}`
  );
  let draft = await persistStudioWorkflowSpec({
    spec,
    workspaceId: workspace.id,
    actorUserId: 12,
    fdeSessionId: authoring.fdeSessionId,
    fdeFromTurnId: authoring.fdeFromTurnId,
    fdeToTurnId: authoring.fdeToTurnId,
    diffJson: JSON.stringify({
      changes: [
        { path: "workflow", kind: "ecommerce-faq-authored-for-studio-v1.1" },
      ],
    }),
  });
  const resolveFreshBindings = ({ tx }) =>
    resolveBindings({
      workspaceId: workspace.id,
      requiredBindings: spec.workflow.required_bindings,
      prismaClient: tx,
    });

  let unboundPublishCode = null;
  try {
    await FdeWorkflowDraft.publish({
      id: draft.id,
      actorUserId: 55,
      separationOfDutySatisfied: true,
      expectedStateVersion: draft.stateVersion,
      resolveFreshBindings,
    });
  } catch (error) {
    unboundPublishCode = error.code;
  }

  await prisma.workspaces.update({
    where: { id: workspace.id },
    data: {
      chatProvider: "deterministic",
      chatModel: "ecommerce-demo-model",
    },
  });
  await prisma.workspace_documents.create({
    data: {
      workspaceId: workspace.id,
      docId: `returns-policy-${suffix}`,
      filename: "returns-and-shipping-policy.md",
      docpath: "workspace_kb",
    },
  });
  draft = await persistStudioWorkflowSpec({
    spec,
    workspaceId: workspace.id,
    actorUserId: 12,
    lineageKey: draft.lineageKey,
    fdeSessionId: authoring.fdeSessionId,
    fdeFromTurnId: authoring.fdeFromTurnId,
    fdeToTurnId: authoring.fdeToTurnId,
    diffJson: draft.diffJson,
  });

  let unapprovedRunCode = null;
  try {
    await freshApprovedDraft(draft, workspace);
  } catch (error) {
    unapprovedRunCode = error.code;
  }
  draft = await FdeWorkflowDraft.requestReview({
    id: draft.id,
    expectedStateVersion: draft.stateVersion,
  });
  draft = await FdeWorkflowDraft.approve({
    id: draft.id,
    actorUserId: 44,
    separationOfDutySatisfied: true,
    expectedStateVersion: draft.stateVersion,
    resolveFreshBindings,
  });
  draft = await FdeWorkflowDraft.publish({
    id: draft.id,
    actorUserId: 55,
    separationOfDutySatisfied: true,
    expectedStateVersion: draft.stateVersion,
    resolveFreshBindings,
  });
  const run = await createStudioRun({
    draft,
    workspace: await prisma.workspaces.findUnique({
      where: { id: workspace.id },
    }),
    inputs: {
      customer_question: "Can I return an unused item 20 days after delivery?",
    },
    actor: { id: 12 },
    engine: "mastra",
  });
  process.stdout.write(
    `${JSON.stringify({
      runId: run.id,
      draftId: draft.id,
      workspaceId: workspace.id,
      workspaceSlug: workspace.slug,
      authoring,
      unboundPublishCode,
      unapprovedRunCode,
    })}\n`
  );
}

main()
  .catch((error) => {
    process.stderr.write(`${error.code || error.message}\n`);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
