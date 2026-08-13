/**
 * Structured Output Plugin
 *
 * Phase J: 结构化输出 - 自动检测并转换为表格/图表
 *
 * 允许 Agent 输出结构化数据（表格、图表、卡片等），
 * 前端可以交互式渲染这些数据。
 */

const structuredOutput = {
  name: "structured-output",
  startupConfig: {
    params: {},
  },
  plugin: function () {
    return {
      name: this.name,
      setup(aibitat) {
        aibitat.function({
          super: aibitat,
          name: this.name,
          description: `输出结构化数据(JSON格式), 支持前端交互式渲染。
支持的类型:
- table: 表格数据，适用于数据对比、列表展示
- chart: 图表数据，适用于趋势分析、占比分析
- cards: 卡片列表，适用于多项目展示
- timeline: 时间线，适用于事件序列
- markdown: 富文本，适用于格式化内容

使用场景:
- 当用户要求"分析数据"、"生成报告"、"对比结果"时使用
- 当需要展示列表、排行榜、统计数据时使用
- 当需要可视化趋势、占比时使用`,
          examples: [
            {
              prompt: "分析销售数据",
              call: JSON.stringify({
                type: "table",
                title: "销售数据分析",
                data: {
                  headers: ["产品", "销售额", "增长率"],
                  rows: [
                    ["产品A", "1.2M", "15%"],
                    ["产品B", "0.8M", "8%"],
                  ],
                },
              }),
            },
            {
              prompt: "显示趋势图",
              call: JSON.stringify({
                type: "chart",
                chartType: "line",
                title: "销售趋势",
                data: {
                  labels: ["1月", "2月", "3月"],
                  datasets: [{ label: "销售额", data: [100, 120, 150] }],
                },
              }),
            },
          ],
          parameters: {
            $schema: "http://json-schema.org/draft-07/schema#",
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: ["table", "chart", "cards", "timeline", "markdown"],
                description: "输出类型",
              },
              title: {
                type: "string",
                description: "标题",
              },
              chartType: {
                type: "string",
                enum: ["line", "bar", "pie", "area"],
                description: "图表类型（仅当 type 为 chart 时需要）",
              },
              data: {
                type: "object",
                description: "结构化数据",
              },
            },
            required: ["type", "data"],
          },
          handler: async function ({ type, title, chartType, data }) {
            try {
              // 验证数据格式
              const validationError = validateData(type, data);
              if (validationError) {
                return `数据格式错误: ${validationError}`;
              }

              // 发送到前端
              if (this.super.socket) {
                this.super.socket.send(
                  JSON.stringify({
                    type: "structuredOutput",
                    data: {
                      outputType: type,
                      chartType: chartType || null,
                      title: title || null,
                      data,
                      timestamp: Date.now(),
                    },
                  })
                );
              }

              // 同时通过 introspect 显示
              this.super.introspect?.(`📊 已生成结构化输出: ${title || type}`);

              return `已成功生成 ${title || type} 结构化输出，用户可以在界面中查看和交互。`;
            } catch (error) {
              console.error("[structured-output] Error:", error);
              return `生成结构化输出失败: ${error.message}`;
            }
          },
        });
      },
    };
  },
};

/**
 * 验证数据格式
 * @param {string} type - 输出类型
 * @param {Object} data - 数据
 * @returns {string|null} - 错误信息或 null
 */
function validateData(type, data) {
  if (!data || typeof data !== "object") {
    return "data 必须是一个对象";
  }

  switch (type) {
    case "table":
      if (!Array.isArray(data.headers)) {
        return "table 类型需要 headers 数组";
      }
      if (!Array.isArray(data.rows)) {
        return "table 类型需要 rows 数组";
      }
      break;

    case "chart":
      if (!Array.isArray(data.labels)) {
        return "chart 类型需要 labels 数组";
      }
      if (!Array.isArray(data.datasets)) {
        return "chart 类型需要 datasets 数组";
      }
      for (const dataset of data.datasets) {
        if (!dataset.label || !Array.isArray(dataset.data)) {
          return "每个 dataset 需要 label 和 data 数组";
        }
      }
      break;

    case "cards":
      if (!Array.isArray(data.items)) {
        return "cards 类型需要 items 数组";
      }
      break;

    case "timeline":
      if (!Array.isArray(data.events)) {
        return "timeline 类型需要 events 数组";
      }
      break;

    case "markdown":
      if (typeof data.content !== "string") {
        return "markdown 类型需要 content 字符串";
      }
      break;

    default:
      return `不支持的类型: ${type}`;
  }

  return null;
}

module.exports = { structuredOutput };
