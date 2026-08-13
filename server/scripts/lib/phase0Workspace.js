const PHASE0_WORKSPACE_NAME = "Phase 0 Test Workspace";

async function ensurePhase0Workspace(prisma) {
  const existingWorkspace = await prisma.workspaces.findFirst({
    where: { name: PHASE0_WORKSPACE_NAME },
    orderBy: { id: "desc" },
  });

  if (existingWorkspace) {
    return existingWorkspace;
  }

  return prisma.workspaces.create({
    data: {
      name: PHASE0_WORKSPACE_NAME,
      slug: `phase0-test-${Date.now()}`,
    },
  });
}

module.exports = {
  PHASE0_WORKSPACE_NAME,
  ensurePhase0Workspace,
};
