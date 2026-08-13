async function installAssistantTemplatesToWorkspace({
  prisma,
  WorkspaceAssistant,
  workspaceSlug,
  templateIds = null,
}) {
  const workspace = await prisma.workspaces.findUnique({
    where: { slug: workspaceSlug },
  });

  if (!workspace) {
    throw new Error(`Workspace ${workspaceSlug} not found`);
  }

  const templates = await prisma.assistant_templates.findMany({
    where: templateIds?.length ? { id: { in: templateIds } } : undefined,
    orderBy: { createdAt: "desc" },
  });

  const existingAssistants = await prisma.workspace_assistants.findMany({
    where: { workspaceId: workspace.id },
    select: { templateId: true },
  });

  const existingTemplateIds = new Set(
    existingAssistants.map((assistant) => assistant.templateId)
  );
  const installedTemplateIds = [];
  const skippedTemplateIds = [];

  for (const template of templates) {
    if (existingTemplateIds.has(template.id)) {
      skippedTemplateIds.push(template.id);
      continue;
    }

    const { assistant, message } = await WorkspaceAssistant.install(
      workspace.id,
      template.id,
      null,
      null,
      "hired"
    );

    if (!assistant) {
      throw new Error(message || `Failed to install template ${template.id}`);
    }

    installedTemplateIds.push(template.id);
  }

  return {
    workspaceId: workspace.id,
    workspaceSlug,
    installedTemplateIds,
    skippedTemplateIds,
    totalTemplates: templates.length,
  };
}

module.exports = {
  installAssistantTemplatesToWorkspace,
};
