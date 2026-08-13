/**
 * PPT Outline Flow Plugin (Flow A)
 *
 * Phase P0: 大纲生成 Flow
 *
 * 功能：
 * - 需求澄清（可选）
 * - RAG 检索相关文档
 * - 生成 Outline DSL 子集
 * - 输出供用户确认/修改的大纲
 */

const { Deduplicator } = require("../utils/dedupe");
const {
  THEMES,
  DSL_CONSTRAINTS,
  validateWithRetry,
  ValidationResult,
} = require("./ppt-dsl");

/**
 * 大纲生成 Prompt 模板
 */
const OUTLINE_PROMPT_TEMPLATE = `你是一个专业的 PPT 大纲规划专家。请根据用户需求生成演示文稿大纲。

## 用户需求
{{userQuery}}

## 约束条件
- 主题：{{theme}}
- 最大页数：{{maxSlides}} 页
- 目标受众：{{audience}}
- 语气风格：{{tone}}

{{#if ragContext}}
## 参考资料
{{ragContext}}
{{/if}}

## 输出要求
请直接输出 JSON 格式的大纲，不要包含任何解释文字。

JSON 格式要求：
\`\`\`json
{
  "version": "1.0",
  "meta": {
    "title": "演示文稿标题",
    "theme": "{{theme}}",
    "language": "zh-CN",
    "audience": "{{audience}}",
    "tone": "{{tone}}",
    "constraints": {
      "maxSlides": {{maxSlides}},
      "maxBulletsPerSlide": 5
    }
  },
  "outline": [
    {
      "id": "s1",
      "type": "title",
      "title": "主标题",
      "purpose": "开场，吸引注意力"
    },
    {
      "id": "s2",
      "type": "section",
      "title": "第一部分",
      "purpose": "引入主题"
    },
    {
      "id": "s3",
      "type": "bullets",
      "title": "要点页标题",
      "purpose": "列举关键信息",
      "keyPoints": ["要点1", "要点2", "要点3"]
    }
  ]
}
\`\`\`

幻灯片类型说明：
- title: 标题页（用于开头、结尾）
- section: 章节分隔页（用于引入新的部分）
- bullets: 要点列表页（用于列举信息）
- text: 文本页（用于详细说明）

请确保：
1. 大纲逻辑清晰，结构完整
2. 每页都有明确的 purpose（目的）
3. 页数不超过 {{maxSlides}} 页
4. 内容与参考资料（如有）保持一致

请直接输出 JSON：`;

/**
 * PPT 大纲生成插件
 */
