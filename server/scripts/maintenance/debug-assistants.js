const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debug() {
  try {
    console.log('=== 所有助手模板 ===');
    const templates = await prisma.assistant_templates.findMany();
    console.log(`找到 ${templates.length} 个模板\n`);
    
    templates.forEach(t => {
      console.log(`模板 ID: ${t.id}`);
      console.log(`名称: ${t.name}`);
      console.log(`知识模式: ${t.knowledgeModeTemplate || 'null'}`);
      console.log('---');
    });
    
    console.log('\n=== 所有 Workspace 助手实例 ===');
    const instances = await prisma.workspace_assistants.findMany({
      include: {
        template: true
      }
    });
    console.log(`找到 ${instances.length} 个实例\n`);
    
    instances.forEach(i => {
      console.log(`实例 ID: ${i.id}`);
      console.log(`实例名称: ${i.instanceName || '(无)'}`);
      console.log(`模板 ID: ${i.templateId}`);
      console.log(`模板名称: ${i.template?.name || '(未找到模板)'}`);
      console.log(`模板知识模式: ${i.template?.knowledgeModeTemplate || 'null'}`);
      console.log(`实例覆盖: ${i.knowledgeModeOverride || 'null'}`);
      console.log(`启用状态: ${i.enabled}`);
      console.log('---');
    });
    
    // 特别查找日志中的助手
    console.log('\n=== 查找日志中的助手 ===');
    const loggedId = 'caa08212-0227-40c1-b6fa-596ac7d1418a';
    const logged = await prisma.workspace_assistants.findUnique({
      where: { id: loggedId },
      include: { template: true }
    });
    
    if (logged) {
      console.log('✅ 找到了！');
      console.log(`实例名称: ${logged.instanceName || '(无)'}`);
      console.log(`模板名称: ${logged.template?.name}`);
      console.log(`知识模式: ${logged.template?.knowledgeModeTemplate}`);
    } else {
      console.log('❌ 未找到此助手');
    }
    
  } catch (error) {
    console.error('错误:', error);
  } finally {
    await prisma.$disconnect();
  }
}

debug();

