/**
 * 更新所有 AI 助手的文档生成工具配置
 *
 * - AI合同审核: Word + PDF (审核报告)
 * - AI票证识别: Excel (批量导出)
 * - AI简历筛选: Excel + PDF (筛选报告)
 * - AI公文助手: Word + Excel + PPT + PDF (全部)
 */

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const newSystemPrompt = `你是一位专业的AI文档助手，精通各类公文写作和办公文档生成。

## 支持的文档格式
- **Word (.docx)** - 公文、通知、报告、合同
- **Excel (.xlsx)** - 数据报表、统计表格、清单
- **PowerPoint (.pptx)** - 汇报材料、演示文稿
- **PDF** - 正式文档、合同、证书

## 公文类型
### 上行文
- 请示、报告、意见

### 下行文
- 通知、通报、决定、批复

### 平行文
- 函（商洽函、询问函、答复函、请批函）
- 会议纪要

## 写作原则
1. **准确性** - 内容真实、数据准确
2. **简明性** - 言简意赅、条理清晰
3. **规范性** - 格式标准、用语规范

## 工具使用指南

### 1. Word公文 - generate-official-document
用于生成符合公文格式规范的Word文档（页边距3.7/3.5/2.8/2.6cm、行距28磅、仿宋字体）

### 2. Excel表格 - generate-excel-report
用于生成数据报表、统计表格。支持多工作表、表头样式、自动列宽。

### 3. PPT演示 - generate-presentation
用于生成演示文稿（空白背景，用户可套用公司模板）。
幻灯片类型：title(标题页)、section(章节页)、bullets(要点页)、text(文本页)

### 4. PDF文档 - generate-pdf-document
用于生成正式PDF文档，支持中文。

## 重要提示
- 当用户要求生成/下载文档时，根据文档类型选择对应工具
- Word公文优先使用 generate-official-document
- 数据表格使用 generate-excel-report
- 演示汇报使用 generate-presentation
- PDF文档使用 generate-pdf-document`;

/**
 * 文档生成工具常量
 */
const DOC_TOOLS = {
  WORD: 'generate-official-document',
  EXCEL: 'generate-excel-report',
  PPT: 'generate-presentation',
  PDF: 'generate-pdf-document',
};

/**
 * 文档工具使用说明（追加到 System Prompt）
 */
const DOC_PROMPTS = {
  WORD_PDF: `

## 文档生成工具
- Word文档：使用 generate-official-document 工具
- PDF文档：使用 generate-pdf-document 工具`,

  EXCEL: `

## 文档生成工具
- Excel表格：使用 generate-excel-report 工具，支持多工作表和数据导出`,

  EXCEL_PDF: `

## 文档生成工具
- Excel报表：使用 generate-excel-report 工具
- PDF报告：使用 generate-pdf-document 工具`,

  EXCEL_PPT_PDF: `

## 文档生成工具
- Excel数据：使用 generate-excel-report 工具
- PPT汇报：使用 generate-presentation 工具
- PDF报告：使用 generate-pdf-document 工具`,

  WORD_EXCEL_PPT: `

## 文档生成工具
- Word文档：使用 generate-official-document 工具
- Excel表格：使用 generate-excel-report 工具
- PPT演示：使用 generate-presentation 工具`,

  WORD_PPT_PDF: `

## 文档生成工具
- Word文档：使用 generate-official-document 工具
- PPT汇报：使用 generate-presentation 工具
- PDF报告：使用 generate-pdf-document 工具`,

  ALL: `

## 文档生成工具
- Word公文：使用 generate-official-document 工具
- Excel表格：使用 generate-excel-report 工具
- PPT演示：使用 generate-presentation 工具（空白背景，可套用公司模板）
- PDF文档：使用 generate-pdf-document 工具`,
};

/**
 * 各助手的工具配置
 */
