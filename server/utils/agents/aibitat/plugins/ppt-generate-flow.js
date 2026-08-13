/**
 * PPT Generate Flow Plugin (Flow B)
 *
 * Phase P0: PPT 内容生成 Flow
 *
 * 功能：
 * - 基于确认的大纲生成完整 PPT DSL
 * - RAG 检索填充内容
 * - 整理引用来源（sources）
 * - 输出 Final DSL 供二次确认
 * - 确认后调用 pptx-generator 渲染
 */

const { Deduplicator } = require("../utils/dedupe");
const {
  THEMES,
  LAYOUT_TYPES,
  DSL_CONSTRAINTS,
  validateWithRetry,
  validateBeforeRender,
  ValidationResult,
} = require("./ppt-dsl");

/**
 * 内容生成 Prompt 模板
 */
const GENERATE_PROMPT_TEMPLATE = `你是一个专业的 PPT 内容撰写专家。请根据已确认的大纲，生成完整的 PPT 内容。

## 大纲
{{outline}}

{{#if ragContext}}
## 参考资料
{{ragContext}}
{{/if}}

## 输出要求
请直接输出 JSON 格式的完整 PPT DSL，不要包含任何解释文字。

JSON 格式要求：
\`\`\`json
{
  "version": "1.0",
  "meta": {
    "title": "演示文稿标题",
    "theme": "{{theme}}",
    "language": "zh-CN"
  },
  "slides": [
    {
      "id": "s1",
      "type": "title",
      "layout": "title_center",
      "title": "主标题",
      "subtitle": "副标题或日期",
      "notes": "演讲者备注",
      "sources": []
    },
    {
      "id": "s2",
      "type": "bullets",
      "layout": "bullets_left",
      "title": "要点页标题",
      "bullets": ["要点1：具体内容", "要点2：具体内容"],
      "notes": "口播补充说明",
      "sources": [
        { "id": "S1", "title": "来源标题", "excerpt": "相关引用摘录" }
      ]
    }
  ],
  "appendix": {
    "sources": [
      { "id": "S1", "title": "来源标题", "url": "", "excerpt": "完整引用" }
    ]
  }
}
\`\`\`

幻灯片类型与布局：
- title: title_center（居中）、title_left（左对齐）
- section: section_center（居中）、section_left（左对齐）
- bullets: bullets_left（左对齐）、bullets_two_column（两列）
- text: text_left（左对齐）、text_center（居中）、text_two_column（两列）

内容要求：
1. 每页内容简洁清晰，bullets 不超过 5 条
2. 每条 bullet 控制在 20 字以内
3. 数据和事实需标注 sources 来源
4. notes 用于演讲者口播补充
5. 保持与大纲一致的结构和主题

请直接输出 JSON：`;

/**
 * PPT 内容生成插件
 */
