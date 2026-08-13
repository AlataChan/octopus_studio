const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  console.log('=== Assistant Templates ===');
  const templates = await prisma.assistant_templates.findMany({
    select: { id: true, name: true, knowledgeModeTemplate: true }
  });
  templates.forEach(t => {
    console.log(`ID: ${t.id}`);
    console.log(`Name: ${t.name}`);
    console.log(`KnowledgeMode: ${t.knowledgeModeTemplate}`);
    console.log('---');
  });
  
  console.log('\n=== Workspace Assistants ===');
  const instances = await prisma.workspace_assistants.findMany({
    select: { 
      id: true, 
      instanceName: true, 
      templateId: true, 
      knowledgeModeOverride: true,
      workspaceId: true
    }
  });
  instances.forEach(i => {
    console.log(`ID: ${i.id}`);
    console.log(`Name: ${i.instanceName}`);
    console.log(`TemplateID: ${i.templateId}`);
    console.log(`Override: ${i.knowledgeModeOverride}`);
    console.log(`WorkspaceID: ${i.workspaceId}`);
    console.log('---');
  });
  
  await prisma.$disconnect();
}

check().catch(console.error);