const assistantConfigs = {
  // ===== 原有员工 =====

  // 长文协作助手 - 需要 Word + PDF
  '长文协作助手': {
    addTools: [DOC_TOOLS.WORD, DOC_TOOLS.PDF],
    promptAddition: DOC_PROMPTS.WORD_PDF,
  },

  // 市场调研助手 - 需要 Excel + PPT + PDF
  '市场调研助手': {
    addTools: [DOC_TOOLS.EXCEL, DOC_TOOLS.PPT, DOC_TOOLS.PDF],
    promptAddition: DOC_PROMPTS.EXCEL_PPT_PDF,
  },

  // 数据挖掘分析师 - 需要 Excel + PDF
  '数据挖掘分析师': {
    addTools: [DOC_TOOLS.EXCEL, DOC_TOOLS.PDF],
    promptAddition: DOC_PROMPTS.EXCEL_PDF,
  },

  // 项目管理工程师 - 需要 Word + Excel + PPT
  '项目管理工程师': {
    addTools: [DOC_TOOLS.WORD, DOC_TOOLS.EXCEL, DOC_TOOLS.PPT],
    promptAddition: DOC_PROMPTS.WORD_EXCEL_PPT,
  },

  // 项目审核分析师 (沈清禾) - 需要 Word + PPT + PDF
  '项目审核分析师': {
    addTools: [DOC_TOOLS.WORD, DOC_TOOLS.PPT, DOC_TOOLS.PDF],
    promptAddition: DOC_PROMPTS.WORD_PPT_PDF,
  },

  // 默认助手 (Alata) - 全部
  '默认助手': {
    addTools: [DOC_TOOLS.WORD, DOC_TOOLS.EXCEL, DOC_TOOLS.PPT, DOC_TOOLS.PDF],
    promptAddition: DOC_PROMPTS.ALL,
  },

  // 三金 - 全部
  '三金': {
    addTools: [DOC_TOOLS.WORD, DOC_TOOLS.EXCEL, DOC_TOOLS.PPT, DOC_TOOLS.PDF],
    promptAddition: DOC_PROMPTS.ALL,
  },

  // ===== 新增的4个员工 =====

  // AI合同审核 - Word + PDF
  'AI合同审核': {
    addTools: [DOC_TOOLS.WORD, DOC_TOOLS.PDF],
    promptAddition: DOC_PROMPTS.WORD_PDF,
  },

  // AI票证识别 - Excel
  'AI票证识别': {
    addTools: [DOC_TOOLS.EXCEL],
    promptAddition: DOC_PROMPTS.EXCEL,
  },

  // AI简历筛选 - Excel + PDF
  'AI简历筛选': {
    addTools: [DOC_TOOLS.EXCEL, DOC_TOOLS.PDF],
    promptAddition: DOC_PROMPTS.EXCEL_PDF,
  },

  // AI公文助手 - 全部 + 完整新 Prompt
  'AI公文助手': {
    addTools: [DOC_TOOLS.WORD, DOC_TOOLS.EXCEL, DOC_TOOLS.PPT, DOC_TOOLS.PDF],
    systemPrompt: newSystemPrompt,
  },
};

async function main() {
  try {
    console.log('🚀 开始更新所有 AI 助手的文档生成工具...\n');

    let successCount = 0;
    let skipCount = 0;

    for (const [name, config] of Object.entries(assistantConfigs)) {
      // 获取当前助手（可能有多个同名的，取第一个）
      const assistants = await prisma.assistant_templates.findMany({
        where: { name },
        select: { id: true, name: true, employeeName: true, systemPrompt: true, defaultTools: true }
      });

      if (assistants.length === 0) {
        console.log(`⚠️  未找到助手: ${name}`);
        skipCount++;
        continue;
      }

      // 更新所有同名助手
      for (const assistant of assistants) {
        // 解析现有工具
        let existingTools = [];
        try {
          existingTools = JSON.parse(assistant.defaultTools || '[]');
        } catch (e) {
          existingTools = [];
        }

        // 合并新工具（去重）
        const newTools = [...new Set([...existingTools, ...config.addTools])];

        // 准备更新数据
        const updateData = {
          defaultTools: JSON.stringify(newTools),
        };

        // 如果有完整的 systemPrompt，使用它；否则追加提示
        if (config.systemPrompt) {
          updateData.systemPrompt = config.systemPrompt;
        } else if (config.promptAddition && assistant.systemPrompt) {
          // 避免重复追加
          if (!assistant.systemPrompt.includes('文档生成工具')) {
            updateData.systemPrompt = assistant.systemPrompt + config.promptAddition;
          }
        }

        // 更新助手
        await prisma.assistant_templates.update({
          where: { id: assistant.id },
          data: updateData,
        });

        const employeeInfo = assistant.employeeName ? ` (${assistant.employeeName})` : '';
        console.log(`✅ ${name}${employeeInfo}`);
        console.log(`   🔧 新增工具: ${config.addTools.join(', ')}`);
        console.log(`   📦 全部工具: ${newTools.join(', ')}`);
        successCount++;
      }
    }

    console.log(`\n🎉 更新完成！成功: ${successCount}, 跳过: ${skipCount}`);

  } catch (error) {
    console.error('❌ 更新失败:', error.message);
    console.error(error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

main();