const pptGenerateFlow = {
  name: "ppt-generate-flow",
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
          /**
           * 从对话历史中提取 PPT 大纲 ID，然后从缓存加载
           * @returns {Promise<Object|null>} 大纲对象或 null
           */
          extractOutlineFromHistory: async function () {
            try {
              const { CacheData } = require("../../../../models/cacheData");

              // 获取对话历史（AIbitat 维护的是 chats，不是 messages）
              const chats = this.super.chats || [];

              // 从后往前查找包含 PPT_OUTLINE_ID 标记的消息
              for (let i = chats.length - 1; i >= 0; i--) {
                const content = String(chats[i]?.content || "");
                const match = content.match(
                  /<!-- PPT_OUTLINE_ID:(ppt-outline-[a-z0-9-]+) -->/
                );
                if (match && match[1]) {
                  const outlineId = match[1];
                  // 从缓存加载大纲
                  const cached = await CacheData.get({ name: outlineId });
                  if (cached && cached.data) {
                    this.super.handlerProps?.log?.(
                      `[ppt-generate-flow] Loaded outline from cache: ${outlineId}`
                    );
                    return JSON.parse(cached.data);
                  }
                }
              }
              return null;
            } catch (error) {
              this.super.handlerProps?.log?.(
                `[ppt-generate-flow] Failed to extract outline: ${error.message}`
              );
              return null;
            }
          },
          /**
           * autoGenerate=true 时直接渲染并下载 PPTX
           * @param {Object} dsl - 完整 PPT DSL
           * @param {string} [filename] - 可选文件名（含/不含 .pptx 均可）
           * @returns {Promise<string>}
           */
          triggerGeneration: async function (dsl, filename = null) {
            if (!dsl || !dsl.slides || dsl.slides.length === 0) {
              this.super.skipHandleExecution = true;
              return "请先生成 PPT 内容。";
            }

            // 文件名处理
            const rawFilename = filename
              ? filename
              : `${dsl.meta?.title || "演示文稿"}.pptx`;
            const finalFilename = rawFilename
              .replace(/[\\/:*?"<>|]/g, "_")
              .replace(/\s+/g, " ")
              .trim()
              .endsWith(".pptx")
              ? rawFilename
                  .replace(/[\\/:*?"<>|]/g, "_")
                  .replace(/\s+/g, " ")
                  .trim()
              : `${rawFilename
                  .replace(/[\\/:*?"<>|]/g, "_")
                  .replace(/\s+/g, " ")
                  .trim()}.pptx`;

            this.super.introspect(`正在生成 PPT 文件：${finalFilename}...`);

            const slides = convertDSLToGeneratorFormat(dsl.slides);
            const { generatePptx } = require("./pptx-generator");
            const buffer = await generatePptx({
              slides,
              theme: dsl.meta?.theme || "default_blue",
              title: dsl.meta?.title,
              appendix: dsl.appendix,
              includeAppendix: true,
            });
            const base64 = buffer.toString("base64");

            if (!this.super.socket) {
              this.super.skipHandleExecution = true;
              return `✅ **PPT 已生成**\n\n文件《${finalFilename}》已生成，但当前会话无法触发下载，请刷新页面后重试。`;
            }

            this.super.socket.send("fileDownload", {
              filename: finalFilename,
              b64Content: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${base64}`,
            });

            // 通知前端生成完成（用于 UI 状态更新）
            this.super.socket.send("pptGenerated", {
              filename: finalFilename,
              dsl,
              timestamp: Date.now(),
            });

            this.super.introspect(`PPT ${finalFilename} 已生成，正在下载...`);

            // 设置 directOutput，终止循环
            this.super.skipHandleExecution = true;
            return `✅ **PPT 已生成**\n\n文件《${finalFilename}》已成功生成并下载到您的浏览器。\n\n如需修改内容，请告诉我需要调整的页或要点。`;
          },
          description: `【PPT 第二阶段 - 用户确认后调用】基于已确认的大纲生成完整 PPT 文件。

⚠️ **重要**：当用户对 ppt-outline-flow 生成的大纲说以下任何话时，必须调用此工具：
- "确认"、"可以"、"好的"、"没问题"、"就这样"
- "开始生成"、"生成PPT"、"继续"
- "按这个生成"、"确认大纲"

**不要**再次调用 ppt-outline-flow！用户已经确认了大纲，下一步是生成内容！

✅ **调用方式**：直接调用此工具，无需传参数！大纲会自动从上下文获取。
示例：ppt-generate-flow({})

工作流程：大纲确认 → 调用此工具（无需参数）→ 自动生成完整 PPT 文件`,
          examples: [
            {
              prompt: "确认大纲，开始生成 PPT",
              call: JSON.stringify({
                outline: {
                  version: "1.0",
                  meta: { title: "Q4 工作汇报", theme: "default_blue" },
                  outline: [
                    { id: "s1", type: "title", title: "Q4 工作汇报" },
                    { id: "s2", type: "bullets", title: "主要成果" },
                  ],
                },
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              outline: {
                type: "object",
                description:
                  "已确认的大纲 DSL（可选，如未传入则自动从上下文获取）",
              },
              ragContext: {
                type: "string",
                description: "RAG 检索的参考资料（可选）",
              },
              autoGenerate: {
                type: "boolean",
                default: true,
                description: "是否直接生成 PPTX（默认 true）",
              },
            },
            required: [], // outline 不再是必须的，会自动从 blackboard 获取
          },
          handler: async function (args) {
            try {
              let { outline, ragContext = "", autoGenerate = true } = args;

              // 如果没有传入 outline，从对话历史中提取
              if (!outline) {
                outline = await this.extractOutlineFromHistory();
                if (outline) {
                  this.super.handlerProps?.log?.(
                    "[ppt-generate-flow] Extracted outline from chat history"
                  );
                }
              }

              // 验证大纲
              if (
                !outline ||
                !outline.outline ||
                outline.outline.length === 0
              ) {
                return "请先生成并确认 PPT 大纲。可以说「帮我生成一个 XXX 的 PPT」来开始。";
              }

              const cacheKey = JSON.stringify(outline.meta);
              if (this.tracker.isDuplicate(this.name, { cacheKey })) {
                return "PPT 内容已生成，请查看上方内容。如需重新生成，请先修改大纲。";
              }

              this.super.introspect("正在根据大纲生成 PPT 内容...");

              // 获取 LLM Provider 实例
              const provider = this.super.getProviderForConfig(
                this.super.defaultProvider
              );

              // 构建 Prompt
              const prompt = GENERATE_PROMPT_TEMPLATE.replace(
                /\{\{outline\}\}/g,
                JSON.stringify(outline, null, 2)
              )
                .replace(
                  /\{\{theme\}\}/g,
                  outline.meta?.theme || "default_blue"
                )
                .replace(
                  /\{\{#if ragContext\}\}([\s\S]*?)\{\{\/if\}\}/g,
                  ragContext
                    ? `$1`.replace(/\{\{ragContext\}\}/g, ragContext)
                    : ""
                );

              // 调用 LLM 生成完整内容
              const llmResponse = await provider.complete([
                { role: "user", content: prompt },
              ]);

              if (!llmResponse || !llmResponse.textResponse) {
                return "生成 PPT 内容时出错：LLM 返回为空";
              }

              // 校验完整 DSL
              const validationResult = await validateWithRetry(
                llmResponse.textResponse,
                {
                  type: "full",
                  maxRetries: 2,
                  fixCallback: async (fixPrompt) => {
                    const fixResponse = await provider.complete([
                      { role: "user", content: fixPrompt },
                    ]);
                    return fixResponse?.textResponse;
                  },
                }
              );

              let finalDSL;
              let isDegraded = false;

              if (validationResult.result === ValidationResult.SUCCESS) {
                finalDSL = validationResult.data;
              } else if (
                validationResult.result === ValidationResult.DEGRADED
              ) {
                // 降级处理
                finalDSL = {
                  version: "1.0",
                  meta: outline.meta || { title: "演示文稿" },
                  slides: validationResult.data,
                };
                isDegraded = true;
                this.super.introspect("⚠️ 部分内容格式不规范，已自动降级处理");
              } else {
                return `生成 PPT 内容时出错：${validationResult.errors?.join(", ") || "校验失败"}`;
              }

              // 渲染前校验
              const renderValidation = validateBeforeRender(finalDSL.slides);
              if (!renderValidation.valid) {
                return `PPT 内容校验失败：${renderValidation.warnings.join(", ")}`;
              }

              if (renderValidation.warnings.length > 0) {
                this.super.introspect(
                  `⚠️ 注意：${renderValidation.warnings.join("; ")}`
                );
              }

              finalDSL.slides = renderValidation.slides;

              // 发送到前端（用于 HITL 确认）
              if (this.super.socket) {
                this.super.socket.send("pptContent", {
                  dsl: finalDSL,
                  status: autoGenerate ? "generating" : "pending_confirmation",
                  isDegraded,
                  timestamp: Date.now(),
                });
              }

              this.tracker.trackRun(this.name, { cacheKey });

              // 如果设置了自动生成，直接调用生成器
              if (autoGenerate) {
                return await this.triggerGeneration(finalDSL);
              }

              // 格式化输出供用户查看
              const formattedContent = formatContentForDisplay(finalDSL);
              const sourceSummary = formatSourcesSummary(finalDSL);

              // 设置 skipHandleExecution，停止当前轮次等待用户确认
              // 用户确认后，LLM 会识别出需要调用 ppt-confirm-generate
              this.super.skipHandleExecution = true;

              return `📑 **PPT 内容已生成**

${formattedContent}

${sourceSummary ? `📚 **引用来源**\n${sourceSummary}\n` : ""}
${isDegraded ? "⚠️ _注意：部分内容格式已自动调整_\n" : ""}
---

请确认内容是否满足您的需求：
- 回复 **"确认生成"** 或 **"生成 PPT"** 开始生成 PPTX 文件
- 回复具体修改意见（如"第 3 页的数据改成 XXX"）

💡 确认后将生成 PPTX 文件并自动下载。`;
            } catch (error) {
              this.super.handlerProps.log(
                `[ppt-generate-flow] Error: ${error.message}`
              );
              return `生成 PPT 内容时出错：${error.message}`;
            }
          },
        });

        // 注册确认生成的辅助函数
        aibitat.function({
          super: aibitat,
          name: "ppt-confirm-generate",
          description: `确认并生成 PPT 文件。
当用户确认 PPT 内容后调用此工具生成最终的 PPTX 文件。

触发场景：
- 用户说"确认生成"、"生成 PPT"、"下载 PPT"
- 用户对内容满意，要求生成文件`,
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              dsl: {
                type: "object",
                description: "已确认的完整 PPT DSL",
              },
              filename: {
                type: "string",
                description: "文件名（可选，默认使用标题）",
              },
            },
            required: ["dsl"],
          },
          handler: async function ({ dsl, filename }) {
            try {
              if (!dsl || !dsl.slides || dsl.slides.length === 0) {
                return "请先生成 PPT 内容。";
              }

              const finalFilename =
                filename ||
                `${dsl.meta?.title || "演示文稿"}.pptx`.replace(
                  /[\\/:*?"<>|]/g,
                  "_"
                );

              this.super.introspect(`正在生成 PPT 文件：${finalFilename}...`);

              // 转换 DSL 为 pptx-generator 格式
              const slides = convertDSLToGeneratorFormat(dsl.slides);

              // 调用内置的 pptx-generator
              // P1: 传递 appendix 数据用于生成附录页
              const { generatePptx } = require("./pptx-generator");
              const buffer = await generatePptx({
                slides,
                theme: dsl.meta?.theme || "default_blue",
                title: dsl.meta?.title,
                appendix: dsl.appendix,
                includeAppendix: true,
              });
              const base64 = buffer.toString("base64");

              this.super.socket.send("fileDownload", {
                filename: finalFilename,
                b64Content: `data:application/vnd.openxmlformats-officedocument.presentationml.presentation;base64,${base64}`,
              });

              // 存档生成记录
              this.super.socket.send("pptGenerated", {
                filename: finalFilename,
                dsl,
                timestamp: Date.now(),
              });

              this.super.skipHandleExecution = true;

              return `✅ **PPT 已生成**

文件《${finalFilename}》已成功生成并下载到您的浏览器。

💡 **提示**：您可以在 PowerPoint 中打开文件，点击「设计」→「主题」套用公司模板。`;
            } catch (error) {
              this.super.handlerProps.log(
                `[ppt-confirm-generate] Error: ${error.message}`
              );
              return `生成 PPT 文件时出错：${error.message}`;
            }
          },
        });
      },
    };
  },
};

/**
 * 格式化内容用于展示
 * @param {Object} dsl - 完整 DSL
 * @returns {string}
 */
function formatContentForDisplay(dsl) {
  const { meta, slides } = dsl;

  let output = `**标题**：${meta.title}\n`;
  output += `**主题**：${meta.theme || "default_blue"}\n`;
  output += `**页数**：${slides.length} 页\n\n`;

  output += `**内容概览**：\n\n`;

  slides.forEach((slide, index) => {
    const typeIcon = getSlideTypeIcon(slide.type);
    output += `**${index + 1}. ${typeIcon} ${slide.title}**`;

    if (slide.layout) {
      output += ` (${slide.layout})`;
    }
    output += "\n";

    // 根据类型显示内容摘要
    switch (slide.type) {
      case "title":
        if (slide.subtitle) {
          output += `   副标题：${slide.subtitle}\n`;
        }
        break;
      case "bullets":
        const items = slide.bullets || slide.items || [];
        if (items.length > 0) {
          items.slice(0, 3).forEach((item) => {
            output += `   • ${item}\n`;
          });
          if (items.length > 3) {
            output += `   _...还有 ${items.length - 3} 条_\n`;
          }
        }
        break;
      case "text":
        if (slide.content) {
          const preview =
            slide.content.length > 100
              ? slide.content.slice(0, 100) + "..."
              : slide.content;
          output += `   ${preview}\n`;
        }
        break;
    }

    output += "\n";
  });

  return output;
}

/**
 * 格式化引用来源摘要
 * @param {Object} dsl - 完整 DSL
 * @returns {string}
 */
function formatSourcesSummary(dsl) {
  const allSources = [];

  // 收集所有来源
  if (dsl.slides) {
    dsl.slides.forEach((slide) => {
      if (slide.sources && Array.isArray(slide.sources)) {
        slide.sources.forEach((source) => {
          if (!allSources.find((s) => s.id === source.id)) {
            allSources.push(source);
          }
        });
      }
    });
  }

  if (dsl.appendix?.sources) {
    dsl.appendix.sources.forEach((source) => {
      if (!allSources.find((s) => s.id === source.id)) {
        allSources.push(source);
      }
    });
  }

  if (allSources.length === 0) {
    return "";
  }

  return allSources
    .map((source) => `[${source.id}] ${source.title}`)
    .join("\n");
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

/**
 * 将 DSL slides 转换为 pptx-generator 格式
 * @param {Array} slides - DSL slides
 * @returns {Array}
 */
function convertDSLToGeneratorFormat(slides) {
  return slides.map((slide) => {
    const converted = {
      type: slide.type,
      title: slide.title,
    };

    // 根据类型转换
    switch (slide.type) {
      case "title":
        if (slide.subtitle) converted.subtitle = slide.subtitle;
        break;
      case "bullets":
        // 兼容 bullets 和 items
        converted.items = slide.bullets || slide.items || [];
        break;
      case "text":
        converted.content = slide.content || "";
        break;
      case "chart":
        // P1: 支持图表渲染
        if (
          slide.chartData &&
          slide.chartData.labels &&
          slide.chartData.series
        ) {
          converted.chartType = slide.chartType || "bar";
          converted.chartData = slide.chartData;
          converted.showValues = slide.showValues;
        } else {
          // 无有效数据时降级为 text
          converted.type = "text";
          converted.content = "(图表数据未提供)";
        }
        break;
      case "table":
        // P1: 支持表格渲染
        if (
          slide.tableData &&
          slide.tableData.headers &&
          slide.tableData.rows
        ) {
          converted.tableData = slide.tableData;
        } else {
          // 无有效数据时降级为 text
          converted.type = "text";
          converted.content = "(表格数据未提供)";
        }
        break;
    }

    // 保留 layout
    if (slide.layout) converted.layout = slide.layout;

    // 保留 notes
    if (slide.notes) converted.notes = slide.notes;

    // 保留 sources（用于附录页）
    if (slide.sources) converted.sources = slide.sources;

    return converted;
  });
}

module.exports = { pptGenerateFlow };
