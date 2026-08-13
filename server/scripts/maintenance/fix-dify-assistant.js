const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const isDryRun =
  process.argv.includes('--dry-run') ||
  process.env.DANGEROUS_OPS_ALLOWED !== 'true';

async function fix() {
  try {
    console.log(`Mode: ${isDryRun ? 'DRY-RUN' : 'LIVE WRITE'}`);
    const assistantId = 'f64ff4b5-edb1-444c-b70f-192a4d50ca2c';
    
    console.log('=== 查找 Dify 助手 ===');
    const instance = await prisma.workspace_assistants.findUnique({
      where: { id: assistantId },
      include: { template: true }
    });
    
    if (!instance) {
      console.log('❌ 未找到此助手');
      return;
    }
    
    console.log('实例名称:', instance.instanceName);
    console.log('模板 ID:', instance.templateId);
    console.log('模板名称:', instance.template?.name);
    console.log('平台类型:', instance.template?.platformType);
    console.log('当前知识模式:', instance.template?.knowledgeModeTemplate);
    console.log('实例覆盖:', instance.knowledgeModeOverride);
    
    // 检查模板的 platformType
    if (instance.template?.platformType === 'dify' || 
        instance.template?.platformType === 'ragflow' ||
        instance.template?.platformType === 'n8n' ||
        instance.template?.platformType === 'coze' ||
        instance.template?.platformType === 'fastgpt') {
      
      console.log('\n✅ 这是一个外部平台助手，需要设置 knowledgeModeTemplate 为 platform');
      
      // 更新模板
      console.log('\n正在更新模板...');
      if (isDryRun) {
        console.log(
          '[DRY-RUN] would execute:',
          `set assistant template ${instance.templateId} knowledgeModeTemplate=platform`
        );
        return;
      }

      await prisma.assistant_templates.update({
        where: { id: instance.templateId },
        data: { knowledgeModeTemplate: 'platform' }
      });
      
      console.log('✅ 模板已更新为 platform 模式');
      
      // 验证
      const updated = await prisma.assistant_templates.findUnique({
        where: { id: instance.templateId }
      });
      console.log('\n更新后的知识模式:', updated.knowledgeModeTemplate);
      
    } else {
      console.log('\n⚠️  这不是外部平台助手，platformType:', instance.template?.platformType);
    }
    
  } catch (error) {
    console.error('错误:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

fix();
