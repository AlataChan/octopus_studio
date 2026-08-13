const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const isDryRun =
  process.argv.includes('--dry-run') ||
  process.env.DANGEROUS_OPS_ALLOWED !== 'true';

/**
 * 批量修复助手的 knowledgeMode 配置
 * 根据助手名称或模板名称，设置正确的 knowledgeModeTemplate
 */
async function batchFix() {
  try {
    console.log(`Mode: ${isDryRun ? 'DRY-RUN' : 'LIVE WRITE'}`);
    console.log('=== 开始批量修复助手 knowledgeMode ===\n');

    // 定义分类规则（使用名称模糊匹配）
    const categories = {
      workspace: [
        'luna', 'suqing', 'vera', 'ethan', 'clara', 'alata',
        '露娜', '苏晴', '林溪源', '程远帆', '沈清禾', '陈嘉鑫',
        'workspace 模式', 'workspace模式',
      ],
      platform: ['dify'],
      none: ['none 模式', 'none模式'],
    };

    // 获取所有助手模板
    const templates = await prisma.assistant_templates.findMany();
    console.log(`找到 ${templates.length} 个助手模板\n`);

    const updates = [];

    for (const template of templates) {
      const name = template.name.toLowerCase();
      const employeeName = (template.employeeName || '').toLowerCase();

      let targetMode = null;

      // 优先检查 none 模式（避免被 workspace 模式误匹配）
      for (const keyword of categories.none) {
        if (name.includes(keyword.toLowerCase()) ||
            employeeName.includes(keyword.toLowerCase())) {
          targetMode = 'none';
          break;
        }
      }

      // 检查是否匹配 platform 模式
      if (!targetMode) {
        for (const keyword of categories.platform) {
          if (name.includes(keyword.toLowerCase()) ||
              employeeName.includes(keyword.toLowerCase()) ||
              template.platformType === keyword) {
            targetMode = 'platform';
            break;
          }
        }
      }

      // 检查是否匹配 workspace 模式
      if (!targetMode) {
        for (const keyword of categories.workspace) {
          if (name.includes(keyword.toLowerCase()) ||
              employeeName.includes(keyword.toLowerCase())) {
            targetMode = 'workspace';
            break;
          }
        }
      }

      // 如果没有匹配到任何规则，保持默认 workspace
      if (!targetMode) {
        targetMode = 'workspace';
        console.log(`⚠️  未匹配到规则，使用默认 workspace: ${template.name}`);
      }

      // 检查是否需要更新
      if (template.knowledgeModeTemplate !== targetMode) {
        updates.push({
          id: template.id,
          name: template.name,
          employeeName: template.employeeName,
          oldMode: template.knowledgeModeTemplate || 'null',
          newMode: targetMode,
        });
      }
    }

    if (updates.length === 0) {
      console.log('✅ 所有助手的 knowledgeMode 都已正确配置，无需更新');
      return;
    }

    console.log(`\n=== 需要更新的助手 (${updates.length} 个) ===\n`);
    updates.forEach((u, i) => {
      console.log(`${i + 1}. ${u.name}${u.employeeName ? ` (${u.employeeName})` : ''}`);
      console.log(`   ${u.oldMode} → ${u.newMode}`);
    });

    console.log('\n开始更新...\n');

    for (const update of updates) {
      const summary = `${update.name}: ${update.oldMode} → ${update.newMode}`;
      if (isDryRun) {
        console.log('[DRY-RUN] would execute:', summary);
        continue;
      }

      await prisma.assistant_templates.update({
        where: { id: update.id },
        data: { knowledgeModeTemplate: update.newMode },
      });
      console.log(`✅ ${summary}`);
    }

    if (isDryRun) {
      console.log('\n[DRY-RUN] 跳过更新后的验证查询');
      return;
    }

    console.log('\n=== 更新完成 ===\n');

    // 验证结果
    console.log('=== 验证结果 ===\n');
    const updated = await prisma.assistant_templates.findMany({
      select: {
        name: true,
        employeeName: true,
        knowledgeModeTemplate: true,
        platformType: true,
      },
      orderBy: { knowledgeModeTemplate: 'asc' },
    });

    const grouped = {
      workspace: [],
      platform: [],
      none: [],
    };

    updated.forEach(t => {
      const mode = t.knowledgeModeTemplate || 'workspace';
      grouped[mode].push(t);
    });

    console.log('📁 Workspace 模式:');
    grouped.workspace.forEach(t => {
      console.log(`   - ${t.name}${t.employeeName ? ` (${t.employeeName})` : ''}`);
    });

    console.log('\n🌐 Platform 模式:');
    grouped.platform.forEach(t => {
      console.log(`   - ${t.name}${t.employeeName ? ` (${t.employeeName})` : ''} [${t.platformType}]`);
    });

    console.log('\n💬 None 模式:');
    grouped.none.forEach(t => {
      console.log(`   - ${t.name}${t.employeeName ? ` (${t.employeeName})` : ''}`);
    });

    console.log('\n✅ 所有助手已按照分类正确配置！');

  } catch (error) {
    console.error('❌ 错误:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

batchFix();
