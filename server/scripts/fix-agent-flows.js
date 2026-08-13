/**
 * 修复 Agent Flow 文件，转换为前端兼容格式
 */
const fs = require('fs');
const path = require('path');

const flowsDir = path.join(__dirname, '../storage/plugins/agent-flows');

const flows = {
  // 市场调研助手流程（支持可选的 URL 网页抓取）
  '69305183-24af-4841-bc05-e05b18c27451': {
    name: '市场调研助手流程',
    description: '多角色协作完成市场调研：可选网页抓取 → 研究员分析 → 撰写员整理 → 审核员优化',
    active: true,
    steps: [
      { type: 'start', config: { variables: [
        { name: 'topic', value: '' },
        { name: 'source_url', value: '' },
        { name: 'research_data', value: '' },
        { name: 'draft_report', value: '' }
      ]}},
      { type: 'webScraping', config: { url: '{{source_url}}', captureAs: 'text', querySelector: '', resultVariable: 'web_content', directOutput: false }},
      { type: 'llmInstruction', config: { instruction: '你是一位专业的市场研究员。请根据你的专业知识，为主题「{{topic}}」进行市场分析。\n\n参考资料（如有）：\n{{web_content}}\n\n请提供：\n1. 市场概况和规模估算\n2. 主要竞争对手分析\n3. 行业趋势和动态\n4. 关键成功因素\n5. 潜在风险和机会\n\n以结构化的格式输出研究数据。', resultVariable: 'research_data', directOutput: false }},
      { type: 'llmInstruction', config: { instruction: '你是一位专业的商业撰稿人。请根据以下研究数据，撰写一份结构化的市场调研报告：\n\n研究数据：\n{{research_data}}\n\n报告应包含：\n1. 执行摘要（200字以内）\n2. 市场概述\n3. 竞争格局分析\n4. 趋势与机会\n5. 风险与挑战\n6. 结论与建议\n\n请用专业、简洁的语言撰写。', resultVariable: 'draft_report', directOutput: false }},
      { type: 'llmInstruction', config: { instruction: '你是一位资深的商业报告审核员。请审核以下市场调研报告，并进行优化：\n\n原始报告：\n{{draft_report}}\n\n参考数据：\n{{research_data}}\n\n请：\n1. 检查逻辑一致性\n2. 优化语言表达\n3. 确保结构清晰\n4. 补充遗漏的关键点\n5. 提供最终版本的报告\n\n输出优化后的完整报告。', resultVariable: 'final_report', directOutput: true }},
      { type: 'finish', config: {} }
    ]
  },

  // 数据挖掘分析流程（支持可选的 URL 数据源）
  '76fbe795-d716-4adb-8b64-5125d8819764': {
    name: '数据挖掘分析流程',
    description: '数据挖掘分析工作流程：可选网页数据 → 数据收集 → 验证 → 分析 → 异常检测 → 报告生成',
    active: true,
    steps: [
      { type: 'start', config: { variables: [
        { name: 'analysis_topic', value: '' },
        { name: 'data_source_url', value: '' },
        { name: 'collected_data', value: '' },
        { name: 'validated_data', value: '' },
        { name: 'analysis_results', value: '' },
        { name: 'anomalies', value: '' }
      ]}},
      { type: 'webScraping', config: { url: '{{data_source_url}}', captureAs: 'text', querySelector: '', resultVariable: 'web_data', directOutput: false }},
      { type: 'llmInstruction', config: { instruction: '你是数据收集专家。请根据主题「{{analysis_topic}}」收集和整理数据。\n\n数据源内容（如有）：\n{{web_data}}\n\n请：\n1. 提取关键数据点和统计数字\n2. 整理数据来源和可信度\n3. 标记需要进一步验证的数据\n4. 以结构化格式输出收集的数据\n\n确保数据来源可靠、覆盖全面。', resultVariable: 'collected_data', directOutput: false }},
      { type: 'llmInstruction', config: { instruction: '你是数据质量专家。请验证以下收集的数据：\n\n原始数据：\n{{collected_data}}\n\n请执行：\n1. 检查数据完整性（是否有缺失值）\n2. 识别异常值和离群点\n3. 验证数据类型和格式一致性\n4. 标记可疑数据并说明原因\n5. 输出经过验证的数据集\n\n对可疑数据保持警惕。', resultVariable: 'validated_data', directOutput: false }},
      { type: 'llmInstruction', config: { instruction: '你是统计分析专家。请对验证后的数据进行深度分析：\n\n验证数据：\n{{validated_data}}\n\n分析主题：{{analysis_topic}}\n\n请执行：\n1. 描述性统计（均值、中位数、标准差等）\n2. 趋势分析和模式识别\n3. 相关性分析\n4. 使用「5个为什么」方法追问数据背后的原因\n5. 总结关键发现\n\n保持批判性思维。', resultVariable: 'analysis_results', directOutput: false }},
      { type: 'llmInstruction', config: { instruction: '你是异常检测专家。请识别数据中的异常模式：\n\n分析结果：\n{{analysis_results}}\n\n验证数据：\n{{validated_data}}\n\n请：\n1. 识别统计异常值\n2. 发现异常模式和趋势\n3. 评估每个异常的风险等级（低/中/高）\n4. 提供可能的解释和原因\n5. 给出应对建议\n\n对反常数据保持高度敏感。', resultVariable: 'anomalies', directOutput: false }},
      { type: 'llmInstruction', config: { instruction: '你是数据分析报告专家。请整合所有分析结果，生成完整的数据分析报告：\n\n分析主题：{{analysis_topic}}\n收集数据：{{collected_data}}\n分析结果：{{analysis_results}}\n异常检测：{{anomalies}}\n\n报告应包含：\n1. **执行摘要**（200字以内）\n2. **数据概览**\n3. **关键发现**\n4. **异常分析**\n5. **风险评估**\n6. **建议措施**\n\n语言直言不讳但建设性。', resultVariable: 'final_report', directOutput: true }},
      { type: 'finish', config: {} }
    ]
  },

  // 长文写作助手流程
  '7c53971f-1e8f-42e6-b49f-6ae3783c007a': {
    name: '长文写作助手流程',
    description: '多 Agent 协作完成长文写作任务：大纲师规划结构 → 撰写员创作内容 → 编辑员润色优化',
    active: true,
    steps: [
      { type: 'start', config: { variables: [
        { name: 'writing_topic', value: '' },
        { name: 'outline', value: '' },
        { name: 'draft_content', value: '' }
      ]}},
      { type: 'llmInstruction', config: { instruction: '你是一位专业的文章大纲师。请为以下主题规划文章结构：\n\n写作主题：{{writing_topic}}\n\n请完成：\n1. 分析主题的核心观点和论述方向\n2. 确定目标读者群体\n3. 设计文章整体结构（引言、正文章节、结论）\n4. 为每个章节列出要点和关键论据\n5. 估算各部分的篇幅占比\n\n输出一份清晰、有层次的文章大纲。', resultVariable: 'outline', directOutput: false }},
      { type: 'llmInstruction', config: { instruction: '你是一位专业的内容撰写员。请根据以下大纲创作完整内容：\n\n写作主题：{{writing_topic}}\n\n文章大纲：\n{{outline}}\n\n请：\n1. 按照大纲结构展开详细论述\n2. 丰富每个章节的细节和例证\n3. 确保论点有力、论据充分\n4. 使用流畅的过渡连接各部分\n5. 保持语言风格一致\n\n创作一篇内容丰富、逻辑清晰的长文。', resultVariable: 'draft_content', directOutput: false }},
      { type: 'llmInstruction', config: { instruction: '你是一位资深的文字编辑员。请对以下文稿进行润色优化：\n\n文章大纲（参考）：\n{{outline}}\n\n原始文稿：\n{{draft_content}}\n\n请执行：\n1. 优化语言表达，提升文字美感\n2. 检查并修正语法错误\n3. 确保逻辑连贯、结构清晰\n4. 增强文章的可读性和吸引力\n5. 校对标点符号和格式\n\n输出润色后的完整文章。', resultVariable: 'final_content', directOutput: true }},
      { type: 'finish', config: {} }
    ]
  },

  // 项目管理流程
  'ccff3c1d-957d-4d48-a26c-eb4dc3112fb4': {
    name: '项目管理流程',
    description: '程远帆（Ethan）的项目管理工作流程，包含需求分析、风险识别、计划制定、对比评估和建议输出五个阶段',
    active: true,
    steps: [
      { type: 'start', config: { variables: [
        { name: 'project_desc', value: '' },
        { name: 'requirements', value: '' },
        { name: 'risks', value: '' },
        { name: 'project_plan', value: '' },
        { name: 'comparison_results', value: '' }
      ]}},
      { type: 'llmInstruction', config: { instruction: '你是需求分析专家（程远帆 Ethan 团队）。请分析以下项目：\n\n项目描述：{{project_desc}}\n\n请完成：\n1. 提取核心需求和目标\n2. 识别约束条件（时间、预算、资源）\n3. 定义成功标准和验收条件\n4. 分析利益相关者及其期望\n5. 标记需要澄清的模糊需求\n\n追问到底，确保需求清晰、可衡量。', resultVariable: 'requirements', directOutput: false }},
      { type: 'llmInstruction', config: { instruction: '你是风险管理专家。请识别以下项目的潜在风险：\n\n项目需求：\n{{requirements}}\n\n请从以下维度全面识别风险：\n1. **技术风险**：技术可行性、技术债务\n2. **资源风险**：人员、预算、设备\n3. **时间风险**：进度延误、依赖关系\n4. **团队风险**：能力、沟通、流失\n5. **外部风险**：市场、政策、供应商\n\n对每个风险评估影响程度（高/中/低）和发生概率。', resultVariable: 'risks', directOutput: false }},
      { type: 'llmInstruction', config: { instruction: '你是项目规划专家。请制定详细的项目计划：\n\n项目需求：\n{{requirements}}\n\n识别的风险：\n{{risks}}\n\n请设计：\n1. 项目阶段划分和里程碑\n2. 各阶段的交付物和验收标准\n3. 资源分配方案\n4. 时间估算和进度计划\n5. 风险应对措施\n6. 沟通和报告机制\n\n计划要务实、可执行，留有缓冲空间。', resultVariable: 'project_plan', directOutput: false }},
      { type: 'llmInstruction', config: { instruction: '你是对比分析专家。请评估项目计划的可行性：\n\n项目计划：\n{{project_plan}}\n\n需求与风险：\n{{requirements}}\n{{risks}}\n\n请进行：\n1. 与行业最佳实践的对比\n2. 资源配置合理性评估\n3. 时间计划可行性验证\n4. 识别潜在瓶颈和问题\n5. 给出可行性评分（1-10分）\n6. 提出调整建议\n\n既要务实，也要有前瞻性。', resultVariable: 'comparison_results', directOutput: false }},
      { type: 'llmInstruction', config: { instruction: '你是项目管理顾问（程远帆 Ethan）。请整合所有分析，输出完整的项目管理方案：\n\n项目描述：{{project_desc}}\n需求分析：{{requirements}}\n风险识别：{{risks}}\n项目计划：{{project_plan}}\n可行性评估：{{comparison_results}}\n\n报告应包含：\n1. **项目概览**\n2. **需求摘要**\n3. **风险分析与应对**\n4. **项目计划与里程碑**\n5. **资源配置**\n6. **可行性评估**\n7. **管理建议**\n\n语言务实、稳定、灵活，给团队信心。', resultVariable: 'final_plan', directOutput: true }},
      { type: 'finish', config: {} }
    ]
  },

  // 项目审核流程
  'fdf32867-93f5-4253-99ed-353dfe8f9e7d': {
    name: '项目审核流程',
    description: '沈清禾（Clara）的项目审核工作流程，包含文档审核、可行性分析、风险评估、战略评估和审核意见五个阶段',
    active: true,
    steps: [
      { type: 'start', config: { variables: [
        { name: 'project_materials', value: '' },
        { name: 'document_summary', value: '' },
        { name: 'feasibility_assessment', value: '' },
        { name: 'risk_assessment', value: '' },
        { name: 'strategic_evaluation', value: '' }
      ]}},
      { type: 'llmInstruction', config: { instruction: '你是文档审核专家（沈清禾 Clara 团队）。请审核以下项目材料：\n\n项目材料：{{project_materials}}\n\n请检查：\n1. 材料完整性（是否缺少必要文档）\n2. 逻辑一致性（各部分是否自洽）\n3. 证据充分性（数据和依据是否可靠）\n4. 表述清晰度（是否易于理解）\n5. 标记需要补充或澄清的部分\n\n对细节保持敏锐洞察。', resultVariable: 'document_summary', directOutput: false }},
      { type: 'llmInstruction', config: { instruction: '你是可行性分析专家。请从多维度评估项目可行性：\n\n文档审核结果：\n{{document_summary}}\n\n请评估：\n1. **战略可行性**：是否符合战略方向\n2. **财务可行性**：预算、ROI、资金来源\n3. **技术可行性**：技术成熟度、实现难度\n4. **团队可行性**：能力匹配、资源充足度\n5. **市场可行性**：市场需求、竞争态势\n\n输出各维度评分（1-10分）和综合评价。', resultVariable: 'feasibility_assessment', directOutput: false }},
      { type: 'llmInstruction', config: { instruction: '你是风险评估专家。请全面评估项目风险：\n\n可行性分析：\n{{feasibility_assessment}}\n\n文档摘要：\n{{document_summary}}\n\n请评估以下风险类型：\n1. **执行风险**：实施过程中的障碍\n2. **财务风险**：成本超支、资金链\n3. **市场风险**：需求变化、竞争\n4. **团队风险**：人员流失、能力不足\n5. **合规风险**：法规、政策\n\n为每个风险评估影响程度和发生概率，输出风险矩阵。', resultVariable: 'risk_assessment', directOutput: false }},
      { type: 'llmInstruction', config: { instruction: '你是战略评估专家。请评估项目的长期价值：\n\n风险评估：\n{{risk_assessment}}\n\n可行性分析：\n{{feasibility_assessment}}\n\n请评估：\n1. **战略契合度**：与组织战略的一致性\n2. **创新性**：技术或商业模式创新程度\n3. **可持续性**：长期发展潜力\n4. **社会影响**：社会价值和影响力\n5. **行业引领性**：能否建立竞争优势\n\n跳出单个项目看行业生态和长期影响。', resultVariable: 'strategic_evaluation', directOutput: false }},
      { type: 'llmInstruction', config: { instruction: '你是项目审核顾问（沈清禾 Clara）。请整合所有评估结果，输出完整的审核报告：\n\n项目材料摘要：{{document_summary}}\n可行性分析：{{feasibility_assessment}}\n风险评估：{{risk_assessment}}\n战略评估：{{strategic_evaluation}}\n\n报告应包含：\n1. **审核概要**\n2. **文档完整性评价**\n3. **可行性分析结论**\n4. **风险评估总结**\n5. **战略价值评估**\n6. **综合评分**（1-100分）\n7. **审核结论**（通过/有条件通过/不通过）\n8. **改进建议**\n\n语言温和但坚定，审核不是为了否定，而是为了帮助项目成长。', resultVariable: 'final_report', directOutput: true }},
      { type: 'finish', config: {} }
    ]
  }
};

// 写入所有 flow 文件
for (const [uuid, flowData] of Object.entries(flows)) {
  const filePath = path.join(flowsDir, `${uuid}.json`);
  fs.writeFileSync(filePath, JSON.stringify(flowData, null, 2), 'utf8');
  console.log(`✅ 已更新: ${flowData.name} (${uuid})`);
}

console.log('\n所有 Agent Flow 文件已更新完成！');

