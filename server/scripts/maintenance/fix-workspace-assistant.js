const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const isDryRun =
  process.argv.includes('--dry-run') ||
  process.env.DANGEROUS_OPS_ALLOWED !== 'true';

async function fix() {
  try {
    console.log(`Mode: ${isDryRun ? 'DRY-RUN' : 'LIVE WRITE'}`);
    const assistantId = '54030614-1070-4293-9099-2ab52c28fd50';
    
    console.log('修改前:');
    const before = await prisma.workspace_assistants.findUnique({
      where: { id: assistantId },
      include: { template: true }
    });
    console.log('实例名称:', before?.instanceName);
    console.log('模板名称:', before?.template?.name);
    console.log('模板知识模式:', before?.template?.knowledgeModeTemplate);
    console.log('实例覆盖:', before?.knowledgeModeOverride);
    
    console.log('\n正在修改...');
    if (isDryRun) {
      console.log(
        '[DRY-RUN] would execute:',
        `set workspace assistant ${assistantId} knowledgeModeOverride=null`
      );
      return;
    }

    const updated = await prisma.workspace_assistants.update({
      where: { id: assistantId },
      data: { knowledgeModeOverride: null }
    });
    
    console.log('\n修改后:');
    const after = await prisma.workspace_assistants.findUnique({
      where: { id: assistantId },
      include: { template: true }
    });
    console.log('实例名称:', after?.instanceName);
    console.log('模板名称:', after?.template?.name);
    console.log('模板知识模式:', after?.template?.knowledgeModeTemplate);
    console.log('实例覆盖:', after?.knowledgeModeOverride);
    
    console.log('\n✅ 修改成功！现在这个助手会使用模板的默认 workspace 模式');
    
  } catch (error) {
    console.error('错误:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fix();