const pptOutlineFlow = {
  name: "ppt-outline-flow",
  startupConfig: {
    params: {},
  },
  plugin: function () {
    return {
      name: this.name,
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          tracker: new Deduplicator(),
          name: this.name,
          description: `【PPT/演示文稿 生成入口 - 优先级最高】生成 PPT/PPTX 演示文稿。

⚠️ 重要：当用户提到以下任何关键词时，必须使用此工具（不是 generate-official-document）：
- PPT、ppt、PPTX、PowerPoint、幻灯片、演示文稿
- 汇报材料、演示材料、报告幻灯片
- slides、presentation、slideshow

工作流程：
1. 调用此工具 → 生成大纲供用户确认
2. 用户确认后 → 系统自动生成完整 PPT 文件 (.pptx)

支持功能：
- 4 种主题配色：default_blue, default_dark, default_light, corporate
- 多种布局模板：标题页、章节页、要点页、文本页、图表、表格
- RAG 检索参考资料自动注入
- 引用来源追溯

触发场景（必须使用 ppt-outline-flow 工具）：
- "帮我做一个 PPT"、"生成演示文稿"、"制作汇报材料/幻灯片"
- "做个 XX 主题的 PPT"、"准备一份 XX 演示"
- 任何需要生成 .pptx / PowerPoint 文件的请求

⚠️ 注意区分：
- PPT/演示文稿 → 使用 ppt-outline-flow（本工具）
- Word/公文/文档 → 使用 generate-official-document`,
          examples: [
            {
              prompt: "帮我生成一个关于 Q4 工作汇报的 PPT",
              call: JSON.stringify({
                query:
                  "Q4 工作汇报 PPT，包含业绩回顾、主要成果、问题与挑战、下季度计划",
                theme: "default_blue",
                maxSlides: 10,
                audience: "公司管理层",
                tone: "专业正式",
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              query: {
                type: "string",
                description: "用户的 PPT 需求描述",
              },
              theme: {
                type: "string",
                enum: THEMES,
                default: "default_blue",
                description: "主题配色",
              },
              maxSlides: {
                type: "integer",
                minimum: DSL_CONSTRAINTS.minSlides,
                maximum: DSL_CONSTRAINTS.maxSlides,
                default: 12,
                description: "最大页数",
              },
              audience: {
                type: "string",
                default: "通用受众",
                description: "目标受众",
              },
              tone: {
                type: "string",
                default: "专业清晰",
                description: "语气风格",
              },
              ragContext: {
                type: "string",
                description: "RAG 检索的参考资料（可选）",
              },
            },
            required: ["query"],
          },
          handler: async function (args) {
            try {
              const {
                query,
                theme = "default_blue",
                maxSlides = 12,
                audience = "通用受众",
                tone = "专业清晰",
                ragContext = "",
              } = args;

              // 检查重复调用
              const cacheKey = `${query}-${theme}-${maxSlides}`;
              if (this.tracker.isDuplicate(this.name, { cacheKey })) {
                return "大纲已生成，请查看上方的大纲内容。如需修改，请直接说明修改要求。";
              }

              this.super.introspect("正在分析需求并生成 PPT 大纲...");

              // 获取 LLM Provider 实例
              const provider = this.super.getProviderForConfig(
                this.super.defaultProvider
              );

              // 构建 Prompt
              const prompt = OUTLINE_PROMPT_TEMPLATE.replace(
                /\{\{userQuery\}\}/g,
                query
              )
                .replace(/\{\{theme\}\}/g, theme)
                .replace(/\{\{maxSlides\}\}/g, String(maxSlides))
                .replace(/\{\{audience\}\}/g, audience)
                .replace(/\{\{tone\}\}/g, tone)
                .replace(
                  /\{\{#if ragContext\}\}([\s\S]*?)\{\{\/if\}\}/g,
                  ragContext
                    ? `$1`.replace(/\{\{ragContext\}\}/g, ragContext)
                    : ""
                );

              // 调用 LLM 生成大纲
              const llmResponse = await provider.complete([
                { role: "user", content: prompt },
              ]);

              if (!llmResponse || !llmResponse.textResponse) {
                return "生成大纲时出错：LLM 返回为空";
              }

              // 校验大纲 DSL
              const validationResult = await validateWithRetry(
                llmResponse.textResponse,
                {
                  type: "outline",
                  maxRetries: 2,
                  fixCallback: async (fixPrompt) => {
                    const fixResponse = await provider.complete([
                      { role: "user", content: fixPrompt },
                    ]);
                    return fixResponse?.textResponse;
                  },
                }
              );

              if (
                validationResult.result === ValidationResult.JSON_ERROR ||
                !validationResult.data
              ) {
                this.super.handlerProps.log(
                  `[ppt-outline-flow] Validation failed: ${JSON.stringify(validationResult.errors)}`
                );
                return `生成大纲时出错：${validationResult.errors?.join(", ") || "JSON 解析失败"}`;
              }

              const outline = validationResult.data;

              // 发送大纲到前端（用于 HITL 确认）
              this.super.socket?.send("pptOutline", {
                outline,
                status: "pending_confirmation",
                timestamp: Date.now(),
              });

              this.tracker.trackRun(this.name, { cacheKey });

              // 格式化输出供用户查看
              const formattedOutline = formatOutlineForDisplay(outline);

              // 设置 skipHandleExecution，停止当前轮次等待用户确认
              // 用户确认后，LLM 会识别出需要调用 ppt-generate-flow
              this.super.skipHandleExecution = true;

              // 将大纲存储到数据库缓存，用短 ID 引用
              const { CacheData } = require("../../../../models/cacheData");
              const outlineId = `ppt-outline-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

              await CacheData.new({
                name: outlineId,
                data: JSON.stringify(outline),
                belongsTo: "ppt-outline",
                byId: this.super.handlerProps?.workspaceId || 0,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 小时过期
              });

              this.super.handlerProps?.log?.(
                `[ppt-outline-flow] Outline saved to cache: ${outlineId}`
              );

              return `📋 **PPT 大纲已生成**

${formattedOutline}

---

请确认大纲是否满足您的需求：
- 回复 **"确认"** 或 **"开始生成"** 进入内容填充阶段
- 回复具体修改意见（如"把第 3 页改成表格"、"增加一页关于竞品分析"）

💡 提示：确认后将根据大纲生成完整的 PPT 内容。

<!-- PPT_OUTLINE_ID:${outlineId} -->`;
            } catch (error) {
              this.super.handlerProps.log(
                `[ppt-outline-flow] Error: ${error.message}`
              );
              return `生成 PPT 大纲时出错：${error.message}`;
            }
          },
        });
      },
    };
  },
};

/**
 * 格式化大纲用于展示
 * @param {Object} outline - 大纲 DSL
 * @returns {string}
 */
function formatOutlineForDisplay(outline) {
  const { meta, outline: slides } = outline;

  let output = `**标题**：${meta.title}\n`;
  output += `**主题**：${meta.theme || "default_blue"}\n`;
  output += `**页数**：${slides.length} 页\n\n`;

  output += `**大纲结构**：\n\n`;

  slides.forEach((slide, index) => {
    const typeIcon = getSlideTypeIcon(slide.type);
    output += `${index + 1}. ${typeIcon} **${slide.title}**`;

    if (slide.purpose) {
      output += `\n   _${slide.purpose}_`;
    }

    if (slide.keyPoints && slide.keyPoints.length > 0) {
      output += `\n   关键点：${slide.keyPoints.join("、")}`;
    }

    output += "\n\n";
  });

  return output;
}

/**
 * 获取幻灯片类型图标
 * @param {string} type - 幻灯片类型
 * @returns {string}
 */
function getSlideTypeIcon(type) {
  const icons = {
    title: "🎯",
    section: "📌",
    bullets: "📝",
    text: "📄",
    chart: "📊",
    table: "📋",
  };
  return icons[type] || "📄";
}

module.exports = { pptOutlineFlow };
